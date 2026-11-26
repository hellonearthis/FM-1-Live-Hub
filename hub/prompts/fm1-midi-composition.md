# FM-1 Multi-Track MIDI Composition Rules

Use these rules whenever generating or refining a multi-track MIDI composition JSON for the **FM-1 Live Hub** (supporting **Skiff v2.7.2** 4-track polyphonic playback/recording and **ATEK303 v1.4** 16-step acid/bass down-mixing).

## 1. Strict JSON Output Rules
- Return **ONLY** a single valid JSON object.
- **No** `//` or `/* */` comments, **no** markdown code fences, **no** trailing commas.
- **No** boilerplate fields (`instructions`, `notes_per_beat`, `midi_channel`, separate `events` array).
- Nest `notes` directly inside each track object.

## 2. Exact JSON Schema
```json
{
  "title": "James Bond Motif",
  "tempo_bpm": 120,
  "time_signature": "4/4",
  "key": "E Minor",
  "length_beats": 8,
  "tracks": [
    {
      "name": "Lead Melody",
      "channel": 1,
      "role": "lead",
      "notes": [
        { "note": "E4", "start": 0.0, "dur": 1.0, "vel": 90, "accent": false, "slide": false },
        { "note": "B4", "start": 1.0, "dur": 1.0, "vel": 100, "accent": true, "slide": false }
      ]
    },
    {
      "name": "Rhythmic Bass",
      "channel": 2,
      "role": "bass",
      "notes": [
        { "note": "E2", "start": 0.0, "dur": 1.0, "vel": 82, "accent": false, "slide": false }
      ]
    }
  ]
}
```

## 3. Pitch & Note Naming Rules
- Always write pitches using **scientific note names** (`"C4"`, `"E4"`, `"F#3"`, `"Bb2"`, `"G1"`). Never guess raw MIDI integers.
- Octave reference: `"C1" = 24`, `"C2" = 36`, `"E2" = 40`, `"C3" = 48`, `"C4" = 60` (middle C), `"E4" = 64`, `"C5" = 72`.
- Keep all notes inside playable FM-1 range (`C1`–`C6`).

## 4. Timing & Loop Geometry
- `start` and `dur` are measured in **quarter-note beats** (`0.25` = 16th note, `0.5` = 8th note, `1.0` = quarter note, `2.0` = half note).
- Align `start` and `dur` cleanly to musical subdivisions (`0.25` multiples unless intentionally triplet/swung).
- Set `length_beats` to an exact bar multiple (`4`, `8`, or `16` in `4/4` time).
- Every note must satisfy `start >= 0`, `dur >= 0.0625`, and `start + dur <= length_beats`.

## 5. Hardware Target Rules

### Skiff Target (`channel` 1–4, polyphonic)
- Use `2` to `4` tracks on channels `1..4` with distinct `role` values (`"bass"`, `"lead"`, `"chord"`, `"arp"`, `"pad"`, `"perc"`).
- Separate vertical frequency registers so tracks do not muddy each other:
  - `bass`: `C1`–`G2`
  - `chord` / `pad`: `C3`–`B4`
  - `lead` / `arp`: `C4`–`C6`
- Chords are allowed on Skiff (`chord`/`pad` tracks may schedule multiple notes at the same `start` beat).

### ATEK303 Target (`channel` 1, monophonic 16-step grid)
- Use **1 monophonic track** (`channel: 1`, `role: "bass"` or `"lead"`), `length_beats: 4` (16 sixteenth-note steps).
- Never schedule overlapping notes in time (`next.start >= prev.start + prev.dur`).
- Use `accent: true` (strong hits, `vel` `100–120`) and `slide: true` (glides/legato `dur >= 0.35`) purposefully with rests between motifs.

## 6. Musicality Rules
- Stay strictly within the requested `key` and scale intervals.
- Use rests (empty beats) so phrases breathe — do not fill every 16th note uniformly.
- Shape dynamics with `vel` between `60` and `115`.
