export const DEFAULT_CC_MAP = Object.freeze({
  algorithm: 20,
  feedback: 71,
  op1Level: 7,
  op2Level: 74,
  op3Level: 75,
  op4Level: 76,
  op1Attack: 73,
  op1Decay: 72,
  op2Ratio: 77,
  op3Ratio: 78,
});

export const ATEK303_WAVES = Object.freeze([
  'SAW',
  'SAW+SUB',
  'FAT',
  'DETUNE+SUB',
  'SHINE',
  'METAL',
  'GROWL',
  'BREATH',
  'WILD',
  'OCTAVES',
  'OCT UP',
  'FIFTH UP',
  'SQR+SUB',
  'SQUARE',
]);

export const ATEK303_CC_MAP = Object.freeze({
  cutoff: 74,
  resonance: 71,
  envMod: 75,
  decay: 76,
  accent: 77,
  tuning: 78,
  wave: 79,
  allNotesOff: 123,
});

export const SKIFF_CC_MAP = Object.freeze({
  glide: 5,
  level: 7,
  pan: 10,
  resonance: 71,
  release: 72,
  attack: 73,
  brightness: 74,
  decay: 75,
  reverbSend: 91,
  chorusSend: 93,
  delaySend: 94,
  allNotesOff: 123,
});

export const SKIFF_REMOTE_BUTTON_CC = Object.freeze({
  FX: 102,
  SEL: 103,
  ENV: 104,
  LFO: 105,
  EDIT: 106,
  GLO: 107,
  HOME: 108,
  SAVE: 109,
  ARP: 110,
  SEQ: 111,
  PLAY: 112,
  REC: 113,
  OCT_DOWN: 114,
  OCT_UP: 115,
});

