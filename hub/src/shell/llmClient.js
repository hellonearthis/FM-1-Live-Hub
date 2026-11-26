import {
  STRICT_COMPOSITION_SCHEMA,
  validateComposition,
} from '../core/midiComposition.js';
import {
  MACRO_TARGETS,
  STRICT_SMART_MACRO_SCHEMA,
  validateSmartMacro,
} from '../core/copilotMacros.js';
import { FM1_SCHEMA_GUIDE, validatePatch } from '../core/patchSchema.js';
import { STRICT_PATTERN_SCHEMA, validatePattern } from '../core/patternSequencer.js';

const STRICT_FM1_JSON_SCHEMA = Object.freeze({
  type: FM1_SCHEMA_GUIDE.type,
  additionalProperties: false,
  properties: {
    ...FM1_SCHEMA_GUIDE.properties,
    operators: {
      ...FM1_SCHEMA_GUIDE.properties.operators,
      items: {
        ...FM1_SCHEMA_GUIDE.properties.operators.items,
        additionalProperties: false,
      },
    },
  },
  required: FM1_SCHEMA_GUIDE.required,
});

export const createLlmConfig = (env = process.env) =>
  Object.freeze({
    endpoint: env.FM1_LLM_URL || 'http://127.0.0.1:8888/v1/chat/completions',
    model: env.FM1_LLM_MODEL?.trim() || null,
    timeoutMs: Number(env.FM1_LLM_TIMEOUT_MS || 60000),
  });

/** Derive the OpenAI-compatible /v1/models URL from a chat completions endpoint. */
export const deriveModelsEndpoint = (chatEndpoint) => {
  if (chatEndpoint.endsWith('/chat/completions')) {
    return `${chatEndpoint.slice(0, -'/chat/completions'.length)}/models`;
  }
  const parsed = new URL(chatEndpoint);
  return `${parsed.origin}/v1/models`;
};

const stripMarkdownFences = (rawText) => {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

/** Resolve either the configured FM1_LLM_MODEL or the first active model from /v1/models. */
export const resolveModelName = async ({ config, fetchImpl = fetch }) => {
  if (config.model) {
    return { success: true, value: config.model };
  }

  const modelsUrl = deriveModelsEndpoint(config.endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(modelsUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        success: false,
        error: `Model lookup HTTP ${response.status} at ${modelsUrl}: ${response.statusText}`,
      };
    }

    const payload = await response.json();
    const models = Array.isArray(payload?.data) ? payload.data : [];
    const activeModel =
      models.find((m) => m?.loaded === true || m?.status?.value === 'loaded') || models[0];
    const firstId = activeModel?.id;
    if (typeof firstId !== 'string' || !firstId.trim()) {
      return {
        success: false,
        error: `No active model returned by ${modelsUrl}. Load a model or set FM1_LLM_MODEL.`,
      };
    }

    return { success: true, value: firstId.trim() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to query ${modelsUrl}: ${message}` };
  } finally {
    clearTimeout(timer);
  }
};

/** Request a single FM-1 patch JSON object from the local OpenAI-compatible LLM endpoint. */
export const requestPatchFromLlm = async ({
  config,
  skillPrompt,
  role,
  fetchImpl = fetch,
}) => {
  const modelResult = await resolveModelName({ config, fetchImpl });
  if (!modelResult.success) {
    return modelResult;
  }

  const prompt = [
    'System Style Rules:',
    skillPrompt,
    '',
    `Generate a concrete FM-1 patch instance (NOT a schema) specifically styled for slot role: "${role}".`,
    'Return ONLY a single JSON object with keys: {"patchName": string, "algorithm": 1..8, "feedback": 0.0..1.0, "operators": [4 objects with {"id": 1..4, "ratio": 0.5..16.0, "level": 0.0..1.0, "attack": 0.001..10.0, "decay": 0.001..10.0, "sustain": 0.0..1.0, "release": 0.001..10.0}]}.',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelResult.value,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'fm1_patch',
            strict: true,
            schema: STRICT_FM1_JSON_SCHEMA,
          },
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `LLM HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: 'LLM response missing message content.' };
    }

    const parsed = JSON.parse(stripMarkdownFences(content));
    return validatePatch(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
};

/** Ask the local LLM to choose 3 expressive parameters on `patch` for Smart Macro Assign. */
export const requestSmartMacroFromLlm = async ({
  config,
  patch,
  styleName,
  fetchImpl = fetch,
}) => {
  const modelResult = await resolveModelName({ config, fetchImpl });
  if (!modelResult.success) {
    return modelResult;
  }

  const prompt = [
    `Inspect this FM-1 synth patch (style: ${styleName || 'general'}) and choose the 3 most expressive parameters to bind to a single performance macro knob (0..100%).`,
    `Active patch: ${JSON.stringify(patch)}`,
    `Allowed targets: ${MACRO_TARGETS.join(', ')}.`,
    'Choose realistic musical min/max ranges within FM-1 bounds (feedback/level 0..1, ratio 0.5..16, decay 0.001..10) and curve ("linear" or "exp").',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelResult.value,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'fm1_smart_macro',
            strict: true,
            schema: STRICT_SMART_MACRO_SCHEMA,
          },
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Smart Macro HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: 'LLM response missing smart macro content.' };
    }

    const parsed = JSON.parse(stripMarkdownFences(content));
    return validateSmartMacro(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
};

