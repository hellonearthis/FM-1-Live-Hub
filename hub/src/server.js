import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createDebugLog } from './shell/debugLog.js';
import { createDeckController } from './shell/deckController.js';
import { startFastPathServer } from './shell/fastPathHttp.js';
import { createFm1Launcher } from './shell/fm1Process.js';
import {
  createLlmConfig,
  requestPatternFromLlm,
  requestPatternRefinementFromLlm,
} from './shell/llmClient.js';
import { createPatchStore } from './shell/patchStore.js';
import { createPatternStore } from './shell/patternStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(__dirname, '..');
const FM1_ROOT = path.resolve(HUB_ROOT, '..');
const SKILLS_DIR = path.join(HUB_ROOT, 'skills');
const PATCHES_DIR = path.join(HUB_ROOT, 'patches');
const PATTERNS_DIR = path.join(HUB_ROOT, 'patterns');

const debugLog = createDebugLog();
const llmConfig = createLlmConfig();
const controller = createDeckController({
  skillsDir: SKILLS_DIR,
  llmConfig,
  debugLog,
});
const fm1Launcher = createFm1Launcher({ rootDir: FM1_ROOT, debugLog });
const patchStore = createPatchStore({ patchesDir: PATCHES_DIR, debugLog });
const patternStore = createPatternStore({ patternsDir: PATTERNS_DIR, debugLog });

const server = new Server(
  { name: 'fm1-hub-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

const TOOL_DEFINITIONS = [
  {
    name: 'list_music_styles',
    description: 'List available Markdown music style skills in hub/skills/.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_music_style',
    description: 'Load a dynamic Markdown style skill file and pre-warm the 4-slot patch deck cache.',
    inputSchema: {
      type: 'object',
      properties: {
        styleName: { type: 'string', description: 'Skill name without .md (e.g. cyberpunk-electro, acid-techno)' },
        waitForWarm: { type: 'boolean', description: 'Wait for all 4 slots to finish warming before returning (default false)' },
      },
      required: ['styleName'],
    },
  },
  {
    name: 'trigger_cached_patch',
    description: 'Instantly apply a pre-warmed slot patch from memory (0ms) and trigger a background refill.',
    inputSchema: {
      type: 'object',
      properties: {
        slotId: { type: 'integer', minimum: 0, maximum: 3, description: '0: Bassline, 1: Lead/Pluck, 2: Pad, 3: Wild-card' },
      },
      required: ['slotId'],
    },
  },
  {
    name: 'get_deck_status',
    description: 'Inspect the active style, generation epoch, and readiness/warming status of all 4 deck slots.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_active_patch',
    description: 'Return the current unified FM-1 active patch JSON state.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'morph_patch_with_slot',
    description: 'Crossfade (interpolate) the active patch toward a cached slot patch by amount (0.0 to 1.0).',
    inputSchema: {
      type: 'object',
      properties: {
        slotId: { type: 'integer', minimum: 0, maximum: 3 },
        amount: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['slotId', 'amount'],
    },
  },
  {
    name: 'apply_harmonic_drift',
    description: 'Nudge non-carrier modulator ratios (Ops 2-4) by deltaRatio while keeping carrier Op 1 locked.',
    inputSchema: {
      type: 'object',
      properties: {
        deltaRatio: { type: 'number', minimum: -2.0, maximum: 2.0 },
      },
      required: ['deltaRatio'],
    },
  },
  {
    name: 'engage_chaos_envelope',
    description: 'Temporarily shorten modulator decays and boost feedback (hold behavior; call release_chaos_envelope to snap back).',
    inputSchema: {
      type: 'object',
      properties: {
        intensity: { type: 'number', minimum: 0, maximum: 1, description: '0..1 intensity (default 0.75)' },
      },
    },
  },
  {
    name: 'release_chaos_envelope',
    description: 'Snap activePatch back cleanly to the pre-Chaos snapshot.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'algorithm_roulette',
    description: 'Switch FM algorithm (1-8) with automatic carrier gain compensation.',
    inputSchema: {
      type: 'object',
      properties: {
        algorithm: { type: 'integer', minimum: 1, maximum: 8, description: 'Optional target algorithm; random different algorithm if omitted' },
      },
    },
  },
  {
    name: 'assign_smart_macro',
    description: 'Ask the local LLM to choose the 3 most expressive parameters on activePatch and bind them to a single Smart Macro slider.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_smart_macro_value',
    description: 'Set the assigned Smart Macro slider position (0.0 to 1.0) across its 3 bound parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['amount'],
    },
  },
  {
    name: 'list_snap_fx',
    description: 'List all 20 momentary genre Snap FX pads (House, Acid House, Trance, Electro, Dub, Industrial, Synthwave, DnB, etc.).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'engage_snap_fx',
    description: 'Temporarily apply one of the 20 Snap FX presets; call release_snap_fx to snap back.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Snap FX id from list_snap_fx (e.g. acid_squelch, trance_gate, electro_zap)' },
        intensity: { type: 'number', minimum: 0, maximum: 1, description: '0..1 intensity (default 1.0)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'release_snap_fx',
    description: 'Release the active momentary Snap FX and restore the pre-FX patch snapshot.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_favorite_patches',
    description: 'List saved favorite FM-1 patches stored on disk in hub/patches/.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save_favorite_patch',
    description: 'Save the current activePatch to hub/patches/ as a reusable favorite JSON preset.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional custom patch name override' },
      },
    },
  },
  {
    name: 'load_favorite_patch',
    description: 'Load a saved favorite patch by id from hub/patches/ and promote it to activePatch.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Favorite patch id from list_favorite_patches' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_patterns',
    description: 'List all 16-step note sequences (starter patterns + AI/custom patterns saved in hub/patterns/).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'generate_ai_pattern',
    description: 'Generate a new 16-step MIDI note sequence via Unsloth matching the active style or custom artist/genre prompt (e.g. "Bach", "Devo") and save it to hub/patterns/.',
    inputSchema: {
      type: 'object',
      properties: {
        bpm: { type: 'integer', minimum: 60, maximum: 180, description: 'Target tempo in BPM (default 126)' },
        prompt: { type: 'string', description: 'Optional creative direction or style (e.g. "in the style of Bach", "Devo synth-punk")' },
      },
    },
  },
  {
    name: 'refine_ai_pattern',
    description: 'Refine an existing 16-step pattern using natural feedback (e.g. "calmer", "more energetic", "more Devo style") and save the variation.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'Pattern id from list_patterns' },
        feedback: { type: 'string', description: 'Refinement comment (e.g. "calmer", "more energetic", "more Bach baroque")' },
        bpm: { type: 'integer', minimum: 60, maximum: 180, description: 'Optional target BPM' },
      },
      required: ['patternId', 'feedback'],
    },
  },
];

