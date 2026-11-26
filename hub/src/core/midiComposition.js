import { validatePattern } from './patternSequencer.js';

const PITCH_CLASS_SEMITONES = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

const SHARP_NAMES = Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);

export const COMPOSITION_ROLES = Object.freeze(['bass', 'lead', 'chord', 'arp', 'pad', 'perc']);

export const STRICT_COMPOSITION_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    tempo_bpm: { type: 'integer', minimum: 40, maximum: 240 },
    time_signature: { type: 'string' },
    key: { type: 'string' },
    length_beats: { type: 'number', minimum: 4, maximum: 64 },
    tracks: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          channel: { type: 'integer', minimum: 1, maximum: 16 },
          role: { type: 'string', enum: [...COMPOSITION_ROLES] },
          notes: {
            type: 'array',
            minItems: 1,
            maxItems: 256,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                note: { type: 'string' },
                start: { type: 'number', minimum: 0 },
                dur: { type: 'number', minimum: 0.0625 },
                vel: { type: 'integer', minimum: 1, maximum: 127 },
                accent: { type: 'boolean' },
                slide: { type: 'boolean' },
              },
              required: ['note', 'start', 'dur', 'vel', 'accent', 'slide'],
            },
          },
        },
        required: ['name', 'channel', 'role', 'notes'],
      },
    },
  },
  required: ['title', 'tempo_bpm', 'time_signature', 'key', 'length_beats', 'tracks'],
});

const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));
const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));

/** Convert scientific note name ("C4", "F#3", "Bb2") or 0..127 integer to MIDI number. */
export const noteNameToMidi = (input) => {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const rounded = Math.round(input);
    return rounded >= 0 && rounded <= 127 ? rounded : null;
  }
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d{1,3}$/.test(trimmed)) {
    const num = Number(trimmed);
    return num >= 0 && num <= 127 ? num : null;
  }

  const match = trimmed.match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return null;

  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const octave = Number(match[3]);
  const semitone = PITCH_CLASS_SEMITONES[letter];
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  const midi = (octave + 1) * 12 + semitone + offset;
  return midi >= 0 && midi <= 127 ? midi : null;
};

/** Convert MIDI note number (0..127) to canonical scientific note name ("C4"). */
export const midiToNoteName = (midi) => {
  const safe = clampInt(Number(midi) || 60, 0, 127);
  const name = SHARP_NAMES[safe % 12];
  const octave = Math.floor(safe / 12) - 1;
  return `${name}${octave}`;
};

/** Strip outer markdown code fences and // or /* *\/ JSONC comments outside strings. */
export const stripJsonCommentsAndFences = (rawText) => {
  if (typeof rawText !== 'string') return '';
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:jsonc?|javascript|js)?\s*([\s\S]*?)\s*```$/i);
  const src = fenced ? fenced[1].trim() : trimmed;

  const out = [];
  let inString = false;
  let escaped = false;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inString) {
      out.push(ch);
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out.push(ch);
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    out.push(ch);
    i += 1;
  }

  return out.join('').replace(/,\s*([}\]])/g, '$1').trim();
};

const inferTrackRole = (rawRole, trackName) => {
  const normalized = String(rawRole || '').trim().toLowerCase();
  if (COMPOSITION_ROLES.includes(normalized)) return normalized;
  const label = String(trackName || '').toLowerCase();
  if (/bass|sub|tuba/.test(label)) return 'bass';
  if (/arp/.test(label)) return 'arp';
  if (/chord|keys|piano|organ|poly/.test(label)) return 'chord';
  if (/pad|string|ambient/.test(label)) return 'pad';
  if (/perc|drum|hat|kick/.test(label)) return 'perc';
  return 'lead';
};

const normalizeNoteEntry = (rawNote, trackName, idx) => {
  if (!rawNote || typeof rawNote !== 'object') {
    return { success: false, error: `Track "${trackName}" note #${idx + 1} must be an object.` };
  }
  const midi = noteNameToMidi(rawNote.note ?? rawNote.pitch);
  if (midi === null) {
    return {
      success: false,
      error: `Track "${trackName}" note #${idx + 1} has invalid pitch "${rawNote.note ?? rawNote.pitch}".`,
    };
  }
  const startRaw = Number(rawNote.start ?? rawNote.start_time ?? 0);
  const durRaw = Number(rawNote.dur ?? rawNote.duration_beats ?? rawNote.duration ?? 0.5);
  if (!Number.isFinite(startRaw) || startRaw < 0) {
    return { success: false, error: `Track "${trackName}" note #${idx + 1} has invalid start time.` };
  }
  const dur = Number.isFinite(durRaw) && durRaw > 0 ? clampNumber(durRaw, 0.0625, 64) : 0.5;
  const velRaw = Number(rawNote.vel ?? rawNote.velocity ?? 96);
  const vel = Number.isFinite(velRaw) ? clampInt(velRaw, 1, 127) : 96;

  return {
    success: true,
    value: Object.freeze({
      note: midiToNoteName(midi),
      midi,
      start: Math.round(startRaw * 10000) / 10000,
      dur: Math.round(dur * 10000) / 10000,
      vel,
      accent: Boolean(rawNote.accent ?? vel >= 112),
      slide: Boolean(rawNote.slide),
    }),
  };
};

