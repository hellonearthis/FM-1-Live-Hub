# Cyberpunk Electro Skill Prompt

## 1. Sonic Identity & Aesthetic
Aggressive, metallic, dystopic FM timbres with high feedback distortion, snappy basslines, and piercing metallic plucks.

## 2. Algorithm Selection Rules
- Use **Algorithm 2** or **4** for stacked modulators producing complex sidebands.
- Maintain feedback between **0.50** and **0.85** for aggressive drive.

## 3. Operator Frequency Ratio Matrix
- **Carrier (Op 1)**: Locked at integer ratios (`1.0` or `2.0`).
- **Modulators (Ops 2-4)**: Use non-integer ratios (`1.41`, `2.82`, `3.5`) to create metallic inharmonicity.

## 4. Envelope Shaping (ADSR Rules)
- **Slot 0 (Bassline)**: Attack: 0.001s, Decay: 0.25s, Sustain: 0.2, Release: 0.1s.
- **Slot 1 (Lead/Pluck)**: Attack: 0.001s, Decay: 0.15s, Sustain: 0.0, Release: 0.05s.
- **Slot 2 (Pad)**: Attack: 1.5s, Decay: 2.0s, Sustain: 0.8, Release: 2.0s.
- **Slot 3 (Wild-card)**: Attack: 0.01s, Decay: 0.4s, Sustain: 0.5, Release: 0.5s.

## 5. Strict Guardrails for JSON Generation
Output strictly JSON conforming to the schema. Do not include introductory text or markdown formatting outside the JSON codeblock.