const textResult = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  switch (name) {
    case 'list_music_styles': {
      const styles = await controller.listStyles();
      return textResult({
        styles,
        llmEndpoint: llmConfig.endpoint,
        llmModel: llmConfig.model ?? 'auto (from /v1/models)',
      });
    }
    case 'set_music_style': {
      const result = await controller.loadStyle(args.styleName, {
        waitForWarm: Boolean(args.waitForWarm),
      });
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'trigger_cached_patch': {
      const result = controller.triggerSlot(Number(args.slotId));
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'get_deck_status': {
      return textResult(controller.getStatus());
    }
    case 'get_active_patch': {
      return textResult(controller.getActivePatch());
    }
    case 'morph_patch_with_slot': {
      const result = controller.morphWithSlot(Number(args.slotId), Number(args.amount));
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'apply_harmonic_drift': {
      const result = controller.applyHarmonicDrift(Number(args.deltaRatio));
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'engage_chaos_envelope': {
      const result = controller.engageChaos(args.intensity !== undefined ? Number(args.intensity) : 0.75);
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'release_chaos_envelope': {
      const result = controller.releaseChaos();
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'algorithm_roulette': {
      const algo = args.algorithm !== undefined ? Number(args.algorithm) : undefined;
      const result = controller.triggerAlgorithmRoulette(algo);
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'assign_smart_macro': {
      const result = await controller.assignSmartMacro();
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'set_smart_macro_value': {
      const result = controller.setSmartMacroAmount(Number(args.amount));
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'list_snap_fx': {
      return textResult({
        effects: controller.listSnapFx(),
        activeSnapFxId: controller.getMacroState().activeSnapFxId,
      });
    }
    case 'engage_snap_fx': {
      const intensity = args.intensity !== undefined ? Number(args.intensity) : 1.0;
      const result = controller.engageSnapFx(args.id, intensity);
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'release_snap_fx': {
      const result = controller.releaseSnapFx();
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'list_favorite_patches': {
      return textResult({ favorites: await patchStore.listFavorites() });
    }
    case 'save_favorite_patch': {
      const result = await patchStore.saveFavorite(controller.getActivePatch(), {
        style: controller.getStatus().style,
        name: args.name,
      });
      return result.success ? textResult(result.value) : textResult(result.error, true);
    }
    case 'load_favorite_patch': {
      const loaded = await patchStore.loadFavorite(args.id);
      if (!loaded.success) {
        return textResult(loaded.error, true);
      }
      const applied = controller.applyExternalPatch(loaded.value, 'favorite');
      return applied.success ? textResult(applied.value) : textResult(applied.error, true);
    }
    case 'list_patterns': {
      return textResult({ patterns: await patternStore.listPatterns() });
    }
    case 'generate_ai_pattern': {
      const bpm = args.bpm !== undefined ? Number(args.bpm) : 126;
      const userPrompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
      const styleName = controller.getStatus().style;
      const gen = await requestPatternFromLlm({
        config: llmConfig,
        skillPrompt: controller.getActiveSkillPrompt(),
        styleName,
        bpm,
        userPrompt,
      });
      if (!gen.success) {
        return textResult(gen.error, true);
      }
      const saved = await patternStore.savePattern(gen.value, { style: userPrompt || styleName });
      return saved.success ? textResult(saved.value) : textResult(saved.error, true);
    }
    case 'refine_ai_pattern': {
      const allPatterns = await patternStore.listPatterns();
      const target = allPatterns.find((p) => p.id === args.patternId);
      if (!target) {
        return textResult(`Pattern "${args.patternId}" not found.`, true);
      }
      const styleName = controller.getStatus().style;
      const bpm = args.bpm !== undefined ? Number(args.bpm) : target.pattern.bpm;
      const refined = await requestPatternRefinementFromLlm({
        config: llmConfig,
        currentPattern: target.pattern,
        feedback: args.feedback,
        styleName,
        bpm,
      });
      if (!refined.success) {
        return textResult(refined.error, true);
      }
      const saved = await patternStore.savePattern(refined.value, { style: args.feedback });
      return saved.success ? textResult(saved.value) : textResult(saved.error, true);
    }
    default:
      return textResult(`Unknown tool: ${name}`, true);
  }
});

if (process.env.FM1_DISABLE_HTTP !== '1') {
  startFastPathServer(controller, undefined, { fm1Launcher, patchStore, patternStore, llmConfig, debugLog });
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[fm1-hub] MCP stdio server ready (LLM: ${llmConfig.endpoint}, model: ${llmConfig.model ?? 'auto'})`
);
