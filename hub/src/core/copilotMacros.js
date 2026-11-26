import { z } from 'zod';
import { interpolatePatches } from './patchSchema.js';

export const ALGORITHM_CARRIERS = Object.freeze({
  1: Object.freeze([1]),
  2: Object.freeze([1]),
  3: Object.freeze([1]),
  4: Object.freeze([1]),
  5: Object.freeze([1, 3]),
  6: Object.freeze([1, 3]),
  7: Object.freeze([1, 2, 3]),
  8: Object.freeze([1, 2, 3, 4]),
});

const mkFlavorOp = (ratio, level, attack, decay, sustain, release) =>
  Object.freeze({ ratio, level, attack, decay, sustain, release });

export const ROULETTE_FLAVORS = Object.freeze([
  Object.freeze({
    id: 'glass_bell',
    name: 'Glass Bell',
    feedback: 0.15,
    ops: Object.freeze([
      mkFlavorOp(1.0, 0.95, 0.002, 0.9, 0.25, 1.4),
      mkFlavorOp(3.5, 0.72, 0.001, 0.65, 0.12, 1.4),
      mkFlavorOp(7.0, 0.58, 0.001, 0.45, 0.05, 1.4),
      mkFlavorOp(11.0, 0.44, 0.001, 0.25, 0.0, 1.4),
    ]),
  }),
  Object.freeze({
    id: 'acid_growl',
    name: 'Acid Growl',
    feedback: 0.86,
    ops: Object.freeze([
      mkFlavorOp(1.0, 0.96, 0.002, 0.24, 0.18, 0.09),
      mkFlavorOp(2.0, 0.88, 0.001, 0.16, 0.08, 0.07),
      mkFlavorOp(3.0, 0.88, 0.001, 0.16, 0.06, 0.07),
      mkFlavorOp(4.0, 0.88, 0.001, 0.14, 0.04, 0.06),
    ]),
  }),
  Object.freeze({
    id: 'sub_punch',
    name: 'Sub Punch',
    feedback: 0.24,
    ops: Object.freeze([
      mkFlavorOp(0.5, 1.0, 0.001, 0.34, 0.38, 0.12),
      mkFlavorOp(1.0, 0.62, 0.001, 0.28, 0.1, 0.08),
      mkFlavorOp(2.0, 0.48, 0.001, 0.22, 0.05, 0.08),
      mkFlavorOp(1.0, 0.36, 0.001, 0.18, 0.0, 0.07),
    ]),
  }),
  Object.freeze({
    id: 'metallic_fm',
    name: 'Metallic FM',
    feedback: 0.78,
    ops: Object.freeze([
      mkFlavorOp(1.0, 0.94, 0.001, 0.38, 0.12, 0.25),
      mkFlavorOp(1.41, 0.86, 0.001, 0.22, 0.05, 0.18),
      mkFlavorOp(2.71, 0.78, 0.001, 0.22, 0.02, 0.15),
      mkFlavorOp(5.13, 0.7, 0.001, 0.18, 0.0, 0.12),
    ]),
  }),
  Object.freeze({
    id: 'wood_marimba',
    name: 'Wood Pluck',
    feedback: 0.18,
    ops: Object.freeze([
      mkFlavorOp(1.0, 0.95, 0.001, 0.14, 0.0, 0.08),
      mkFlavorOp(4.0, 0.74, 0.001, 0.11, 0.0, 0.06),
      mkFlavorOp(2.0, 0.52, 0.001, 0.11, 0.0, 0.06),
      mkFlavorOp(3.0, 0.4, 0.001, 0.09, 0.0, 0.05),
    ]),
  }),
  Object.freeze({
    id: 'cyber_lead',
    name: 'Cyber Lead',
    feedback: 0.62,
    ops: Object.freeze([
      mkFlavorOp(1.0, 0.92, 0.008, 0.45, 0.72, 0.22),
      mkFlavorOp(2.0, 0.82, 0.005, 0.45, 0.55, 0.2),
      mkFlavorOp(2.01, 0.76, 0.005, 0.45, 0.48, 0.2),
      mkFlavorOp(4.0, 0.64, 0.003, 0.32, 0.3, 0.16),
    ]),
  }),
  Object.freeze({
    id: 'lush_pad',
    name: 'Lush Pad',
    feedback: 0.28,
    ops: Object.freeze([
      mkFlavorOp(1.0, 0.88, 0.38, 1.4, 0.78, 1.8),
      mkFlavorOp(1.01, 0.72, 0.38, 1.2, 0.68, 1.8),
      mkFlavorOp(2.0, 0.58, 0.38, 1.1, 0.6, 1.8),
      mkFlavorOp(2.99, 0.46, 0.38, 0.9, 0.5, 1.8),
    ]),
  }),
  Object.freeze({
    id: 'electro_perc',
    name: 'Electro Zap',
    feedback: 0.74,
    ops: Object.freeze([
      mkFlavorOp(1.0, 0.96, 0.001, 0.12, 0.0, 0.05),
      mkFlavorOp(5.0, 0.9, 0.001, 0.07, 0.0, 0.04),
      mkFlavorOp(8.0, 0.84, 0.001, 0.07, 0.0, 0.04),
      mkFlavorOp(12.0, 0.78, 0.001, 0.06, 0.0, 0.03),
    ]),
  }),
  Object.freeze({
    id: 'brass_stab',
    name: 'FM Brass',
    feedback: 0.54,
    ops: Object.freeze([
      mkFlavorOp(1.0, 0.94, 0.05, 0.42, 0.68, 0.24),
      mkFlavorOp(1.0, 0.82, 0.05, 0.38, 0.62, 0.22),
      mkFlavorOp(2.0, 0.74, 0.05, 0.34, 0.52, 0.2),
      mkFlavorOp(3.0, 0.62, 0.05, 0.28, 0.4, 0.18),
    ]),
  }),
  Object.freeze({
    id: 'deep_organ',
    name: 'Deep Organ',
    feedback: 0.22,
    ops: Object.freeze([
      mkFlavorOp(1.0, 0.92, 0.001, 0.3, 0.85, 0.08),
      mkFlavorOp(2.0, 0.74, 0.001, 0.3, 0.85, 0.08),
      mkFlavorOp(3.0, 0.66, 0.001, 0.3, 0.85, 0.08),
      mkFlavorOp(4.0, 0.54, 0.001, 0.3, 0.85, 0.08),
    ]),
  }),
]);

