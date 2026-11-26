import { crc32 } from 'node:zlib';

export const ATEK_FLASH_SIZE = 1048576;
export const ATEK_SECTOR_SIZE = 4096;
export const ATEK_HEADER_SIZE = 32;
export const ATEK_PAYLOAD_OFFSET = 256;
export const ATEK_ST_MAGIC = 0x30583058;
export const ATEK_SET_MAGIC = 0x41543634;

export const ATEK_STORE_MAP = Object.freeze({
  0: 0xfc000,
  1: 0xdc000,
  2: 0xd8000,
  3: 0xda000,
  4: 0xd4000,
  5: 0xd6000,
});

export const ATEK_SETTINGS_SIZE = 456;
export const ATEK_PRESET_SIZE = 472;
export const ATEK_PRESETS_PER_BANK = 8;
export const ATEK_BANK_SIZE = ATEK_PRESETS_PER_BANK * ATEK_PRESET_SIZE;
export const ATEK_MAX_SLOTS = 32;

export const ACID_SCALES = Object.freeze([
  Object.freeze({ name: 'Acid', intervals: Object.freeze([0, 3, 5, 7, 10]) }),
  Object.freeze({ name: 'Minor', intervals: Object.freeze([0, 2, 3, 5, 7, 8, 10]) }),
  Object.freeze({ name: 'Phrygian', intervals: Object.freeze([0, 1, 3, 5, 7, 8, 10]) }),
  Object.freeze({ name: 'Harmonic Min', intervals: Object.freeze([0, 2, 3, 5, 7, 8, 11]) }),
  Object.freeze({ name: 'Dorian', intervals: Object.freeze([0, 2, 3, 5, 7, 9, 10]) }),
  Object.freeze({ name: 'Blues', intervals: Object.freeze([0, 3, 5, 6, 7, 10]) }),
  Object.freeze({ name: 'Major', intervals: Object.freeze([0, 2, 4, 5, 7, 9, 11]) }),
  Object.freeze({ name: 'Chromatic', intervals: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) }),
]);

const clampInt = (v, min, max) => Math.max(min, Math.min(max, Math.trunc(v)));
const clampFloat = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));

const readU32 = (u8, off) =>
  (u8[off] | (u8[off + 1] << 8) | (u8[off + 2] << 16) | (u8[off + 3] << 24)) >>> 0;

const readU16 = (u8, off) => (u8[off] | (u8[off + 1] << 8)) >>> 0;

const readI8 = (u8, off) => (u8[off] > 127 ? u8[off] - 256 : u8[off]);

const writeU32 = (u8, off, val) => {
  const v = val >>> 0;
  u8[off] = v & 0xff;
  u8[off + 1] = (v >>> 8) & 0xff;
  u8[off + 2] = (v >>> 16) & 0xff;
  u8[off + 3] = (v >>> 24) & 0xff;
};

const writeU16 = (u8, off, val) => {
  const v = val & 0xffff;
  u8[off] = v & 0xff;
  u8[off + 1] = (v >>> 8) & 0xff;
};

const writeF32 = (u8, off, val) => {
  const view = new DataView(u8.buffer, u8.byteOffset + off, 4);
  view.setFloat32(0, Number.isFinite(val) ? val : 0, true);
};

const asciiSlice = (u8, off, maxLen) => {
  const bytes = [];
  for (let i = 0; i < maxLen; i += 1) {
    const b = u8[off + i];
    if (b === 0 || b === 0xff) break;
    if (b >= 32 && b < 127) bytes.push(b);
  }
  return String.fromCharCode(...bytes).trim();
};

const writeAsciiFixed = (u8, off, maxLen, str) => {
  const clean = String(str || 'HUB PATTERN')
    .replace(/[^\x20-\x7e]/g, ' ')
    .trim()
    .slice(0, maxLen - 1);
  for (let i = 0; i < maxLen; i += 1) {
    u8[off + i] = i < clean.length ? clean.charCodeAt(i) : 0;
  }
};

/** Create a blank 1 MiB erased flash image filled with 0xFF. */
export const createBlankFlashImage = () => new Uint8Array(ATEK_FLASH_SIZE).fill(0xff);