const extractRawTracks = (candidate) => {
  const declaredTracks = Array.isArray(candidate.tracks) ? candidate.tracks : [];
  const legacyEvents = Array.isArray(candidate.events) ? candidate.events : null;

  if (!legacyEvents) {
    return declaredTracks.map((t, index) => ({
      name: String(t?.name ?? t?.track_name ?? `Track ${index + 1}`).trim() || `Track ${index + 1}`,
      channel:
        t?.channel !== undefined
          ? clampInt(Number(t.channel) || index + 1, 1, 16)
          : t?.midi_channel !== undefined
            ? clampInt(Number(t.midi_channel) + 1, 1, 16)
            : clampInt(index + 1, 1, 16),
      role: inferTrackRole(t?.role, `${t?.name ?? t?.track_name ?? ''} ${t?.instrument_suggestion ?? ''}`),
      notes: Array.isArray(t?.notes) ? t.notes : [],
    }));
  }

  const eventsByName = new Map(
    legacyEvents
      .filter((ev) => ev && typeof ev === 'object')
      .map((ev) => [String(ev.track ?? ev.track_name ?? ev.name ?? '').trim().toLowerCase(), ev])
  );

  const mergedFromDeclared = declaredTracks.map((t, index) => {
    const name = String(t?.name ?? t?.track_name ?? `Track ${index + 1}`).trim() || `Track ${index + 1}`;
    const matched = eventsByName.get(name.toLowerCase());
    const notes = Array.isArray(t?.notes) ? t.notes : Array.isArray(matched?.notes) ? matched.notes : [];
    return {
      name,
      channel:
        t?.channel !== undefined
          ? clampInt(Number(t.channel) || index + 1, 1, 16)
          : t?.midi_channel !== undefined
            ? clampInt(Number(t.midi_channel) + 1, 1, 16)
            : clampInt(index + 1, 1, 16),
      role: inferTrackRole(t?.role, `${name} ${t?.instrument_suggestion ?? ''}`),
      notes,
    };
  });

  const declaredNames = new Set(mergedFromDeclared.map((t) => t.name.toLowerCase()));
  const orphanEvents = legacyEvents
    .filter((ev) => ev && typeof ev === 'object' && Array.isArray(ev.notes))
    .filter((ev) => !declaredNames.has(String(ev.track ?? ev.track_name ?? ev.name ?? '').trim().toLowerCase()))
    .map((ev, idx) => {
      const name = String(ev.track ?? ev.track_name ?? ev.name ?? `Track ${mergedFromDeclared.length + idx + 1}`).trim();
      return {
        name,
        channel: clampInt(mergedFromDeclared.length + idx + 1, 1, 16),
        role: inferTrackRole(ev.role, name),
        notes: ev.notes,
      };
    });

  return [...mergedFromDeclared, ...orphanEvents];
};

