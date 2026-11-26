import { z } from 'zod';

export const STRICT_PATTERN_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    patternName: { type: 'string' },
    bpm: { type: 'integer', minimum: 60, maximum: 180 },
    rootKey: { type: 'string' },
    steps: {
      type: 'array',
      minItems: 16,
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          note: { type: ['integer', 'null'], minimum: 24, maximum: 84 },
          velocity: { type: 'integer', minimum: 1, maximum: 127 },
          accent: { type: 'boolean' },
          slide: { type: 'boolean' },
        },
        required: ['note', 'velocity', 'accent', 'slide'],
      },
    },
  },
  required: ['patternName', 'bpm', 'rootKey', 'steps'],
});

const stepSchema = z.object({
  note: z.number().int().min(24).max(84).nullable(),
  velocity: z.number().int().min(1).max(127),
  accent: z.boolean(),
  slide: z.boolean(),
});

const patternSchema = z.object({
  patternName: z.string().min(1),
  bpm: z.number().int().min(60).max(180),
  rootKey: z.string().min(1),
  steps: z.array(stepSchema).length(16),
});

const freezePattern = (pattern) =>
  Object.freeze({
    ...pattern,
    steps: Object.freeze(pattern.steps.map((s) => Object.freeze({ ...s }))),
  });

/** Validate a 16-step pattern object against STRICT_PATTERN_SCHEMA. */
export const validatePattern = (candidate) => {
  const parsed = patternSchema.safeParse(candidate);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return { success: false, error: `Invalid FM-1 pattern: ${summary}` };
  }
  return { success: true, value: freezePattern(parsed.data) };
};

const mkStep = (note, velocity = 96, accent = false, slide = false) =>
  Object.freeze({ note, velocity, accent, slide });

const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));

const normalizeStepNote = (note) => {
  if (note === null || note === undefined) return null;
  const rounded = Math.round(Number(note));
  if (!Number.isFinite(rounded)) return null;
  return clampInt(rounded, 24, 84);
};

/** Create an empty 16-step rest pattern ready for step or live MIDI recording. */
export const createBlankPattern = (
  patternName = 'Blank Pattern',
  bpm = 124,
  rootKey = 'C minor'
) => {
  const safeName = String(patternName || 'Blank Pattern').trim() || 'Blank Pattern';
  const safeBpm = clampInt(Number(bpm) || 124, 60, 180);
  const safeKey = String(rootKey || 'C minor').trim() || 'C minor';
  return freezePattern({
    patternName: safeName,
    bpm: safeBpm,
    rootKey: safeKey,
    steps: Array.from({ length: 16 }, () => mkStep(null, 96, false, false)),
  });
};

/** Return a new pattern with one step replaced by a MIDI note (or cleared with null). */
export const recordNoteAtStep = (
  pattern,
  stepIndex,
  note,
  velocity = 100,
  { accent = false, slide = false } = {}
) => {
  const idx = clampInt(Number(stepIndex) || 0, 0, 15);
  const nextNote = normalizeStepNote(note);
  const nextVelocity = clampInt(Number(velocity) || 100, 1, 127);
  const nextStep = mkStep(nextNote, nextVelocity, Boolean(accent), Boolean(slide));
  return freezePattern({
    ...pattern,
    steps: pattern.steps.map((s, i) => (i === idx ? nextStep : s)),
  });
};

/**
 * Quantize a live note played `elapsedMs` after `currentStep` started to the nearest 16th step.
 * Returns { stepIndex, snappedToNext } so early hits snap forward without double-triggering.
 */
export const quantizeLiveStep = (currentStep, elapsedMs, stepMs) => {
  const baseStep = ((Math.trunc(Number(currentStep) || 0) % 16) + 16) % 16;
  const safeStepMs = Math.max(1, Number(stepMs) || 125);
  const safeElapsed = Math.max(0, Number(elapsedMs) || 0);
  const snappedToNext = safeElapsed >= safeStepMs * 0.5;
  const stepIndex = snappedToNext ? (baseStep + 1) % 16 : baseStep;
  return Object.freeze({ stepIndex, snappedToNext });
};