/** Read the highest-sequence valid store object for `oid` (0..5) across its A/B sectors. */
export const readStoreObject = (flashBytes, oid) => {
  const base = ATEK_STORE_MAP[oid];
  if (base === undefined || !flashBytes || flashBytes.length < base + ATEK_SECTOR_SIZE * 2) {
    return null;
  }

  let best = null;
  for (let sectorIndex = 0; sectorIndex < 2; sectorIndex += 1) {
    const off = base + sectorIndex * ATEK_SECTOR_SIZE;
    const magic = readU32(flashBytes, off);
    const typ = readU16(flashBytes, off + 4);
    const seq = readU32(flashBytes, off + 8);
    const n = readU32(flashBytes, off + 12);
    const payloadCrc = readU32(flashBytes, off + 16);
    const headerCrc = readU32(flashBytes, off + 28);

    if (magic !== ATEK_ST_MAGIC || typ !== oid || n > 3840) continue;
    if ((crc32(flashBytes.subarray(off, off + 28)) >>> 0) !== headerCrc) continue;
    const payload = flashBytes.subarray(off + ATEK_PAYLOAD_OFFSET, off + ATEK_PAYLOAD_OFFSET + n);
    if ((crc32(payload) >>> 0) !== payloadCrc) continue;

    if (!best || seq > best.seq) {
      best = Object.freeze({
        oid,
        seq,
        sectorIndex,
        payload: new Uint8Array(payload),
      });
    }
  }
  return best;
};

/** Write `payload` to the alternate A/B sector for `oid`, returning a new 1 MiB Uint8Array. */
export const writeStoreObject = (flashBytes, oid, payload) => {
  const base = ATEK_STORE_MAP[oid];
  if (base === undefined) {
    throw new Error(`Invalid ATEK303 store object id: ${oid}`);
  }
  if (!payload || payload.length > 3840) {
    throw new Error(`ATEK303 store payload too large (${payload?.length || 0} bytes).`);
  }

  const nextFlash = new Uint8Array(
    flashBytes && flashBytes.length === ATEK_FLASH_SIZE
      ? flashBytes
      : createBlankFlashImage()
  );
  const existing = readStoreObject(nextFlash, oid);
  const targetSector = existing ? existing.sectorIndex ^ 1 : 0;
  const nextSeq = (existing ? existing.seq : 0) + 1;
  const sectorOff = base + targetSector * ATEK_SECTOR_SIZE;

  nextFlash.fill(0xff, sectorOff, sectorOff + ATEK_SECTOR_SIZE);
  writeU32(nextFlash, sectorOff, ATEK_ST_MAGIC);
  writeU16(nextFlash, sectorOff + 4, oid);
  writeU16(nextFlash, sectorOff + 6, 0);
  writeU32(nextFlash, sectorOff + 8, nextSeq);
  writeU32(nextFlash, sectorOff + 12, payload.length);
  writeU32(nextFlash, sectorOff + 16, crc32(payload) >>> 0);
  writeU32(nextFlash, sectorOff + 20, 0);
  writeU32(nextFlash, sectorOff + 24, 0);
  writeU32(nextFlash, sectorOff + 28, crc32(nextFlash.subarray(sectorOff, sectorOff + 28)) >>> 0);
  nextFlash.set(payload, sectorOff + ATEK_PAYLOAD_OFFSET);

  return nextFlash;
};

const createDefaultSettingsBytes = () => {
  const out = new Uint8Array(ATEK_SETTINGS_SIZE);
  writeU32(out, 0, ATEK_SET_MAGIC);
  // AT_TUNING, AT_CUTOFF, AT_RESONANCE, AT_ENVMOD, AT_DECAY, AT_ACCENT, AT_WAVE
  [0.5, 0.45, 0.68, 0.55, 0.35, 0.65, 0.0].forEach((val, idx) => writeF32(out, 4 + idx * 4, val));
  // SQ_DENSITY, SQ_RANGE, SQ_ACCENT, SQ_SLIDE, SQ_GATE
  [0.55, 0.5, 0.35, 0.25, 0.55].forEach((val, idx) => writeF32(out, 32 + idx * 4, val));
  out[52] = 0; // octave
  out[53] = 0; // page
  out[54] = 16; // steps
  out[55] = 7; // chromatic scale
  out[56] = 0; // root
  out[57] = 0; // locked
  writeU16(out, 58, 126); // tempo
  writeU32(out, 60, 0); // mutation_counter
  writeU32(out, 64, 0x30300001); // pattern.seed
  out[68] = 5; // algorithm_version
  out[69] = 16; // time_length
  out[70] = 0; // pitch_length
  // Gentle delay/reverb tail defaults
  writeF32(out, 392 + 8 * 4, 2.0); // delay time idx
  writeF32(out, 392 + 9 * 4, 0.35); // delay feedback
  writeF32(out, 392 + 10 * 4, 0.5); // delay tone
  writeF32(out, 392 + 11 * 4, 0.2); // delay mix
  return out;
};