/** Request a new 16-step MIDI note sequence styled for the active genre/prompt from the local LLM. */
export const requestPatternFromLlm = async ({
  config,
  skillPrompt,
  styleName,
  bpm = 126,
  userPrompt = '',
  fetchImpl = fetch,
}) => {
  const modelResult = await resolveModelName({ config, fetchImpl });
  if (!modelResult.success) {
    return modelResult;
  }

  const direction = typeof userPrompt === 'string' && userPrompt.trim()
    ? `User creative direction (follow closely): "${userPrompt.trim()}"`
    : 'Create an iconic, groove-driven sequence in this style.';

  const prompt = [
    skillPrompt ? `Style Context (${styleName}):\n${skillPrompt}\n` : `Music style: ${styleName || 'acid-techno'}`,
    direction,
    `Generate a catchy, rhythmic 16-step monophonic bass/lead sequence at ${bpm} BPM.`,
    'Rules: steps must have length 16; use rests (note: null) on 3-6 steps for groove; use MIDI note numbers 28..64; enable accent/slide selectively for expression; choose a descriptive patternName reflecting the style/direction.',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelResult.value,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'fm1_pattern',
            strict: true,
            schema: STRICT_PATTERN_SCHEMA,
          },
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Pattern LLM HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: 'LLM response missing pattern content.' };
    }

    const parsed = JSON.parse(stripMarkdownFences(content));
    return validatePattern(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
};

