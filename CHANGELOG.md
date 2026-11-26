# FM-1 Project Document Trail (`CHANGELOG.md`)

**Project Root:** `C:\Users\Desktop-Dev\Desktop\FM-1`  
**Architecture Reference:** [FM-1 + MCP + MIDI Code Architecture Outline.md](./FM-1%20%2B%20MCP%20%2B%20MIDI%20Code%20Architecture%20Outline.md)

---

## 2026-11-23 — Emulator & DAW Plugin Installation (`fm1-emu v0.5.1`)

Installed the Windows x86-64 release of [joakimeriksson/fm1-emu](https://github.com/joakimeriksson/fm1-emu) (`v0.5.1`):

- **Standalone Emulator & Batch Runner (Project Root):**
  - `fm1-live.exe` — Live M-VAVE FM-1 / SMK-37 emulator with audio out (WASAPI), keyboard/mouse panel, MIDI input, and JIT (`--bench` / `--shot`)
  - `fm1-emu.exe` — Batch/headless interpreter runner (`--wav`, `--keys`, breakpoints, memory dumps)
  - `README.txt` — Release notes and usage summary
- **DAW Instrument Plugins (Per-User Common Directories):**
  - `C:\Users\Desktop-Dev\AppData\Local\Programs\Common\VST3\FM-1.vst3`
  - `C:\Users\Desktop-Dev\AppData\Local\Programs\Common\CLAP\FM-1.clap`
  - *(Note: installed per-user because `C:\Program Files\Common Files` required elevation; `FM-1.vst3` loads `FM-1.clap` from the `CLAP` folder.)*
- **Verified:** `.\fm1-live.exe --help` and `.\fm1-emu.exe --help` exited cleanly.

---

## 2026-11-23 — Firmware Collection (`firmwares/`) & Persistent Saves (`saves/`)

Downloaded and SHA-256 verified 13 `.fwsc` firmwares from [The Firmware Hub](https://thefirmwarehub.com/):

- **Active Installed Firmwares (`firmwares/` — trimmed to ATEK303 & Skiff):**
  - `firmwares\04_atek303.fwsc` — ATEK303 v1.4 (Animatek)
  - `firmwares\skiff-2.7.2.fwsc` — Skiff v2.7.2 (illuminus5; 6-track, 14-engine Felucca-based groovebox + browser editor)
- **Synth Usage & Compatibility READMEs (`firmwares/`):**
  - `firmwares\README.md` — Hub compatibility & usefulness matrix for the installed firmwares (`04_atek303.fwsc` and `skiff-2.7.2.fwsc`)
  - `firmwares\FM1_FIRMWARE_CATALOG.md` & `firmwares\catalog.json` — Complete catalog of all 486 FM-1 firmwares from `https://fm1-editor.com/firmware/` generated via `hub\scripts\build-firmware-catalog.mjs`, plus MIDI In/Out, SysEx, and Track/Pattern/Composition I/O feasibility audit
  - Individual per-synth guides: `04_atek303.README.md` and `skiff-2.7.2.README.md`
- **Persistent Flash Saves (`saves/`):**
  - Created during interactive/emulator runs: `01_loafbreaker.flash`, `02_h1.flash`, `03_coralflower.flash`, `04_atek303.flash`, `09_mutable.flash`.

---

## 2026-11-23 — Windows GUI Launcher

Added a WinForms GUI launcher for quick firmware switching:

- `launch-fm1.ps1` — Lists `.fwsc` files in `firmwares\` and root; provides **Clock (MHz)** (`240`, `160`, `120`, `320`), **Save flash (`saves\`)** (`--flash`), **USB** (`--usb`), **Refresh**, and **Browse…** controls. Verified with PowerShell AST parser (`0` syntax errors).
- `Launch FM-1.bat` — Double-clickable wrapper running `launch-fm1.ps1` with `-ExecutionPolicy Bypass` and hidden console window.

---

## 2026-11-23 — Python Emulator Wrapper MCP Server (`mcp/`)

Added a local stdio MCP server wrapping `fm1-live.exe` and `fm1-emu.exe`:

- `mcp\fm1_mcp.py` — `fm1-emu` MCP server exposing 7 tools:
  - `fm1_list_firmwares`
  - `fm1_status`
  - `fm1_start_live`
  - `fm1_stop_live`
  - `fm1_render_shot`
  - `fm1_render_audio`
  - `fm1_bench`
- `mcp\README.md` — Tool documentation and `mcp_config.json` snippet.
- **Verified:** End-to-end tests for firmware listing, headless PNG screenshot rendering, WAV audio rendering, `--bench` speed check (`6.80x real time` on `01_loafbreaker`), and MCP `stdio` handshake (`initialize` + `tools/list`).

---

## 2026-11-23 — Rendered Audio, LCD Captures & Video (`work/`)

Headless renders, LCD probes, and `ffmpeg` video output generated via `fm1-live.exe` / `fm1-emu.exe`:

| File | Description |
|---|---|
| `work\01_loafbreaker_1000ms.wav`, `work\01_loafbreaker_3000ms.wav` | Probe audio renders for LOAF BREAKER |
| `work\04_atek303_3000ms.wav`, `work\05_fmini_3000ms.wav` | Probe audio renders for ATEK303 and FMini-1 |
| `work\01_loafbreaker_lcd.png`, `work\04_atek303_lcd.png`, `work\05_fmini_lcd.png`, `work\guitchordi_lcd.png` | 240×240 LCD PNG captures |
| `work\lcd.bmp` | Raw LCD bitmap capture |
| `work\techno_tune.wav` | 15.88s ATEK303 (*COSMIC TRAX*) acid techno render with filter sweeps |
| `work\neon_substation.wav` | 14.34s 132 BPM FMini-1 + OberVave techno track |
| `work\iron_foundry_138.wav` | 15.81s 138 BPM LOAF BREAKER + ATEK303 industrial techno track (`tanh` saturation) |
| `work\acid_reactor_90s.wav` | 90.78s 138 BPM 52-bar techno acid track |
| `work\bach_toccata_acid_90s.wav` | 90.78s 138 BPM D-minor Bach BWV 565 Toccata acid techno track |
| `work\bond_house_techno_90s.wav` | 90.34s 128 BPM E-minor James Bond house-techno track |
| `work\bach_cm_clean_90s.wav` | 89.89s 134 BPM C-minor Bach BWV 847 clean un-saturated mix |
| `work\bach_cm_nokick_90s.wav` | 89.89s 134 BPM C-minor Bach BWV 847 without bass drum |
| `work\bach_bwv847_slider_90s.wav` | 89.89s 134 BPM BWV 847 with 303 slide/glide, smooth slider sweeps, 1800 Hz HPF hats, and dotted-8th stereo delay |
| `work\guitchordi_baroque_techno_90s.wav` | 91.25s 132 BPM C#m GuitChordi + ATEK303 + HPF hats |
| `work\bond_bach_guitchordi_90s.wav` | 90.34s 128 BPM Em GuitChordi E5/B7 chords + Bond/Bach ATEK303 + HPF hats |
| `work\bond_bach_progression_90s.wav` | 90.34s 128 BPM 6-section Bond + Bach plucked progression (no strumming) |
| `work\bond_bach_progression_90s.mp4` | `750×526` H.264 + 192 kbps AAC video combining uploaded image and `bond_bach_progression_90s.wav` via `ffmpeg` |

---

## 2026-11-25 — Node.js FM-1 Hub, Style Skills & 4-Slot Cache MCP Server (`hub/`, Phases 1–2)

Added by user as specification: `FM-1 + MCP + MIDI Code Architecture Outline.md`.  
Implemented Phases 1 and 2 in `hub/` using Pure Functional Architecture (no `class`, `this`, or mutable module globals in `src/core/`):

- **Package & Configuration:**
  - `hub\package.json`, `hub\package-lock.json` — ESM Node.js package (`@modelcontextprotocol/sdk`, `zod`)
  - `hub\config\presets.json` — MIDI trigger presets (`harmonic_drift`, `style_morph`, `ghost_response`)
  - `hub\config\fm1-hub-map.json` — `fm1-map` JSON profile binding Ch 16 notes `60–70` (`PLAY`, `REC`, `SEQ`, `ARP`, `SAVE`, `HOME`, `EDIT`, `GLO`, `ENV`, `LFO`, `FX`), Ch 15 front-panel `keys` (`base: 53, fold: true`), Ch 1 CC knobs (`KNOB1–KNOB4`, `ALGORITHM`, `MASTER`, `SELECT`, `PRESETS`), and Ch 1 MIDI notes
  - `hub\skills\cyberpunk-electro.md`, `hub\skills\acid-techno.md`, `hub\skills\chicago-acid-house.md`, `hub\skills\ambient-dub.md`, `hub\skills\detroit-techno.md`, & `hub\skills\industrial-techno.md` — Genre skill prompts with beat-writing guidance and FM-1 operator/ADSR guardrails
- **Pure Core (`hub\src\core\`):**
  - `hub\src\core\patchSchema.js` — `FM1_SCHEMA_GUIDE`, `DEFAULT_PATCH`, `validatePatch`, `interpolatePatches`, `nudgeModulators`
  - `hub\src\core\deckState.js` — `SLOT_ROLES`, `createInitialDeckState`, `beginLoadStyle`, `markSlotWarming`, `applySlotPatch`, `markSlotFailed`, `consumeSlot`, `setActivePatch`, `selectDeckStatus` (with `generationEpoch` stale-response cancellation)
  - `hub\src\core\midiMapper.js` — `DEFAULT_CC_MAP`, `ATEK303_CC_MAP`, `ATEK303_WAVES` (14 oscillators), `SKIFF_CC_MAP`, `SKIFF_REMOTE_BUTTON_CC`, `encodeSkiffRemoteButton`, `waveIndexToMidi7Bit`, `patchToMidiCcMessages`, `patchToAtek303CcMessages` (locks CC 78 Tuning at `64`), `patchToSkiffCcMessages`, `parseMidiMessage`, `matchPresetTrigger`
  - `hub\src\core\atekFlashCodec.js` — Pure functional ATEK303 v1.4 `.flash` (`AT64` / CRC-32 A/B sector store) encoder & decoder (`listAtekFlashPresets`, `readAtekFlashPreset`, `writeAtekFlashPreset`, `decodeAtekSettingsToHubPattern`, `encodeHubPatternIntoAtekSettings`)
  - `hub\src\core\copilotMacros.js` — `applyChaosEnvelope`, `ROULETTE_FLAVORS` (10 FM timbre variations) + `applyAlgorithmRoulette` (carrier gain compensation) + `interpolatePatchChain`, `validateSmartMacro`, `applySmartMacroValue`
  - `hub\src\core\snapFx.js` — `SNAP_FX_LIST` & `applySnapFx` (23 momentary House, Acid House, Trance, Electro, Dub, Techno, Industrial, Rave, Hard Techno, Breakdown, Synthwave, Drum & Bass, Synth-Punk, Ambient, Breakbeat, Psytrance, and Italo Disco Snap FX transforms)
  - `hub\src\core\patternSequencer.js` — `STRICT_PATTERN_SCHEMA`, `validatePattern`, `createBlankPattern`, `recordNoteAtStep`, `quantizeLiveStep` (nearest-16th live quantization), `STARTER_PATTERNS` (4 built-in 16-step patterns), `createInitialSequencerState`, `queuePatternSwitch`, and `advanceStep` (commits queued pattern switches cleanly on Step 0 at end of sequence)
- **Imperative Shell (`hub\src\shell\` & `hub\src\server.js`):**
  - `hub\src\shell\llmClient.js` — `createLlmConfig`, `deriveModelsEndpoint`, `resolveModelName`, `requestPatchFromLlm`, `requestSmartMacroFromLlm`, `requestPatternFromLlm` (supports custom artist/genre prompts like Bach or Devo), `requestPatternRefinementFromLlm` (iteratively refines patterns from comments like "calmer" or "more energetic") targeting Unsloth (`http://127.0.0.1:8888/v1/chat/completions`, auto-detects active model via `GET /v1/models` with optional `FM1_LLM_MODEL` override, enforces `json_schema`)
  - `hub\src\shell\deckController.js` — `createDeckController` coordinating style loading, background 4-slot warming, 0 ms slot triggering + auto-refill, morphing, harmonic drift, Chaos Envelope & 23 Snap FX momentary engage/release (`setSnapFxAsDefault`, `resetSnapFxDefault`), Algorithm Roulette (`ROULETTE_FLAVORS`, `undoAlgorithmRoulette`, `setRouletteSlide`), AI Smart Macro assignment, and `applyExternalPatch`
  - `hub\src\shell\debugLog.js` — `createDebugLog` ring-buffer logger streaming backend events to `stderr` and HTTP `/logs`
  - `hub\src\shell\patchStore.js` — `createPatchStore` saving/loading/deleting favorite FM-1 patches on disk in `hub\patches\*.json`
  - `hub\src\shell\patternStore.js` — `createPatternStore` merging `STARTER_PATTERNS` with custom/AI patterns saved in `hub\patterns\*.json`
  - `hub\src\shell\fastPathHttp.js` — `startFastPathServer` on `127.0.0.1:3001` serving the live HTML dashboard (`GET /`) and REST endpoints (`/status`, `/patch`, `/styles`, `/presets`, `/midi-cc`, `/logs`, `/logs/clear`, `/logs/client`, `/slot/:id/consume`, `/style/:name`, `/drift`, `/morph`, `/chaos/engage`, `/chaos/release`, `/snap-fx`, `/snap-fx/engage`, `/snap-fx/release`, `/snap-fx/set-default`, `/snap-fx/reset-default`, `/roulette`, `/roulette/back`, `/roulette/slide`, `/macro`, `/macro/assign`, `/macro/value`, `/favorites`, `/favorites/save`, `/favorites/:id/load`, `/favorites/:id`, `/patterns`, `/patterns/save`, `/patterns/generate`, `/patterns/refine`, `/patterns/:id`, `/atek/flash/presets`, `/atek/flash/import`, `/atek/flash/export`, `/fm1/status`, `/fm1/launch`, `/fm1/stop`)
  - `hub\src\shell\fm1Process.js` — `createFm1Launcher` to visibly launch and stop `fm1-live.exe` with selected firmware, `--midi`, and `saves\` persistence
  - `hub\public\index.html` — Self-contained live dashboard UI with FM-1 window launching, Web MIDI Input/Output hardware & loopMIDI bridge (`presets.json` triggers, **CC Mode** `ATEK303 (Safe Tuning)` / `4-Op FM Generic`, 14-wave **CC 79 Wave** selector, auto CC sync, Test Acid Riff, local 4-op FM WebAudio preview on keys `A–K`), **16-Step Pattern Sequencer** (`+ Blank Pattern`, `● Rec to Pattern` drift-compensated & quantized MIDI/keyboard step & live recording with optional beat metronome, **24 PPQN MIDI Clock `0xF8` + `0xFA`/`0xFC` + `CC 123`**, **`Send Seq Notes`** toggle for live root transposition, optimistic debounced saves, left-click cursor / right-click rest clear, AI pattern designer & conversational refiner with quick-refine chips, end-of-sequence pattern switching, MIDI Program Change sync, plus `fm1-map` **FM-1 PLAY / SEQ (Gen) / REC (Undo) / ENV / LFO / ARP / ⏺ Preload → EDIT** & optional **Tap FM-1 SEQ on Bar Switch**), 4-slot Unsloth deck status, operator/ADSR telemetry, Co-Pilot controls (**Drift**, **Morph**, **Algorithm Roulette** + **← Roulette Back** + crossfade slider, **AI Smart Macro Assign + Slider**, **Favorite Patches Save/Load/Delete**, **6×4 Momentary Snap FX Pad Grid** with **Original Default** reset pad and right-click set-default), Web MIDI `{ sysex: true }` unlock, **ATEK303 `.flash` Preset Sync (`↑ Push / ↓ Pull Slots 1–32`)**, **Skiff Native `REMOTE` (`CC 102–115`) & 1-Click `⏺ Record Pattern → Skiff Track`**, **DevTools (F12)** button, and **Live Debugging Console**
  - `hub\src\dashboard.js` & `Launch FM-1 Hub.bat` — Standalone dashboard runner (`npm run dashboard`) and double-clickable browser launcher
  - `hub\electron\main.js`, `hub\electron\preload.cjs`, & `Launch FM-1 App.bat` — Native Electron desktop app (`npm run electron`) with single-instance lock, Web MIDI permissions, `F12` / `Ctrl+Shift+I` DevTools toggle, and embedded FM-1 hub
  - `hub\src\server.js` — MCP stdio server (`fm1-hub-mcp`) exposing 21 tools: `list_music_styles`, `set_music_style`, `trigger_cached_patch`, `get_deck_status`, `get_active_patch`, `morph_patch_with_slot`, `apply_harmonic_drift`, `engage_chaos_envelope`, `release_chaos_envelope`, `algorithm_roulette`, `assign_smart_macro`, `set_smart_macro_value`, `list_snap_fx`, `engage_snap_fx`, `release_snap_fx`, `list_favorite_patches`, `save_favorite_patch`, `load_favorite_patch`, `list_patterns`, `generate_ai_pattern`, `refine_ai_pattern`
- **Verified (`hub\test\core.test.js`):**
  - Ran `npm test` in `hub/` (see latest test suite covering core schemas, `createBlankPattern`/`recordNoteAtStep`, `fm1-hub-map.json`, 4-slot warming, Pattern Sequencer store/LLM, HTML `<script>` `vm.Script` compile check, and MCP `stdio` tools).

---

## Remaining Roadmap (Not Yet Implemented)

- **Phase 3 — Engine Bridge, Hardware MIDI & Live Macros:** Virtual MIDI (`loopMIDI`) or direct engine bridge to `fm1-live.exe`, incoming MIDI listener (`easymidi` / MIDI port), and live hardware triggers for `presets.json` macros (`Chaos Envelope`, `Algorithm Roulette`, `Smart Macro Assign`).
- **Phase 4 — Local WebSocket Dashboard (MVP):** Browser UI on `ws://localhost:3000` displaying active style, 4-slot readiness, and live operator/ADSR telemetry.
- **v2 Enhancements:** 24 PPQN MIDI Clock **Stage & Snap** bar quantization, **Ghost Call-and-Response**, ESP32-S3 USB Serial telemetry, and Raspberry Pi USB Ethernet gadget kiosk mode.