/** Decode an ATEK303 `settings_t` record (456 bytes) into a 16-step Hub pattern. */
export const decodeAtekSettingsToHubPattern = (settingsBytes, fallbackName = 'ATEK303 Pattern') => {
  if (!settingsBytes || settingsBytes.length < ATEK_SETTINGS_SIZE) {
    return { success: false, error: 'Invalid ATEK303 settings record.' };
  }
  if (readU32(settingsBytes, 0) !== ATEK_SET_MAGIC) {
    return { success: false, error: 'Preset magic is not AT64 (v1.4 64-step format).' };
  }

  const rawTempo = readU16(settingsBytes, 58);
  const bpm = clampInt(rawTempo || 124, 60, 180);
  const scaleIdx = settingsBytes[55] < ACID_SCALES.length ? settingsBytes[55] : 0;
  const scale = ACID_SCALES[scaleIdx];
  const root = settingsBytes[56] % 12;
  const patternLen = Math.max(1, Math.min(64, settingsBytes[69] || settingsBytes[54] || 16));
  const pitchLen = Math.min(64, settingsBytes[70]);

  let pitchCursor = 0;
  const rawSteps = [];
  for (let i = 0; i < 16; i += 1) {
    const stepPos = i % patternLen;
    const tVal = settingsBytes[71 + stepPos];
    if (tVal === 1 && pitchCursor < pitchLen) {
      const pOff = 135 + pitchCursor * 4;
      pitchCursor += 1;
      const deg = readI8(settingsBytes, pOff);
      const oct = clampInt(readI8(settingsBytes, pOff + 1), -2, 2);
      const accent = settingsBytes[pOff + 2] !== 0;
      const slide = settingsBytes[pOff + 3] !== 0;
      const degNorm = ((deg % scale.intervals.length) + scale.intervals.length) % scale.intervals.length;
      const octWrap = Math.floor(deg / scale.intervals.length);
      const midi = clampInt(36 + root + (oct + octWrap) * 12 + scale.intervals[degNorm], 24, 84);
      rawSteps.push(
        Object.freeze({
          note: midi,
          velocity: accent ? 120 : 92,
          accent,
          slide,
        })
      );
    } else {
      rawSteps.push(Object.freeze({ note: null, velocity: 90, accent: false, slide: false }));
    }
  }

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return {
    success: true,
    value: Object.freeze({
      patternName: String(fallbackName || 'ATEK303 Pattern').trim() || 'ATEK303 Pattern',
      bpm,
      rootKey: `${noteNames[root]} ${scale.name}`,
      steps: Object.freeze(rawSteps),
    }),
  };
};

