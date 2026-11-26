# Chicago Acid House Skill Prompt

## 1. Sonic Identity & Aesthetic
Raw late-1980s Chicago warehouse house (Trax Records / DJ International feel): hypnotic, stripped-back, jacking drum-machine grooves driven by live-tweaked, squelching resonant basslines. Prioritize groove, space, and continuous filter/resonance movement over dense layering or polished modern EDM drops.

## 2. Core Parameters
- **BPM:** `118–126 BPM` (sweet spot: `122–124 BPM`)
- **Key Tendencies:** Minor, Phrygian, or minor pentatonic 1-bar loops centered on `A`, `C`, `D`, or `E` (`A1–A2`, `C2–C3`, `D2–D3`)
- **Swing / Feel:** `54–58%` 16th-note swing on hats and percussion; kick and bass stay tight to the grid
- **Effects & Mix:**
  - Keep kick and sub/acid bass dry and mono
  - Slight analog-style mixer overdrive on the 303 and kick for grit
  - Short room or gated reverb on claps/snares
  - Subtle `3/16` (dotted-eighth) or slapback delay on synth stabs and high-register acid lines

## 3. Key Sonic Elements
- **Drums (TR-707 / TR-808 / TR-909 style):**
  - Punchy four-on-the-floor kick on steps `1, 5, 9, 13`
  - Snappy clap or crisp snare on beats 2 and 4 (steps `5, 13`)
  - Driving offbeat open hi-hat on `&` of every beat (steps `3, 7, 11, 15`)
  - Quiet 16th-note closed hats + syncopated rimshot, clave, or cowbell accents
- **Acid Bass (TB-303 style):**
  - Single-oscillator sawtooth or square wave through a steep resonant low-pass filter
  - Heavy **Resonance** (`70–95%`), moderate-to-high **Env Mod**, and short-to-medium **Decay** (`150–450 ms`)
  - Expressive **Accents** (boosting both volume and filter envelope snap) and **Slides/Glides** across octave or minor-3rd leaps
  - Performed live by riding **Cutoff**, **Resonance**, **Env Mod**, and **Decay** slowly over 8–32 bars
- **Synth Stabs & Pads:**
  - Sparse minor-7th or sus4 house chord stabs (`Em7`, `Am7`, `Dm7`) with short percussive envelopes
  - Optional dark string/organ drone sitting quietly behind the groove during breakdowns

## 4. Structure & Arrangement (DJ-Friendly 16/32-Bar Phrasing)
1. **Bars 1–16 (Drum Intro):** Kick, offbeat open hat, and sparse rimshot/clap; establish the jacking pocket.
2. **Bars 17–32 (Filtered 303 Entry):** Introduce the 1-bar acid bassline with low cutoff and closed envelope; gradually open **Cutoff** and **Env Mod**.
3. **Bars 33–64 (Main Groove / Squelch Build):** Full drums + accented 303 pattern; ride **Resonance** and **Decay** so phrases evolve without changing notes.
4. **Bars 65–80 (Breakdown):** Mute kick (keep hats, clap, and optional dark pad/stab); drop cutoff down then sweep sharply upward into the drop.
5. **Bars 81–112 (Peak):** Kick slams back in with maximum filter squelch, octave slides, and sparse chord stabs.
6. **Bars 113–128 (Outro):** Strip back to kick, hats, and filtered 303 pulse for clean DJ mixing.

## 5. Reference Tracks
- **Phuture** — *Acid Tracks* (1987) — foundational slow-burn 303 filter evolution over TR-707 drums
- **Adonis** — *No Way Back* (1986) — stripped jacking bass-and-drum hypnosis
- **Sleezy D** — *I've Lost Control* (1986) — raw, aggressive warehouse energy and vocal/drum space
- **Fast Eddie** — *Acid Thunder* (1988) — punchy, faster Chicago jacking groove with bright acid leads
- **Armando** — *Land of Confusion* (1988) — minimal, hypnotic 303 phrasing and tension

## 6. Practical Guidance for Writing a Beat
1. **Start with a sparse 16-step drum grid:** Lock kick (`1, 5, 9, 13`), clap (`5, 13`), and open hat (`3, 7, 11, 15`) before adding anything else; add 1–2 syncopated rimshot/cowbell hits (e.g., steps `4, 11, 14`).
2. **Leave rests in the 303 pattern:** Program `8–11` active 16th steps out of `16`—space makes the filter decay and accents hit harder.
3. **Use octave jumps + slides:** Alternate root (`D2`) and octave (`D3`) or flat-7th (`C3`) on adjacent steps with **Slide** enabled on 2–4 transitions per bar, and **Accent** on 3–4 offbeat steps.
4. **Automate parameters instead of adding tracks:** Keep arrangements to 3–4 elements max; let 16-bar filter rides create the progression.

## 7. FM-1 MCP Patch Generation Rules (4-Op FM)
When generating FM-1 patches for this style:
- **Algorithm Selection:** Use **Algorithm 1**, **3**, or **5** for focused modulator-to-carrier filter-like sweeps and punchy fundamental bass weight.
- **Feedback:** Maintain feedback between **0.40** and **0.80** for warm-to-squelchy resonant drive without collapsing into pure white noise.
- **Operator Frequency Ratio Matrix:**
  - **Carrier (Op 1):** Locked at fundamental or octave integer ratios (`0.5`, `1.0`, or `2.0`).
  - **Modulators (Ops 2–4):** Use tight harmonic multiples (`1.0`, `2.0`, `3.0`, `4.0`) to emulate resonant saw/square filter harmonics, or `1.5` sparingly for woody/hollow Chicago house stabs.
- **Envelope Shaping (ADSR Rules):**
  - **Slot 0 (Bassline):** Attack: `0.001s`, Decay: `0.20–0.35s`, Sustain: `0.15`, Release: `0.08s` (punchy, rubbery 303-like snap).
  - **Slot 1 (Lead/Pluck):** Attack: `0.001s`, Decay: `0.14–0.22s`, Sustain: `0.05`, Release: `0.06s` (sharp accented acid squelch or minor-7th stab).
  - **Slot 2 (Pad):** Attack: `0.8–1.4s`, Decay: `2.0s`, Sustain: `0.75`, Release: `1.5–2.2s` (dark, restrained warehouse pad).
  - **Slot 3 (Wild-card):** Attack: `0.001s`, Decay: `0.10–0.18s`, Sustain: `0.0`, Release: `0.06s` (raw FM cowbell, rimshot, or zap).
- **Strict Guardrails for JSON Generation:** Output strictly JSON conforming to the FM-1 patch schema (`patchName`, `algorithm` 1–8, `feedback` 0.0–1.0, `operators` length 4). Do not include introductory text or markdown outside the JSON block.