/** Generate a beat-based multi-track MIDI composition JSON guided by the FM-1 composition prompt. */
export const requestCompositionFromLlm = async ({
  config,
  promptGuide = '',
  userPrompt = '',
  target = 'skiff',
  bpm = 120,
  lengthBeats = 8,
  key = '',
  fetchImpl = fetch,
}) => {
  const modelResult = await resolveModelName({ config, fetchImpl });
  if (!modelResult.success) {
    return modelResult;
  }

  const safeTarget = String(target || 'skiff').toLowerCase() === 'atek303' ? 'atek303' : 'skiff';
  const safeBpm = Math.max(40, Math.min(240, Math.round(Number(bpm) || 120)));
  const safeBeats = Math.max(4, Math.min(64, Number(lengthBeats) || (safeTarget === 'atek303' ? 4 : 8)));
  const targetInstruction =
    safeTarget === 'atek303'
      ? 'Target hardware is ATEK303: output EXACTLY 1 monophonic track on channel 1 (role "bass" or "lead"), length_beats=4, no overlapping notes, with expressive accent and slide flags.'
      : `Target hardware is Skiff: output 2 to 4 complementary tracks on MIDI channels 1..4 (e.g. bass, lead, chord, arp) separated by octave range, length_beats=${safeBeats}.`;

  const prompt = [
    promptGuide ? `FM-1 Composition Rules:\n${promptGuide}` : '',
    `Task: Compose a musical loop at tempo_bpm=${safeBpm}, length_beats=${safeBeats}, key="${String(key || 'E Minor').trim() || 'E Minor'}".`,
    userPrompt ? `Musical brief / motif: "${userPrompt.trim()}".` : 'Style: driving electronic groove.',
    targetInstruction,
    'Always use scientific note names like "E4", "C4", "F#3", "Bb2" — NEVER raw numbers.',
    'Return ONLY a single JSON object matching STRICT_COMPOSITION_SCHEMA with no comments.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelResult.value,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'fm1_midi_composition',
            strict: true,
            schema: STRICT_COMPOSITION_SCHEMA,
          },
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Composition LLM HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: 'LLM response missing composition content.' };
    }

    const parsed = JSON.parse(stripMarkdownFences(content));
    return validateComposition(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
};

/** Refine an existing multi-track MIDI composition JSON according to user feedback. */
export const requestCompositionRefinementFromLlm = async ({
  config,
  promptGuide = '',
  currentComposition,
  feedback,
  fetchImpl = fetch,
}) => {
  const modelResult = await resolveModelName({ config, fetchImpl });
  if (!modelResult.success) {
    return modelResult;
  }

  const prompt = [
    promptGuide ? `FM-1 Composition Rules:\n${promptGuide}` : '',
    `Current composition JSON:\n${JSON.stringify(currentComposition)}`,
    `Requested refinement / edit: "${String(feedback || '').trim()}"`,
    'Apply the requested edit while keeping scientific note names ("E4", "F#3"), clean beat subdivisions, valid track channels (1..4), and musical rests.',
    'Return ONLY the updated JSON object.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelResult.value,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'fm1_midi_composition',
            strict: true,
            schema: STRICT_COMPOSITION_SCHEMA,
          },
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Composition Refine HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: 'LLM response missing refined composition content.' };
    }

    const parsed = JSON.parse(stripMarkdownFences(content));
    return validateComposition(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
};

/** Refine an existing 16-step pattern according to user feedback (e.g. "calmer", "more energetic", "more Devo style"). */
export const requestPatternRefinementFromLlm = async ({
  config,
  currentPattern,
  feedback,
  styleName,
  bpm,
  fetchImpl = fetch,
}) => {
  const modelResult = await resolveModelName({ config, fetchImpl });
  if (!modelResult.success) {
    return modelResult;
  }

  const targetBpm = Number.isFinite(Number(bpm)) ? Number(bpm) : currentPattern.bpm;
  const prompt = [
    `Refine this existing 16-step FM-1 sequence (active style: ${styleName || 'general'}, target BPM: ${targetBpm}).`,
    `Current pattern JSON: ${JSON.stringify(currentPattern)}`,
    `User feedback / requested change: "${String(feedback || '').trim()}"`,
    'Preserve the core musical DNA while clearly applying the feedback (e.g., calmer = sparser notes, lower velocities, fewer accents/slides; more energetic = busier 16ths, higher velocities, octave leaps, more accents/slides; style shift = adapt intervals/rhythm to that artist/genre).',
    'Give the refined pattern a new descriptive patternName and keep steps length = 16.',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelResult.value,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'fm1_pattern',
            strict: true,
            schema: STRICT_PATTERN_SCHEMA,
          },
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Pattern Refine HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: 'LLM response missing refined pattern content.' };
    }

    const parsed = JSON.parse(stripMarkdownFences(content));
    return validatePattern(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
};