/** Encode a Skiff native REMOTE hardware button press/release CC packet [status, cc, value]. */
export const encodeSkiffRemoteButton = (buttonName, pressed = true, channel = 16) => {
  const cc = SKIFF_REMOTE_BUTTON_CC[buttonName];
  if (cc === undefined) return null;
  const ch = clamp(Math.trunc(Number(channel) || 16), 1, 16) - 1;
  return Object.freeze([0xb0 | ch, cc, pressed ? 127 : 0]);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toMidi7Bit = (normalized) => clamp(Math.round(normalized * 127), 0, 127);

const normRange = (value, min, max) =>
  clamp((value - min) / (max - min), 0, 1);

/** Convert an FM-1 patch JSON object into frozen 7-bit MIDI CC packets [status, cc, value]. */
export const patchToMidiCcMessages = (
  patch,
  channel = 1,
  ccMap = DEFAULT_CC_MAP
) => {
  const ch = clamp(Math.trunc(Number(channel) || 1), 1, 16) - 1;
  const status = 0xb0 | ch;
  const ops = patch.operators || [];
  const op1 = ops[0] || { level: 0.9, attack: 0.01, decay: 0.25 };
  const op2 = ops[1] || { level: 0.5, ratio: 2.0 };
  const op3 = ops[2] || { level: 0.4, ratio: 1.0 };
  const op4 = ops[3] || { level: 0.3 };

  const pairs = [
    [ccMap.algorithm, Math.round(normRange(patch.algorithm ?? 1, 1, 8) * 127)],
    [ccMap.feedback, toMidi7Bit(patch.feedback ?? 0)],
    [ccMap.op1Level, toMidi7Bit(op1.level ?? 0.9)],
    [ccMap.op2Level, toMidi7Bit(op2.level ?? 0.5)],
    [ccMap.op3Level, toMidi7Bit(op3.level ?? 0.4)],
    [ccMap.op4Level, toMidi7Bit(op4.level ?? 0.3)],
    [ccMap.op1Attack, toMidi7Bit(normRange(op1.attack ?? 0.01, 0.001, 10.0))],
    [ccMap.op1Decay, toMidi7Bit(normRange(op1.decay ?? 0.25, 0.001, 10.0))],
    [ccMap.op2Ratio, toMidi7Bit(normRange(op2.ratio ?? 2.0, 0.5, 16.0))],
    [ccMap.op3Ratio, toMidi7Bit(normRange(op3.ratio ?? 1.0, 0.5, 16.0))],
  ];

  return Object.freeze(
    pairs.map(([cc, value]) => Object.freeze([status, cc, value]))
  );
};

/** Map an ATEK303 wave index (0..13) to its 7-bit CC 79 value. */
export const waveIndexToMidi7Bit = (waveIndex) => {
  const idx = clamp(Math.trunc(Number(waveIndex) || 0), 0, ATEK303_WAVES.length - 1);
  return clamp(Math.round((idx / (ATEK303_WAVES.length - 1)) * 127), 0, 127);
};

/**
 * Convert an FM-1 patch into ATEK303 v1.4 MIDI CCs (74/71/75/76/77/78/79),
 * locking CC 78 (Tuning) at center 64 so Drift/Snap FX/Roulette never detune pitch.
 */
export const patchToAtek303CcMessages = (
  patch,
  channel = 1,
  waveIndex = null
) => {
  const ch = clamp(Math.trunc(Number(channel) || 1), 1, 16) - 1;
  const status = 0xb0 | ch;
  const ops = patch.operators || [];
  const op1 = ops[0] || { level: 0.9, attack: 0.01, decay: 0.25 };
  const op2 = ops[1] || { level: 0.5, ratio: 2.0 };
  const op3 = ops[2] || { level: 0.4, ratio: 1.0 };
  const op4 = ops[3] || { level: 0.5 };

  const hasExplicitWave =
    waveIndex !== null && waveIndex !== undefined && waveIndex !== '' && Number.isFinite(Number(waveIndex));
  const waveValue = hasExplicitWave
    ? waveIndexToMidi7Bit(Number(waveIndex))
    : Math.round(normRange(patch.algorithm ?? 1, 1, 8) * 127);

  const pairs = [
    [ATEK303_CC_MAP.cutoff, toMidi7Bit(op2.level ?? 0.5)],
    [ATEK303_CC_MAP.resonance, toMidi7Bit(patch.feedback ?? 0)],
    [ATEK303_CC_MAP.envMod, toMidi7Bit(op3.level ?? 0.4)],
    [ATEK303_CC_MAP.decay, toMidi7Bit(normRange(op1.decay ?? 0.25, 0.001, 2.5))],
    [ATEK303_CC_MAP.accent, toMidi7Bit(op4.level ?? 0.5)],
    [ATEK303_CC_MAP.tuning, 64],
    [ATEK303_CC_MAP.wave, waveValue],
  ];

  return Object.freeze(
    pairs.map(([cc, value]) => Object.freeze([status, cc, value]))
  );
};

/**
 * Convert an FM-1 patch into Skiff v2.7.2 per-track CCs (Brightness, Resonance, ADSR, FX Sends).
 * Targets MIDI channels 1..6 (Skiff Tracks 1..6).
 */
export const patchToSkiffCcMessages = (patch, channel = 1) => {
  const ch = clamp(Math.trunc(Number(channel) || 1), 1, 16) - 1;
  const status = 0xb0 | ch;
  const ops = patch.operators || [];
  const op1 = ops[0] || { level: 0.9, attack: 0.01, decay: 0.25, release: 0.1 };
  const op2 = ops[1] || { level: 0.5 };
  const op3 = ops[2] || { level: 0.4 };
  const op4 = ops[3] || { level: 0.3, sustain: 0.2 };

  const pairs = [
    [SKIFF_CC_MAP.level, toMidi7Bit(op1.level ?? 0.9)],
    [SKIFF_CC_MAP.brightness, toMidi7Bit(op2.level ?? 0.5)],
    [SKIFF_CC_MAP.resonance, toMidi7Bit(patch.feedback ?? 0)],
    [SKIFF_CC_MAP.attack, toMidi7Bit(normRange(op1.attack ?? 0.01, 0.001, 2.5))],
    [SKIFF_CC_MAP.decay, toMidi7Bit(normRange(op1.decay ?? 0.25, 0.001, 2.5))],
    [SKIFF_CC_MAP.release, toMidi7Bit(normRange(op1.release ?? 0.1, 0.001, 2.5))],
    [SKIFF_CC_MAP.reverbSend, toMidi7Bit((op3.level ?? 0.4) * 0.7)],
    [SKIFF_CC_MAP.chorusSend, toMidi7Bit((op4.level ?? 0.3) * 0.6)],
    [SKIFF_CC_MAP.delaySend, toMidi7Bit((op4.sustain ?? 0.2) * 0.6)],
  ];

  return Object.freeze(
    pairs.map(([cc, value]) => Object.freeze([status, cc, value]))
  );
};

/** Decode a raw 3-byte MIDI message into a normalized event record. */
export const parseMidiMessage = (bytes) => {
  if (!bytes || bytes.length < 2) {
    return Object.freeze({ type: 'other' });
  }
  const status = bytes[0];
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const data1 = bytes[1] & 0x7f;
  const data2 = bytes.length > 2 ? bytes[2] & 0x7f : 0;

  if (command === 0x90) {
    return data2 > 0
      ? Object.freeze({ type: 'note_on', channel, note: data1, velocity: data2 })
      : Object.freeze({ type: 'note_off', channel, note: data1, velocity: 0 });
  }
  if (command === 0x80) {
    return Object.freeze({ type: 'note_off', channel, note: data1, velocity: data2 });
  }
  if (command === 0xb0) {
    return Object.freeze({ type: 'cc', channel, number: data1, value: data2 });
  }
  return Object.freeze({ type: 'other' });
};

/** Find the first preset trigger in presetsConfig matching a parsed MIDI event. */
export const matchPresetTrigger = (midiEvent, presetsConfig) => {
  const presets = presetsConfig?.presets;
  if (!Array.isArray(presets) || !midiEvent) {
    return null;
  }

  return (
    presets.find((preset) => {
      const trig = preset?.midiTrigger;
      if (!trig || trig.type !== midiEvent.type) {
        return false;
      }
      if (trig.channel !== undefined && trig.channel !== midiEvent.channel) {
        return false;
      }
      if (trig.type === 'note_on') {
        return trig.note === midiEvent.note;
      }
      if (trig.type === 'cc') {
        return trig.number === midiEvent.number;
      }
      return false;
    }) ?? null
  );
};