export const MACRO_TARGETS = Object.freeze([
  'feedback',
  'op1.decay',
  'op2.level',
  'op2.ratio',
  'op2.decay',
  'op3.level',
  'op3.ratio',
  'op3.decay',
  'op4.level',
  'op4.ratio',
  'op4.decay',
]);

export const STRICT_SMART_MACRO_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    macroName: { type: 'string' },
    bindings: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'string', enum: [...MACRO_TARGETS] },
          min: { type: 'number' },
          max: { type: 'number' },
          curve: { type: 'string', enum: ['linear', 'exp'] },
        },
        required: ['target', 'min', 'max', 'curve'],
      },
    },
  },
  required: ['macroName', 'bindings'],
});

const smartMacroSchema = z.object({
  macroName: z.string().min(1),
  bindings: z
    .array(
      z.object({
        target: z.enum(MACRO_TARGETS),
        min: z.number().finite(),
        max: z.number().finite(),
        curve: z.enum(['linear', 'exp']),
      })
    )
    .length(3),
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const round4 = (value) => Math.round(value * 10000) / 10000;

const freezePatch = (patch) =>
  Object.freeze({
    ...patch,
    operators: Object.freeze(patch.operators.map((op) => Object.freeze({ ...op }))),
  });

const TARGET_BOUNDS = Object.freeze({
  feedback: [0.0, 1.0],
  level: [0.0, 1.0],
  ratio: [0.5, 16.0],
  decay: [0.001, 10.0],
});

/** Validate an AI-generated Smart Macro definition against STRICT_SMART_MACRO_SCHEMA. */
export const validateSmartMacro = (candidate) => {
  const parsed = smartMacroSchema.safeParse(candidate);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return { success: false, error: `Invalid smart macro: ${summary}` };
  }
  const frozen = Object.freeze({
    macroName: parsed.data.macroName,
    bindings: Object.freeze(
      parsed.data.bindings.map((b) => Object.freeze({ ...b }))
    ),
  });
  return { success: true, value: frozen };
};

/** Temporarily shorten modulator decays and boost feedback for aggressive offbeat grit. */
export const applyChaosEnvelope = (patch, intensity = 0.75) => {
  const amt = clamp(Number.isFinite(intensity) ? intensity : 0.75, 0, 1);
  const decayFactor = 1 - 0.65 * amt;
  const nextFeedback = round4(clamp(patch.feedback + (1.0 - patch.feedback) * (0.75 * amt), 0, 1));

  const operators = patch.operators.map((op) => {
    if (op.id === 1) {
      return Object.freeze({ ...op });
    }
    return Object.freeze({
      ...op,
      decay: round4(clamp(op.decay * decayFactor, 0.001, 10.0)),
      level: round4(clamp(op.level + (1.0 - op.level) * (0.35 * amt), 0.0, 1.0)),
    });
  });

  return freezePatch({
    ...patch,
    feedback: nextFeedback,
    operators,
  });
};

/** Switch FM routing algorithm (plus optional FM timbre flavor) with carrier loudness compensation. */
export const applyAlgorithmRoulette = (patch, nextAlgorithm, flavorId = null) => {
  const targetAlgo =
    Number.isInteger(nextAlgorithm) && nextAlgorithm >= 1 && nextAlgorithm <= 8
      ? nextAlgorithm
      : (patch.algorithm % 8) + 1;

  const prevCarriers = ALGORITHM_CARRIERS[patch.algorithm] || [1];
  const nextCarriers = ALGORITHM_CARRIERS[targetAlgo] || [1];
  const nextCarrierSet = new Set(nextCarriers);
  const flavor = flavorId ? ROULETTE_FLAVORS.find((f) => f.id === flavorId) || null : null;

  if (!flavor) {
    const gainFactor = Math.sqrt(prevCarriers.length / nextCarriers.length);
    const operators = patch.operators.map((op) => {
      if (!nextCarrierSet.has(op.id)) {
        return Object.freeze({ ...op });
      }
      return Object.freeze({
        ...op,
        level: round4(clamp(op.level * gainFactor, 0.15, 1.0)),
      });
    });

    return freezePatch({
      ...patch,
      algorithm: targetAlgo,
      operators,
    });
  }

  const carrierScale = Math.sqrt(1 / nextCarriers.length);
  const operators = patch.operators.map((op, index) => {
    const spec = flavor.ops[index] || flavor.ops[0];
    const scaledLevel = nextCarrierSet.has(op.id)
      ? clamp(spec.level * carrierScale, 0.15, 1.0)
      : clamp(spec.level, 0.0, 1.0);
    return Object.freeze({
      id: op.id,
      ratio: round4(clamp(spec.ratio, 0.5, 16.0)),
      level: round4(scaledLevel),
      attack: round4(clamp(spec.attack, 0.001, 10.0)),
      decay: round4(clamp(spec.decay, 0.001, 10.0)),
      sustain: round4(clamp(spec.sustain, 0.0, 1.0)),
      release: round4(clamp(spec.release, 0.001, 10.0)),
    });
  });

  return freezePatch({
    ...patch,
    patchName: `Algo ${targetAlgo} · ${flavor.name}`,
    algorithm: targetAlgo,
    feedback: round4(clamp(flavor.feedback, 0.0, 1.0)),
    operators,
  });
};

const applyTargetValue = (patch, target, rawValue) => {
  if (target === 'feedback') {
    const [min, max] = TARGET_BOUNDS.feedback;
    return { ...patch, feedback: round4(clamp(rawValue, min, max)) };
  }
  const [opKey, field] = target.split('.');
  const opId = Number(opKey.slice(2));
  const [min, max] = TARGET_BOUNDS[field];
  const clamped = round4(clamp(rawValue, min, max));
  return {
    ...patch,
    operators: patch.operators.map((op) =>
      op.id === opId ? { ...op, [field]: clamped } : op
    ),
  };
};

/** Apply a 0..1 macro slider position across a Smart Macro's 3 bound parameters. */
export const applySmartMacroValue = (basePatch, macro, amount) => {
  const t = clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
  const next = macro.bindings.reduce((accPatch, binding) => {
    const curved = binding.curve === 'exp' ? t * t : t;
    const value = binding.min + (binding.max - binding.min) * curved;
    return applyTargetValue(accPatch, binding.target, value);
  }, basePatch);
  return freezePatch(next);
};

/** Continuously interpolate along an ordered chain of patches using position in [0, chain.length - 1]. */
export const interpolatePatchChain = (chain, position) => {
  if (!Array.isArray(chain) || chain.length === 0) return null;
  if (chain.length === 1) return chain[0];
  const pos = clamp(Number.isFinite(position) ? position : 0, 0, chain.length - 1);
  const lowIdx = Math.floor(pos);
  const highIdx = Math.min(chain.length - 1, lowIdx + 1);
  const frac = pos - lowIdx;
  return frac === 0 ? chain[lowIdx] : interpolatePatches(chain[lowIdx], chain[highIdx], frac);
};
