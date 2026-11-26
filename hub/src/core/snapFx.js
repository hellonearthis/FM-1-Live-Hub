import { applyChaosEnvelope } from './copilotMacros.js';

export const SNAP_FX_LIST = Object.freeze([
  Object.freeze({ id: 'chaos_envelope', name: 'Chaos Envelope', style: 'Industrial', accent: '#ef4444' }),
  Object.freeze({ id: 'acid_squelch', name: 'Acid Squelch', style: 'Acid House', accent: '#eab308' }),
  Object.freeze({ id: 'acid_octave_jump', name: 'Acid Octave', style: 'Acid House', accent: '#f59e0b' }),
  Object.freeze({ id: 'house_stab', name: 'House Stab', style: 'House', accent: '#22c55e' }),
  Object.freeze({ id: 'uk_garage_pluck', name: 'UKG Pluck', style: 'House', accent: '#10b981' }),
  Object.freeze({ id: 'trance_gate', name: 'Trance Gate', style: 'Trance', accent: '#38bdf8' }),
  Object.freeze({ id: 'trance_supersaw', name: 'Trance Wash', style: 'Trance', accent: '#0ea5e9' }),
  Object.freeze({ id: 'electro_zap', name: 'Electro Zap', style: 'Electro', accent: '#a855f7' }),
  Object.freeze({ id: 'electro_robot', name: 'Electro Robot', style: 'Electro', accent: '#c084fc' }),
  Object.freeze({ id: 'dub_chord_wash', name: 'Dub Chord', style: 'Dub Techno', accent: '#14b8a6' }),
  Object.freeze({ id: 'warehouse_sub', name: 'Warehouse Sub', style: 'Techno', accent: '#64748b' }),
  Object.freeze({ id: 'detroit_strings', name: 'Detroit Strings', style: 'Detroit', accent: '#6366f1' }),
  Object.freeze({ id: 'metallic_clang', name: 'Metallic Clang', style: 'Industrial', accent: '#f97316' }),
  Object.freeze({ id: 'rave_hoover', name: 'Rave Hoover', style: '90s Rave', accent: '#ec4899' }),
  Object.freeze({ id: 'gabber_overdrive', name: 'Overdrive Slam', style: 'Hard Techno', accent: '#dc2626' }),
  Object.freeze({ id: 'ghost_whisper', name: 'Ghost Filter', style: 'Breakdown', accent: '#94a3b8' }),
  Object.freeze({ id: 'synthwave_brass', name: 'Synthwave Brass', style: 'Synthwave', accent: '#f43f5e' }),
  Object.freeze({ id: 'dnb_reese', name: 'DnB Reese', style: 'Drum & Bass', accent: '#84cc16' }),
  Object.freeze({ id: 'devo_angular', name: 'Devo Angular', style: 'Synth-Punk', accent: '#facc15' }),
  Object.freeze({ id: 'ambient_shimmer', name: 'Bell Shimmer', style: 'Ambient', accent: '#67e8f9' }),
  Object.freeze({ id: 'breakbeat_organ', name: 'Breakbeat Organ', style: 'Breakbeat', accent: '#3b82f6' }),
  Object.freeze({ id: 'psytrance_fm_zap', name: 'Psy FM Laser', style: 'Psytrance', accent: '#d946ef' }),
  Object.freeze({ id: 'italo_oct_bass', name: 'Italo Oct Bass', style: 'Italo Disco', accent: '#fb7185' }),
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round4 = (value) => Math.round(value * 10000) / 10000;
const lerp = (a, b, t) => a + (b - a) * t;

const freezePatch = (patch) =>
  Object.freeze({
    ...patch,
    operators: Object.freeze(patch.operators.map((op) => Object.freeze({ ...op }))),
  });

const mapOps = (patch, mapper) =>
  freezePatch({
    ...patch,
    operators: patch.operators.map((op) => Object.freeze(mapper(op))),
  });

const clampOp = (op) => ({
  id: op.id,
  ratio: round4(clamp(op.ratio, 0.5, 16.0)),
  level: round4(clamp(op.level, 0.0, 1.0)),
  attack: round4(clamp(op.attack, 0.001, 10.0)),
  decay: round4(clamp(op.decay, 0.001, 10.0)),
  sustain: round4(clamp(op.sustain, 0.0, 1.0)),
  release: round4(clamp(op.release, 0.001, 10.0)),
});

/** Transform an FM-1 patch momentarily for any of the 23 Snap FX pads. */
export const applySnapFx = (patch, fxId, intensity = 1.0) => {
  const t = clamp(Number.isFinite(intensity) ? intensity : 1.0, 0, 1);

  switch (fxId) {
    case 'chaos_envelope':
      return { success: true, value: applyChaosEnvelope(patch, 0.75 * t) };

    case 'acid_squelch':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 3, feedback: round4(lerp(patch.feedback, 0.88, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, decay: lerp(op.decay, 0.24, t), sustain: lerp(op.sustain, 0.12, t) }
                : { ...op, ratio: op.id === 2 ? 2.0 : 3.0, level: lerp(op.level, 0.92, t), decay: lerp(op.decay, 0.18, t) }
            )
        ),
      };

    case 'acid_octave_jump':
      return {
        success: true,
        value: mapOps(
          { ...patch, feedback: round4(lerp(patch.feedback, 0.72, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: round4(lerp(op.ratio, 2.0, t)) }
                : { ...op, ratio: op.ratio * (1 + t), level: lerp(op.level, 0.8, t) }
            )
        ),
      };

    case 'house_stab':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 5, feedback: round4(lerp(patch.feedback, 0.42, t)) },
          (op) =>
            clampOp({
              ...op,
              ratio: op.id === 1 ? 1.0 : op.id === 3 ? 1.5 : 2.0,
              attack: 0.001,
              decay: lerp(op.decay, 0.14, t),
              sustain: lerp(op.sustain, 0.05, t),
              release: 0.06,
            })
        ),
      };

    case 'uk_garage_pluck':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 6, feedback: round4(lerp(patch.feedback, 0.35, t)) },
          (op) =>
            clampOp({
              ...op,
              ratio: op.id === 1 ? 1.0 : op.id === 2 ? 4.0 : 2.0,
              attack: 0.001,
              decay: lerp(op.decay, 0.09, t),
              sustain: 0.0,
              release: 0.04,
            })
        ),
      };

    case 'trance_gate':
      return {
        success: true,
        value: mapOps(
          { ...patch, feedback: round4(lerp(patch.feedback, 0.48, t)) },
          (op) =>
            clampOp({
              ...op,
              attack: 0.001,
              decay: lerp(op.decay, 0.07, t),
              sustain: 0.0,
              release: 0.03,
            })
        ),
      };

    case 'trance_supersaw':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 7, feedback: round4(lerp(patch.feedback, 0.65, t)) },
          (op) =>
            clampOp({
              ...op,
              ratio: op.id === 1 ? 1.0 : 1.0 + op.id * 0.015,
              level: lerp(op.level, 0.85, t),
              attack: lerp(op.attack, 0.12, t),
              sustain: lerp(op.sustain, 0.85, t),
              release: lerp(op.release, 0.9, t),
            })
        ),
      };

    case 'electro_zap':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 2, feedback: round4(lerp(patch.feedback, 0.78, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: 1.0, decay: 0.12, sustain: 0.0 }
                : { ...op, ratio: 5.0 + op.id * 1.5, level: 0.95, attack: 0.001, decay: 0.06, sustain: 0.0 }
            )
        ),
      };

    case 'electro_robot':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 4, feedback: round4(lerp(patch.feedback, 0.62, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: 1.0 }
                : { ...op, ratio: op.id === 2 ? 1.41 : op.id === 3 ? 2.82 : 3.5, level: 0.82 }
            )
        ),
      };

    case 'dub_chord_wash':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 5, feedback: round4(lerp(patch.feedback, 0.3, t)) },
          (op) =>
            clampOp({
              ...op,
              ratio: op.id === 1 ? 1.0 : op.id === 3 ? 1.5 : 2.0,
              attack: lerp(op.attack, 0.04, t),
              decay: lerp(op.decay, 1.4, t),
              sustain: lerp(op.sustain, 0.45, t),
              release: lerp(op.release, 1.8, t),
            })
        ),
      };

    case 'warehouse_sub':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 1, feedback: round4(lerp(patch.feedback, 0.15, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: 0.5, level: 1.0, decay: 0.45, sustain: 0.3 }
                : { ...op, level: lerp(op.level, 0.18, t) }
            )
        ),
      };

    case 'detroit_strings':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 6, feedback: round4(lerp(patch.feedback, 0.28, t)) },
          (op) =>
            clampOp({
              ...op,
              attack: lerp(op.attack, 0.65, t),
              decay: lerp(op.decay, 1.8, t),
              sustain: lerp(op.sustain, 0.8, t),
              release: lerp(op.release, 1.6, t),
            })
        ),
      };

    case 'metallic_clang':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 2, feedback: round4(lerp(patch.feedback, 0.85, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: 1.0, decay: 0.35 }
                : { ...op, ratio: 2.71 * (op.id - 1), level: 0.9, decay: 0.25 }
            )
        ),
      };

    case 'rave_hoover':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 4, feedback: round4(lerp(patch.feedback, 0.82, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: 1.0, sustain: 0.75, release: 0.45 }
                : { ...op, ratio: 0.5 + op.id * 0.51, level: 0.88, sustain: 0.6 }
            )
        ),
      };

    case 'gabber_overdrive':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 1, feedback: 1.0 },
          (op) =>
            clampOp({
              ...op,
              level: lerp(op.level, 0.98, t),
              attack: 0.001,
              decay: lerp(op.decay, 0.28, t),
            })
        ),
      };

    case 'ghost_whisper':
      return {
        success: true,
        value: mapOps(
          { ...patch, feedback: round4(lerp(patch.feedback, 0.08, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, level: lerp(op.level, 0.45, t), attack: 0.08, release: 0.7 }
                : { ...op, level: lerp(op.level, 0.12, t) }
            )
        ),
      };

    case 'synthwave_brass':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 5, feedback: round4(lerp(patch.feedback, 0.52, t)) },
          (op) =>
            clampOp({
              ...op,
              ratio: op.id === 1 ? 1.0 : op.id === 3 ? 1.01 : 2.0,
              level: lerp(op.level, 0.78, t),
              attack: lerp(op.attack, 0.06, t),
              decay: lerp(op.decay, 0.45, t),
              sustain: lerp(op.sustain, 0.7, t),
              release: lerp(op.release, 0.35, t),
            })
        ),
      };

    case 'dnb_reese':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 4, feedback: round4(lerp(patch.feedback, 0.74, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: 0.5, level: 0.96, sustain: 0.85, release: 0.25 }
                : { ...op, ratio: op.id === 2 ? 1.02 : 2.01, level: 0.85, sustain: 0.8 }
            )
        ),
      };

    case 'devo_angular':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 2, feedback: round4(lerp(patch.feedback, 0.58, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: 1.0, attack: 0.001, decay: 0.14, sustain: 0.05, release: 0.04 }
                : { ...op, ratio: op.id === 2 ? 3.0 : 5.0, level: 0.86, decay: 0.1, sustain: 0.0 }
            )
        ),
      };

    case 'ambient_shimmer':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 7, feedback: round4(lerp(patch.feedback, 0.22, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: 1.0, attack: 0.15, decay: 2.0, sustain: 0.6, release: 2.5 }
                : { ...op, ratio: op.id === 2 ? 4.0 : op.id === 3 ? 7.0 : 9.0, level: 0.65, release: 2.2 }
            )
        ),
      };

    case 'breakbeat_organ':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 5, feedback: round4(lerp(patch.feedback, 0.25, t)) },
          (op) =>
            clampOp({
              ...op,
              ratio: op.id === 1 ? 1.0 : op.id === 2 ? 2.0 : op.id === 3 ? 3.0 : 4.0,
              attack: 0.001,
              decay: lerp(op.decay, 0.22, t),
              sustain: lerp(op.sustain, 0.15, t),
              release: 0.08,
            })
        ),
      };

    case 'psytrance_fm_zap':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 3, feedback: round4(lerp(patch.feedback, 0.86, t)) },
          (op) =>
            clampOp({
              ...op,
              ratio: op.id === 1 ? 1.0 : op.id === 2 ? 3.0 : op.id === 3 ? 7.0 : 11.0,
              level: lerp(op.level, 0.9, t),
              attack: 0.001,
              decay: lerp(op.decay, 0.09, t),
              sustain: 0.0,
              release: 0.05,
            })
        ),
      };

    case 'italo_oct_bass':
      return {
        success: true,
        value: mapOps(
          { ...patch, algorithm: 4, feedback: round4(lerp(patch.feedback, 0.48, t)) },
          (op) =>
            clampOp(
              op.id === 1
                ? { ...op, ratio: 0.5, level: 0.96, attack: 0.001, decay: 0.22, sustain: 0.45, release: 0.08 }
                : {
                    ...op,
                    ratio: op.id === 2 ? 1.0 : op.id === 3 ? 2.0 : 2.01,
                    level: lerp(op.level, 0.78, t),
                    decay: lerp(op.decay, 0.18, t),
                    sustain: 0.25,
                  }
            )
        ),
      };

    default:
      return { success: false, error: `Unknown Snap FX "${fxId}".` };
  }
};
