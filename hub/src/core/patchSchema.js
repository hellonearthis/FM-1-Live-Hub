import { z } from 'zod';

export const FM1_SCHEMA_GUIDE = Object.freeze({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    patchName: { type: 'string' },
    algorithm: { type: 'integer', minimum: 1, maximum: 8 },
    feedback: { type: 'number', minimum: 0.0, maximum: 1.0 },
    operators: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer', minimum: 1, maximum: 4 },
          ratio: { type: 'number', minimum: 0.5, maximum: 16.0 },
          level: { type: 'number', minimum: 0.0, maximum: 1.0 },
          attack: { type: 'number', minimum: 0.001, maximum: 10.0 },
          decay: { type: 'number', minimum: 0.001, maximum: 10.0 },
          sustain: { type: 'number', minimum: 0.0, maximum: 1.0 },
          release: { type: 'number', minimum: 0.001, maximum: 10.0 },
        },
        required: ['id', 'ratio', 'level', 'attack', 'decay', 'sustain', 'release'],
      },
    },
  },
  required: ['patchName', 'algorithm', 'feedback', 'operators'],
});

const operatorSchema = z.object({
  id: z.number().int().min(1).max(4),
  ratio: z.number().min(0.5).max(16.0),
  level: z.number().min(0.0).max(1.0),
  attack: z.number().min(0.001).max(10.0),
  decay: z.number().min(0.001).max(10.0),
  sustain: z.number().min(0.0).max(1.0),
  release: z.number().min(0.001).max(10.0),
});

const patchSchema = z.object({
  patchName: z.string().min(1),
  algorithm: z.number().int().min(1).max(8),
  feedback: z.number().min(0.0).max(1.0),
  operators: z.array(operatorSchema).length(4),
});

const deepFreezePatch = (patch) =>
  Object.freeze({
    ...patch,
    operators: Object.freeze(patch.operators.map((op) => Object.freeze({ ...op }))),
  });

export const DEFAULT_PATCH = deepFreezePatch({
  patchName: 'Init Cyber Bass',
  algorithm: 2,
  feedback: 0.55,
  operators: [
    { id: 1, ratio: 1.0, level: 0.95, attack: 0.001, decay: 0.25, sustain: 0.2, release: 0.1 },
    { id: 2, ratio: 2.0, level: 0.72, attack: 0.001, decay: 0.2, sustain: 0.15, release: 0.08 },
    { id: 3, ratio: 1.41, level: 0.58, attack: 0.002, decay: 0.18, sustain: 0.1, release: 0.06 },
    { id: 4, ratio: 3.5, level: 0.42, attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.05 },
  ],
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const round4 = (value) => Math.round(value * 10000) / 10000;

const lerp = (a, b, t) => a + (b - a) * t;

/** Validate an arbitrary candidate object against the FM-1 patch schema. */
export const validatePatch = (candidate) => {
  const parsed = patchSchema.safeParse(candidate);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    return { success: false, error: `Invalid FM-1 patch: ${summary}` };
  }
  return { success: true, value: deepFreezePatch(parsed.data) };
};

/** Linearly interpolate two FM-1 patches by amount clamped to [0, 1]. */
export const interpolatePatches = (patchA, patchB, amount) => {
  const t = clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
  const operators = patchA.operators.map((opA, idx) => {
    const opB = patchB.operators[idx] ?? opA;
    return Object.freeze({
      id: opA.id,
      ratio: round4(clamp(lerp(opA.ratio, opB.ratio, t), 0.5, 16.0)),
      level: round4(clamp(lerp(opA.level, opB.level, t), 0.0, 1.0)),
      attack: round4(clamp(lerp(opA.attack, opB.attack, t), 0.001, 10.0)),
      decay: round4(clamp(lerp(opA.decay, opB.decay, t), 0.001, 10.0)),
      sustain: round4(clamp(lerp(opA.sustain, opB.sustain, t), 0.0, 1.0)),
      release: round4(clamp(lerp(opA.release, opB.release, t), 0.001, 10.0)),
    });
  });

  return deepFreezePatch({
    patchName: t < 0.5 ? patchA.patchName : patchB.patchName,
    algorithm: t < 0.5 ? patchA.algorithm : patchB.algorithm,
    feedback: round4(clamp(lerp(patchA.feedback, patchB.feedback, t), 0.0, 1.0)),
    operators,
  });
};

/** Nudge modulator operators (id !== 1) by deltaRatio while keeping carrier Op 1 locked. */
export const nudgeModulators = (patch, deltaRatio) => {
  const delta = Number.isFinite(deltaRatio) ? deltaRatio : 0;
  const operators = patch.operators.map((op) => {
    if (op.id === 1) {
      return Object.freeze({ ...op });
    }
    return Object.freeze({
      ...op,
      ratio: round4(clamp(op.ratio + delta, 0.5, 16.0)),
    });
  });

  return deepFreezePatch({
    ...patch,
    operators,
  });
};
