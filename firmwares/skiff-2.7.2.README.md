# skiff-2.7.2 — Skiff v2.7.2 (illuminus5)

- **Firmware File:** `firmwares\skiff-2.7.2.fwsc` *(official release [`v2.7.2`](https://github.com/illuminus5/skiff/releases/tag/v2.7.2), `610,429` bytes)*
- **Category:** 6-Track Groovebox, 14 Synth/Drum Engines, 64-Step Sequencer & Song Chainer
- **Save File:** `saves\skiff-2.7.2.flash`
- **Upstream & Docs:** [illuminus5/skiff](https://github.com/illuminus5/skiff) · [Learn Skiff (21 Chapters)](https://illuminus5.github.io/skiff/learn/) · [Browser Editor](https://illuminus5.github.io/skiff/webapp/editor/)

## Overview
Built on **Felucca 1.1.5**, **Skiff v2.7.2** turns the FM-1 into a complete **6-track groovebox** sharing up to 16 voices across two cores (`CPU 2 CORES`) with **14 engines** (`ANALOG`, `FM6` 6-op DX7, `PHASE`, `LOFI`, `SAMPLE`, `VOICE`, `TRIO`, `WHEEL`, `GRAIN`, `PHYS`, `NOISE`, `SLICE`, `DRUM`, `DRUM-X`), 148 factory sounds, a 64-step sequencer (chords, overlaps, ratchets, trig conditions, parameter locks, live `FREE TAKE` tempo capture), 64 shared patterns, 16 scenes, song chaining, and a full **Browser Editor** (with live large **Screen** view over USB MIDI SysEx).

## Usage in FM-1 Live Hub
1. **Launch:** Select `skiff-2.7.2.fwsc` in **Section 1** and click **Open FM-1 Window** (automatically switches **CC Mode** to **`Skiff (6-Track / FX Sends)`**).
2. **Track Channels (`Ch 1–6`):** Pick MIDI Channel `1–6` in **Section 2** to target Tracks 1–6 individually (or set Skiff `MENU › MIDI › AUTO CHANNEL` to play whichever track is selected on screen).
3. **CC Mode: `Skiff`:** Sends per-track `CC 7` (Level), `CC 74` (Brightness/Cutoff), `CC 71` (Resonance), `CC 73` (Attack), `CC 75` (Decay), `CC 72` (Release), `CC 91` (Reverb Send), `CC 93` (Chorus Send), and `CC 94` (Delay Send) cleanly without detuning pitch.
4. **MIDI Clock & Program Change (`Section 2B`):** Enable **`MIDI Clock (24 PPQN)`** (`0xFA`/`0xF8`/`0xFC`) to lock Skiff's 64-step sequencer, arps, and stereo delay to Hub BPM, and use **Program Change (`0xC0`)** to switch the active track's engine preset.

## Skiff Native MIDI & Remote Control (`illuminus5/skiff` Spec)
- **Track CCs:** `5` Glide · `7` Level · `10` Pan · `71` Resonance · `72` Release · `73` Attack · `74` Brightness/Cutoff · `75` Decay · `91` Reverb Send · `93` Chorus Send · `94` Delay Send *(plus `CC 1` Mod Wheel, `CC 11` Expression, `CC 64` Sustain, `CC 120/121/123` Off/Reset).*
- **Native `REMOTE` Channel (`CC 102–115` buttons, `CC 116–119 / 85–87` relative encoders):** Skiff supports remote panel control natively over MIDI without needing `--map` in `fm1-live.exe`.
- **Browser Editor & SysEx Backups:** On real FM-1 hardware over USB, the [Skiff Browser Editor](https://illuminus5.github.io/skiff/webapp/editor/) provides piano-roll pattern editing, song arrangement, sample upload, FM6 DX7 editing, and full `Skiff-backup-DATE.json` backup/restore.

## Compatibility
- **Launcher & Flash Persistence (`saves\skiff-2.7.2.flash`):** Full
- **MIDI Ch 1–6 Notes, Clock, Program Change & `CC 123`:** **Very High**
- **Hub CC Mode (`Skiff`):** **Very High** — drives Brightness, Resonance, ADSR, Level, and Reverb/Chorus/Delay sends cleanly per track.
- **Section 2B Sequencer:** Great both for streaming sequences into Tracks 1–6 (`Send Seq Notes` ON) and clocking Skiff's internal 6-track songs (`Send Seq Notes` OFF).