export const STARTER_PATTERNS = Object.freeze([
  Object.freeze({
    id: 'acid_303_classic',
    builtin: true,
    style: 'chicago-acid-house',
    pattern: freezePattern({
      patternName: 'Acid 303 Classic',
      bpm: 124,
      rootKey: 'D minor',
      steps: [
        mkStep(38, 120, true, false),
        mkStep(null, 90, false, false),
        mkStep(50, 100, false, true),
        mkStep(38, 90, false, false),
        mkStep(41, 115, true, false),
        mkStep(null, 85, false, false),
        mkStep(45, 95, false, true),
        mkStep(38, 90, false, false),
        mkStep(38, 122, true, false),
        mkStep(48, 100, false, true),
        mkStep(50, 110, true, false),
        mkStep(null, 85, false, false),
        mkStep(41, 105, false, false),
        mkStep(45, 95, false, true),
        mkStep(38, 90, false, false),
        mkStep(48, 115, true, true),
      ],
    }),
  }),
  Object.freeze({
    id: 'bond_spy_vamp',
    builtin: true,
    style: 'house',
    pattern: freezePattern({
      patternName: 'Bond Spy Vamp',
      bpm: 128,
      rootKey: 'E minor',
      steps: [
        mkStep(28, 120, true, false),
        mkStep(null, 90, false, false),
        mkStep(35, 100, false, false),
        mkStep(null, 90, false, false),
        mkStep(28, 110, false, false),
        mkStep(null, 90, false, false),
        mkStep(36, 112, true, true),
        mkStep(null, 90, false, false),
        mkStep(28, 120, true, false),
        mkStep(null, 90, false, false),
        mkStep(37, 110, false, true),
        mkStep(null, 90, false, false),
        mkStep(28, 110, false, false),
        mkStep(null, 90, false, false),
        mkStep(36, 115, true, true),
        mkStep(35, 95, false, false),
      ],
    }),
  }),
  Object.freeze({
    id: 'bach_bwv847_cm',
    builtin: true,
    style: 'detroit-techno',
    pattern: freezePattern({
      patternName: 'Bach BWV 847 Cm',
      bpm: 134,
      rootKey: 'C minor',
      steps: [
        mkStep(48, 118, true, false),
        mkStep(51, 92, false, false),
        mkStep(50, 96, false, false),
        mkStep(51, 92, false, false),
        mkStep(48, 110, true, false),
        mkStep(51, 90, false, false),
        mkStep(48, 95, false, false),
        mkStep(51, 102, false, true),
        mkStep(36, 122, true, true),
        mkStep(51, 92, false, false),
        mkStep(50, 96, false, false),
        mkStep(51, 92, false, false),
        mkStep(36, 110, true, false),
        mkStep(51, 102, false, true),
        mkStep(48, 96, false, false),
        mkStep(51, 106, false, true),
      ],
    }),
  }),
  Object.freeze({
    id: 'warehouse_phrygian',
    builtin: true,
    style: 'industrial-techno',
    pattern: freezePattern({
      patternName: 'Warehouse Phrygian',
      bpm: 138,
      rootKey: 'C Phrygian',
      steps: [
        mkStep(24, 127, true, false),
        mkStep(24, 90, false, false),
        mkStep(36, 110, false, true),
        mkStep(24, 92, false, false),
        mkStep(25, 122, true, false),
        mkStep(24, 90, false, false),
        mkStep(31, 108, false, true),
        mkStep(24, 92, false, false),
        mkStep(24, 125, true, false),
        mkStep(37, 112, true, true),
        mkStep(24, 90, false, false),
        mkStep(25, 104, false, false),
        mkStep(31, 118, true, false),
        mkStep(24, 90, false, false),
        mkStep(36, 115, false, true),
        mkStep(25, 100, false, true),
      ],
    }),
  }),
]);

/** Create an initial pure sequencer state from a list of pattern records. */
export const createInitialSequencerState = (patterns = STARTER_PATTERNS) =>
  Object.freeze({
    playing: false,
    bpm: patterns[0]?.pattern.bpm ?? 124,
    currentStep: 0,
    activePatternId: patterns[0]?.id ?? null,
    queuedPatternId: null,
    patterns: Object.freeze([...patterns]),
  });

/** Switch immediately when stopped, or queue for Step 0 when playing. */
export const queuePatternSwitch = (state, patternId) => {
  const exists = state.patterns.some((p) => p.id === patternId);
  if (!exists) {
    return state;
  }
  if (!state.playing) {
    const target = state.patterns.find((p) => p.id === patternId);
    return Object.freeze({
      ...state,
      activePatternId: patternId,
      queuedPatternId: null,
      bpm: target?.pattern.bpm ?? state.bpm,
    });
  }
  if (patternId === state.activePatternId) {
    return Object.freeze({ ...state, queuedPatternId: null });
  }
  return Object.freeze({
    ...state,
    queuedPatternId: patternId,
  });
};

/** Advance one 16th-note step; commits queuedPatternId cleanly when wrapping to Step 0. */
export const advanceStep = (state) => {
  const nextStepIndex = (state.currentStep + 1) % 16;
  const wrappedToStart = nextStepIndex === 0;
  const shouldCommitSwitch = wrappedToStart && state.queuedPatternId !== null;

  const nextActiveId = shouldCommitSwitch ? state.queuedPatternId : state.activePatternId;
  const nextQueuedId = shouldCommitSwitch ? null : state.queuedPatternId;
  const activeEntry = state.patterns.find((p) => p.id === nextActiveId) ?? state.patterns[0];
  const stepData = activeEntry?.pattern.steps[nextStepIndex] ?? null;

  const nextState = Object.freeze({
    ...state,
    currentStep: nextStepIndex,
    activePatternId: nextActiveId,
    queuedPatternId: nextQueuedId,
    bpm: shouldCommitSwitch && activeEntry ? activeEntry.pattern.bpm : state.bpm,
  });

  return {
    nextState,
    switchedToPatternId: shouldCommitSwitch ? nextActiveId : null,
    stepIndex: nextStepIndex,
    stepData,
  };
};
