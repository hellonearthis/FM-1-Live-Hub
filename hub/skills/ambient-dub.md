# Ambient Dub / Dub Techno Skill Prompt

## 1. Sonic Identity & Aesthetic
Deep, hypnotic Berlin-style dub techno (Basic Channel / Maurizio feel): warm filtered minor chords dissolving into long tape delays, cavernous spring reverb, subtle vinyl hiss, and rolling sub-bass pulses.

## 2. Core Parameters
- **BPM:** `112–120 BPM` (sweet spot: `116–118 BPM`)
- **Key Tendencies:** Minor 7th / Minor 9th chords centered on `C`, `D`, `F`, or `G` minor
- **Effects & Mix:**
  - Keep kick and sub-bass centered and dry
  - Heavy dotted-eighth (`3/16`) and quarter-note stereo tape delay with dark high-frequency roll-off on chord stabs
  - Long cathedral/plate reverb tails on sparse rimshots and noise sweeps

## 3. Key Sonic Elements
- **Drums:** Soft, deep rounded kick (`1, 5, 9, 13`), crisp muffled offbeat hi-hats, ghostly delayed rimshots/shakers
- **Sub Bass:** Sine-heavy rolling sub with gentle harmonic warmth
- **Dub Chords & Pads:** Minor-7th/9th FM chord stabs with slow filter/modulator decay swells and evolving drones

## 4. FM-1 MCP Patch Generation Rules (4-Op FM)
- **Algorithm Selection:** Use **Algorithm 5**, **6**, or **7** for warm parallel carriers with gentle modulation.
- **Feedback:** Keep feedback low-to-moderate (**0.15** to **0.45**) so timbres stay warm, woody, and submerged.
- **Operator Frequency Ratio Matrix:**
  - **Carriers:** Integer ratios (`0.5`, `1.0`, `2.0`).
  - **Modulators:** Harmonic ratios (`1.0`, `1.5`, `2.0`, `3.0`) with subtle detune (`1.01`, `1.51`) for chorus warmth.
- **Envelope Shaping (ADSR Rules):**
  - **Slot 0 (Bassline):** Attack: `0.01s`, Decay: `0.45s`, Sustain: `0.35`, Release: `0.25s`.
  - **Slot 1 (Lead/Pluck):** Attack: `0.02s`, Decay: `0.35s`, Sustain: `0.1`, Release: `0.45s` (dub chord stab).
  - **Slot 2 (Pad):** Attack: `1.8s`, Decay: `3.0s`, Sustain: `0.85`, Release: `2.8s` (deep oceanic pad).
  - **Slot 3 (Wild-card):** Attack: `0.005s`, Decay: `0.25s`, Sustain: `0.0`, Release: `0.35s` (echo-ready metallic rim/blip).
- **Strict Guardrails for JSON Generation:** Output strictly JSON conforming to the FM-1 patch schema. Do not include text outside the JSON block.