/** Validate and normalize either canonical or legacy split multi-track MIDI composition JSON. */
export const validateComposition = (candidate) => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { success: false, error: 'Composition must be a JSON object.' };
  }

  const rawTracks = extractRawTracks(candidate);
  if (rawTracks.length === 0) {
    return { success: false, error: 'Composition must contain at least one track.' };
  }

  const normalizedTracks = [];
  for (let i = 0; i < rawTracks.length; i += 1) {
    const tr = rawTracks[i];
    if (!Array.isArray(tr.notes) || tr.notes.length === 0) {
      return { success: false, error: `Track "${tr.name}" must contain at least one note.` };
    }
    const notes = [];
    for (let nIdx = 0; nIdx < tr.notes.length; nIdx += 1) {
      const norm = normalizeNoteEntry(tr.notes[nIdx], tr.name, nIdx);
      if (!norm.success) return norm;
      notes.push(norm.value);
    }
    const sortedNotes = notes.toSorted((a, b) => a.start - b.start || a.midi - b.midi);
    normalizedTracks.push(
      Object.freeze({
        name: tr.name,
        channel: tr.channel,
        role: tr.role,
        notes: Object.freeze(sortedNotes),
      })
    );
  }

  const maxEnd = normalizedTracks.reduce(
    (maxVal, tr) =>
      Math.max(
        maxVal,
        tr.notes.reduce((tMax, n) => Math.max(tMax, n.start + n.dur), 0)
      ),
    0
  );

  const rawLength = Number(candidate.length_beats ?? candidate.metadata?.length_beats);
  const lengthBeats =
    Number.isFinite(rawLength) && rawLength >= 1
      ? clampNumber(rawLength, 1, 128)
      : Math.max(4, Math.ceil(Math.max(1, maxEnd) / 4) * 4);

  const rawTempo = Number(candidate.tempo_bpm ?? candidate.metadata?.tempo_bpm ?? 120);
  const tempoBpm = Number.isFinite(rawTempo) ? clampInt(rawTempo, 40, 240) : 120;
  const title =
    String(candidate.title ?? candidate.metadata?.title ?? 'Untitled Composition').trim() ||
    'Untitled Composition';
  const timeSignature =
    String(candidate.time_signature ?? candidate.metadata?.time_signature ?? '4/4').trim() || '4/4';
  const key = String(candidate.key ?? candidate.metadata?.key ?? 'C Minor').trim() || 'C Minor';

  return {
    success: true,
    value: Object.freeze({
      title,
      tempo_bpm: tempoBpm,
      time_signature: timeSignature,
      key,
      length_beats: lengthBeats,
      tracks: Object.freeze(normalizedTracks),
    }),
  };
};