/** Encode a 16-step Hub pattern into an ATEK303 `settings_t` record (456 bytes). */
export const encodeHubPatternIntoAtekSettings = (baseSettingsBytes, hubPattern, hubPatch = null) => {
  const out = new Uint8Array(
    baseSettingsBytes &&
      baseSettingsBytes.length === ATEK_SETTINGS_SIZE &&
      readU32(baseSettingsBytes, 0) === ATEK_SET_MAGIC
      ? baseSettingsBytes
      : createDefaultSettingsBytes()
  );

  writeU32(out, 0, ATEK_SET_MAGIC);
  out[52] = 0; // octave
  out[53] = 0; // page 1
  out[54] = 16; // 16 steps
  out[55] = 7; // Chromatic scale (ensures exact semitone preservation)
  out[56] = 0; // C root
  writeU16(out, 58, clampInt(hubPattern.bpm || 124, 60, 180));
  out[68] = 5;
  out[69] = 16;

  if (hubPatch) {
    const ops = hubPatch.operators || [];
    const op1 = ops[0] || {};
    const op2 = ops[1] || {};
    const op3 = ops[2] || {};
    const op4 = ops[3] || {};
    writeF32(out, 4 + 0 * 4, 0.5); // AT_TUNING locked at center
    writeF32(out, 4 + 1 * 4, clampFloat(op2.level ?? 0.5, 0, 1));
    writeF32(out, 4 + 2 * 4, clampFloat(hubPatch.feedback ?? 0.6, 0, 1));
    writeF32(out, 4 + 3 * 4, clampFloat(op3.level ?? 0.5, 0, 1));
    writeF32(out, 4 + 4 * 4, clampFloat((op1.decay ?? 0.25) / 2.5, 0, 1));
    writeF32(out, 4 + 5 * 4, clampFloat(op4.level ?? 0.6, 0, 1));
  }

  let pitchIdx = 0;
  out.fill(0, 71, 71 + 64);
  out.fill(0, 135, 135 + 256);

  for (let i = 0; i < 16; i += 1) {
    const step = hubPattern.steps[i];
    if (step && step.note !== null && step.note !== undefined) {
      out[71 + i] = 1; // ACID_NOTE
      const note = clampInt(step.note, 24, 84);
      const deg = note % 12;
      const oct = clampInt(Math.floor(note / 12) - 3, -2, 2);
      const pOff = 135 + pitchIdx * 4;
      out[pOff] = deg & 0xff;
      out[pOff + 1] = (oct < 0 ? oct + 256 : oct) & 0xff;
      out[pOff + 2] = step.accent ? 1 : 0;
      out[pOff + 3] = step.slide ? 1 : 0;
      pitchIdx += 1;
    } else {
      out[71 + i] = 0; // ACID_REST
    }
  }
  out[70] = pitchIdx;
  return out;
};

/** List all 32 preset slots (slots 1..32) stored in an ATEK303 flash image. */
export const listAtekFlashPresets = (flashBytes) => {
  const slots = [];
  for (let bankIdx = 0; bankIdx < 4; bankIdx += 1) {
    const obj = flashBytes ? readStoreObject(flashBytes, 2 + bankIdx) : null;
    for (let i = 0; i < ATEK_PRESETS_PER_BANK; i += 1) {
      const slotNum = bankIdx * ATEK_PRESETS_PER_BANK + i + 1;
      if (!obj || obj.payload.length < (i + 1) * ATEK_PRESET_SIZE) {
        slots.push(Object.freeze({ slot: slotNum, used: false, name: '', bpm: null, steps: null }));
        continue;
      }
      const pOff = i * ATEK_PRESET_SIZE;
      const used = obj.payload[pOff + 15] === 1 && readU32(obj.payload, pOff + 16) === ATEK_SET_MAGIC;
      const name = used ? asciiSlice(obj.payload, pOff, 15) || `PRESET ${slotNum}` : '';
      const bpm = used ? readU16(obj.payload, pOff + 16 + 58) : null;
      const steps = used ? obj.payload[pOff + 16 + 54] : null;
      slots.push(Object.freeze({ slot: slotNum, used, name, bpm, steps }));
    }
  }
  return Object.freeze(slots);
};

/** Read and decode the currently active working pattern (`oid = 0`) from an ATEK303 flash image. */
export const readAtekActivePattern = (flashBytes) => {
  const obj = readStoreObject(flashBytes, 0);
  if (!obj) {
    return { success: false, error: 'ATEK303 active working pattern (oid 0) is not saved in flash yet.' };
  }
  return decodeAtekSettingsToHubPattern(obj.payload, 'ATEK303 Active');
};

