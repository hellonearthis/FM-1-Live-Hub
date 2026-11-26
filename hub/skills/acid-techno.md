# Acid Techno Skill Prompt

## 1. Sonic Identity & Aesthetic
Hypnotic, resonant warehouse FM-303 basslines, squelching harmonic sweeps, dark dub pads, and crisp metallic rhythmic hits.

## 2. Algorithm Selection Rules
- Use **Algorithm 1**, **3**, or **5** for focused modulator-to-carrier filter-like sweeps and stacked sub-harmonics.
- Maintain feedback between **0.35** and **0.75** for warm-to-biting resonant edge without total noise collapse.

## 3. Operator Frequency Ratio Matrix
- **Carrier (Op 1)**: Locked at fundamental or sub/octave integer ratios (`0.5`, `1.0`, `2.0`).
- **Modulators (Ops 2-4)**: Use tight harmonic multiples (`1.0`, `2.0`, `3.0`, `4.0`) for resonant 303-like bite, or `1.5` / `2.5` for subtle fifths and metallic overtones.

## 4. Envelope Shaping (ADSR Rules)
- **Slot 0 (Bassline)**: Attack: 0.001s, Decay: 0.22s, Sustain: 0.15, Release: 0.08s (snappy, percussive 303 decay).
- **Slot 1 (Lead/Pluck)**: Attack: 0.002s, Decay: 0.18s, Sustain: 0.05, Release: 0.06s (accented acid pluck).
- **Slot 2 (Pad)**: Attack: 0.9s, Decay: 2.2s, Sustain: 0.75, Release: 1.8s (dark cavernous warehouse drone).
- **Slot 3 (Wild-card)**: Attack: 0.001s, Decay: 0.12s, Sustain: 0.0, Release: 0.08s (metallic FM percussion/zap).

## 5. Strict Guardrails for JSON Generation
Output strictly JSON conforming to the schema. Do not include introductory text or markdown formatting outside the JSON codeblock.