/** Parse raw JSON / JSONC string (including optional markdown fences) and validate as composition. */
export const parseCompositionJson = (rawText) => {
  const cleaned = stripJsonCommentsAndFences(rawText);
  if (!cleaned) {
    return { success: false, error: 'Composition JSON input is empty.' };
  }
  try {
    const parsed = JSON.parse(cleaned);
    return validateComposition(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Invalid JSON: ${message}` };
  }
};

/** Down-mix one track of a multi-track composition into a validated 16-step ATEK303/Hub pattern. */
export const compositionTrackToAtek16StepPattern = (composition, trackIndex = 0) => {
  const validated = validateComposition(composition);
  if (!validated.success) return validated;

  const comp = validated.value;
  const idx = clampInt(Number(trackIndex) || 0, 0, comp.tracks.length - 1);
  const track = comp.tracks[idx];
  if (!track) {
    return { success: false, error: `Track index ${trackIndex} not found.` };
  }

  const bar1Notes = track.notes.filter((n) => n.start < 4);
  const sourceNotes = bar1Notes.length > 0 ? bar1Notes : track.notes;

  const grid = Array.from({ length: 16 }, () => ({
    note: null,
    velocity: 96,
    accent: false,
    slide: false,
  }));

  for (const n of sourceNotes) {
    const step = clampInt(Math.round(n.start * 4), 0, 1024) % 16;
    if (grid[step].note !== null) continue;
    grid[step] = {
      note: clampInt(n.midi, 24, 84),
      velocity: clampInt(n.vel, 1, 127),
      accent: Boolean(n.accent || n.vel >= 112),
      slide: Boolean(n.slide || n.dur >= 0.35),
    };
  }

  const suffix = comp.tracks.length > 1 ? ` (${track.name})` : '';
  return validatePattern({
    patternName: `${comp.title}${suffix}`.slice(0, 64),
    bpm: clampInt(comp.tempo_bpm, 60, 180),
    rootKey: comp.key,
    steps: grid,
  });
};

const encodeVlq = (value) => {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
  }
  return bytes;
};

const pushUint32BE = (arr, num) => {
  arr.push((num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff);
};

const pushUint16BE = (arr, num) => {
  arr.push((num >>> 8) & 0xff, num & 0xff);
};

const makeChunk = (tag, bodyBytes) => {
  const chunk = [
    tag.charCodeAt(0),
    tag.charCodeAt(1),
    tag.charCodeAt(2),
    tag.charCodeAt(3),
  ];
  pushUint32BE(chunk, bodyBytes.length);
  for (const b of bodyBytes) chunk.push(b & 0xff);
  return chunk;
};

const parseTimeSig = (ts) => {
  const m = String(ts || '4/4').match(/^(\d+)\s*\/\s*(\d+)$/);
  const num = m ? clampInt(Number(m[1]), 1, 32) : 4;
  const den = m ? clampInt(Number(m[2]), 1, 32) : 4;
  const denPow = Math.max(0, Math.min(5, Math.round(Math.log2(den || 4))));
  return { num, denPow };
};

/** Encode a validated multi-track composition into Standard MIDI File Type 1 (480 TPQN) bytes. */
export const compositionToMidiFileBytes = (composition) => {
  const validated = validateComposition(composition);
  if (!validated.success) {
    throw new Error(validated.error);
  }
  const comp = validated.value;
  const tpqn = 480;
  const usPerQuarter = clampInt(60000000 / comp.tempo_bpm, 100000, 16777215);
  const { num: tsNum, denPow: tsDenPow } = parseTimeSig(comp.time_signature);

  const metaTrackBody = [
    0x00, 0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff,
    0x00, 0xff, 0x58, 0x04, tsNum, tsDenPow, 24, 8,
    0x00, 0xff, 0x2f, 0x00,
  ];

  const trackChunks = comp.tracks.map((tr) => {
    const ch = (tr.channel - 1) & 0x0f;
    const events = [];
    for (const n of tr.notes) {
      const startTick = Math.max(0, Math.round(n.start * tpqn));
      const endTick = Math.max(startTick + 1, Math.round((n.start + n.dur) * tpqn));
      events.push({ tick: startTick, order: 1, bytes: [0x90 | ch, n.midi & 0x7f, n.vel & 0x7f] });
      events.push({ tick: endTick, order: 0, bytes: [0x80 | ch, n.midi & 0x7f, 0] });
    }
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);

    const nameBytes = Array.from(new TextEncoder().encode(tr.name.slice(0, 64)));
    const body = [0x00, 0xff, 0x03, ...encodeVlq(nameBytes.length), ...nameBytes];

    let lastTick = 0;
    for (const ev of events) {
      const delta = Math.max(0, ev.tick - lastTick);
      lastTick = ev.tick;
      body.push(...encodeVlq(delta), ...ev.bytes);
    }
    body.push(0x00, 0xff, 0x2f, 0x00);
    return makeChunk('MTrk', body);
  });

  const headerBody = [];
  pushUint16BE(headerBody, 1);
  pushUint16BE(headerBody, 1 + trackChunks.length);
  pushUint16BE(headerBody, tpqn);

  const allBytes = [
    ...makeChunk('MThd', headerBody),
    ...makeChunk('MTrk', metaTrackBody),
    ...trackChunks.flat(),
  ];

  return Uint8Array.from(allBytes);
};