/** Activate an existing saved slot (`1..32`) by copying its settings into working store `oid = 0`. */
export const activateAtekFlashSlot = (flashBytes, slotNumber) => {
  const slot = clampInt(Number(slotNumber) || 1, 1, ATEK_MAX_SLOTS);
  const bankIdx = Math.floor((slot - 1) / ATEK_PRESETS_PER_BANK);
  const inBankIdx = (slot - 1) % ATEK_PRESETS_PER_BANK;
  const obj = readStoreObject(flashBytes, 2 + bankIdx);
  if (!obj || obj.payload.length < ATEK_BANK_SIZE) {
    return { success: false, error: `ATEK303 preset bank ${bankIdx + 1} is empty in flash.` };
  }
  const pOff = inBankIdx * ATEK_PRESET_SIZE;
  if (obj.payload[pOff + 15] !== 1) {
    return { success: false, error: `ATEK303 Slot ${slot} is empty (no saved flash preset).` };
  }
  const settings = obj.payload.subarray(pOff + 16, pOff + 16 + ATEK_SETTINGS_SIZE);
  if (readU32(settings, 0) !== ATEK_SET_MAGIC) {
    return { success: false, error: `ATEK303 Slot ${slot} is not AT64 format.` };
  }
  const name = asciiSlice(obj.payload, pOff, 15) || `ATEK Slot ${slot}`;
  const updatedFlash = writeStoreObject(flashBytes, 0, new Uint8Array(settings));
  return {
    success: true,
    value: Object.freeze({ slot, name, flash: updatedFlash }),
  };
};

/** Read and decode one preset slot (`1..32`) from an ATEK303 flash image into a Hub pattern. */
export const readAtekFlashPreset = (flashBytes, slotNumber) => {
  const slot = clampInt(Number(slotNumber) || 0, 1, ATEK_MAX_SLOTS);
  const bankIdx = Math.floor((slot - 1) / ATEK_PRESETS_PER_BANK);
  const inBankIdx = (slot - 1) % ATEK_PRESETS_PER_BANK;
  const obj = readStoreObject(flashBytes, 2 + bankIdx);
  if (!obj || obj.payload.length < ATEK_BANK_SIZE) {
    return { success: false, error: `ATEK303 preset bank ${bankIdx + 1} is empty in flash.` };
  }
  const pOff = inBankIdx * ATEK_PRESET_SIZE;
  if (obj.payload[pOff + 15] !== 1) {
    return { success: false, error: `ATEK303 Slot ${slot} is empty.` };
  }
  const name = asciiSlice(obj.payload, pOff, 15) || `ATEK Slot ${slot}`;
  const settings = obj.payload.subarray(pOff + 16, pOff + 16 + ATEK_SETTINGS_SIZE);
  const decoded = decodeAtekSettingsToHubPattern(settings, name);
  if (!decoded.success) return decoded;
  return { success: true, value: Object.freeze({ slot, name, pattern: decoded.value }) };
};

/** Write a Hub pattern (and optional patch tone) into ATEK303 preset slot (`1..32`), returning a new flash image. */
export const writeAtekFlashPreset = (
  flashBytes,
  slotNumber,
  { name, pattern, patch = null, setActive = false }
) => {
  const slot = clampInt(Number(slotNumber) || 13, 1, ATEK_MAX_SLOTS);
  const bankIdx = Math.floor((slot - 1) / ATEK_PRESETS_PER_BANK);
  const inBankIdx = (slot - 1) % ATEK_PRESETS_PER_BANK;
  const existingBank = flashBytes ? readStoreObject(flashBytes, 2 + bankIdx) : null;
  const bankPayload = new Uint8Array(ATEK_BANK_SIZE);
  if (existingBank && existingBank.payload.length >= ATEK_BANK_SIZE) {
    bankPayload.set(existingBank.payload.subarray(0, ATEK_BANK_SIZE));
  }

  const pOff = inBankIdx * ATEK_PRESET_SIZE;
  const existingSettings =
    bankPayload[pOff + 15] === 1
      ? bankPayload.subarray(pOff + 16, pOff + 16 + ATEK_SETTINGS_SIZE)
      : readStoreObject(flashBytes, 0)?.payload || null;

  const presetName = (name || pattern.patternName || `HUB ${slot}`).toUpperCase();
  const nextSettings = encodeHubPatternIntoAtekSettings(existingSettings, pattern, patch);

  writeAsciiFixed(bankPayload, pOff, 15, presetName);
  bankPayload[pOff + 15] = 1;
  bankPayload.set(nextSettings, pOff + 16);

  const flashWithSlot = writeStoreObject(flashBytes, 2 + bankIdx, bankPayload);
  const updatedFlash = setActive
    ? writeStoreObject(flashWithSlot, 0, nextSettings)
    : flashWithSlot;

  return {
    success: true,
    value: Object.freeze({
      slot,
      name: asciiSlice(bankPayload, pOff, 15),
      flash: updatedFlash,
    }),
  };
};
