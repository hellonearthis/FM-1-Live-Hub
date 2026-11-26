# Detroit Techno Skill Prompt

## 1. Sonic Identity & Aesthetic
Futuristic, soulful, machine-driven Detroit techno (Model 500 / Underground Resistance / Derrick May feel): warm analog-style FM strings, syncopated electro-funk basslines, crisp 909 grooves, and shimmering crystalline arpeggios.

## 2. Core Parameters
- **BPM:** `126–134 BPM` (sweet spot: `128–132 BPM`)
- **Key Tendencies:** Soulful minor 7th/9th/11th voicings (`Fm9`, `Cm9`, `Gm7`, `Am7`) with jazzy chromatic passing tones
- **Effects & Mix:**
  - Punchy, upfront 909 kick and hi-hat pocket
  - Stereo chorus and lush hall reverb on string pads; tight ping-pong delay on melodic FM arps

## 3. Key Sonic Elements
- **Drums:** Classic TR-909 four-on-the-floor kick, driving 16th/offbeat hi-hats, crisp snare/rimshot syncopation
- **Bass:** Syncopated rubbery FM bass with punchy attack and woody midrange
- **Strings & Leads:** Sweeping polyphonic-feel FM string pads and glassy bell-like plucks

## 4. FM-1 MCP Patch Generation Rules (4-Op FM)
- **Algorithm Selection:** Use **Algorithm 2**, **5**, or **6** for balanced expressive warmth and shimmering high harmonics.
- **Feedback:** Maintain feedback between **0.25** and **0.60** for rich analog-like brightness without harsh noise.
- **Operator Frequency Ratio Matrix:**
  - **Carriers:** `1.0` or `2.0`.
  - **Modulators:** Musical harmonic ratios (`1.0`, `2.0`, `3.0`, `4.0`) plus occasional `1.5` (fifth) or `1.01` detune for string ensemble depth.
- **Envelope Shaping (ADSR Rules):**
  - **Slot 0 (Bassline):** Attack: `0.001s`, Decay: `0.28s`, Sustain: `0.25`, Release: `0.12s`.
  - **Slot 1 (Lead/Pluck):** Attack: `0.002s`, Decay: `0.22s`, Sustain: `0.15`, Release: `0.18s`.
  - **Slot 2 (Pad):** Attack: `0.65s`, Decay: `1.8s`, Sustain: `0.8`, Release: `1.6s` (lush Detroit string wash).
  - **Slot 3 (Wild-card):** Attack: `0.001s`, Decay: `0.15s`, Sustain: `0.05`, Release: `0.12s` (futuristic FM chime/perc).
- **Strict Guardrails for JSON Generation:** Output strictly JSON conforming to the FM-1 patch schema. Do not include text outside the JSON block.
