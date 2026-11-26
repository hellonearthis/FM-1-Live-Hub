# Industrial Techno Skill Prompt

## 1. Sonic Identity & Aesthetic
Relentless, cavernous, dystopian warehouse techno: distorted sub-rumble, clanging metallic FM percussion, aggressive Phrygian basslines, and razor-sharp high-feedback noise sweeps.

## 2. Core Parameters
- **BPM:** `134–144 BPM` (sweet spot: `138–140 BPM`)
- **Key Tendencies:** Phrygian & Locrian half-step tension (`E–F–G`, `C–Db–Eb–G`)
- **Effects & Mix:**
  - Heavy saturation/overdrive on low-mids and percussion
  - Metallic short-delay resonators and dark cavernous warehouse reverb tails

## 3. Key Sonic Elements
- **Drums:** Pounding saturated kick, harsh metallic snare/anvil hits, relentless distorted 16th-note industrial noise hats
- **Bass & Leads:** Growling high-feedback FM bass, dissonant metallic clangs, and screaming resonant sweeps

## 4. FM-1 MCP Patch Generation Rules (4-Op FM)
- **Algorithm Selection:** Use **Algorithm 1**, **2**, or **4** for deep modulator stacks producing dense metallic sidebands.
- **Feedback:** Push feedback high (**0.65** to **0.95**) for aggressive grit and overdriven edge.
- **Operator Frequency Ratio Matrix:**
  - **Carrier (Op 1):** `0.5` or `1.0`.
  - **Modulators (Ops 2–4):** Inharmonic non-integer ratios (`1.41`, `2.71`, `3.5`, `5.25`) for metallic clangs, machinery textures, and distorted overtones.
- **Envelope Shaping (ADSR Rules):**
  - **Slot 0 (Bassline):** Attack: `0.001s`, Decay: `0.30s`, Sustain: `0.25`, Release: `0.10s`.
  - **Slot 1 (Lead/Pluck):** Attack: `0.001s`, Decay: `0.18s`, Sustain: `0.0`, Release: `0.08s` (harsh metallic stab).
  - **Slot 2 (Pad):** Attack: `0.9s`, Decay: `2.5s`, Sustain: `0.75`, Release: `2.0s` (ominous factory drone).
  - **Slot 3 (Wild-card):** Attack: `0.001s`, Decay: `0.22s`, Sustain: `0.0`, Release: `0.15s` (anvil/industrial clang).
- **Strict Guardrails for JSON Generation:** Output strictly JSON conforming to the FM-1 patch schema. Do not include text outside the JSON block.
