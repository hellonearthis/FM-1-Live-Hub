# FM-1 Live Hub & AI Patch Deck

Desktop control deck, local AI sound & composition studio, and bidirectional hardware/emulator bridge for the **M-VAVE FM-1** synthesizer and **`fm1-emu` / `fm1-live.exe`**.

Built with an Electron UI, a pure functional Node.js core, Web MIDI hardware routing, an MCP server (`hub/src/server.js`), and native bridges for **ATEK303 v1.4** (`.flash` AT64 codec & CC mode) and **Skiff v2.7.2** (6-track MIDI, FX sends, and native `REMOTE` control).

---

## 1. Prerequisites & Installation

1. **Node.js 20+** and **npm**
2. Install Hub dependencies:
   ```powershell
   cd hub
   npm install
   ```
3. **FM-1 Emulator Binaries** *(not included in this repo)*:
   - Download `fm1-live.exe` and `fm1-emu.exe` from [joakimeriksson/fm1-emu](https://github.com/joakimeriksson/fm1-emu) and place them in the repository root (`FM-1\`).
4. **Community Firmwares (`.fwsc`)** *(not included in this repo)*:
   - Download `04_atek303.fwsc` ([ATEK303 v1.4](https://github.com/animatek/FM1-Animatek)) and `skiff-2.7.2.fwsc` ([Skiff v2.7.2](https://github.com/illuminus5/skiff)) into `firmwares\`.
   - See [firmwares/README.md](firmwares/README.md) and the 486-firmware [FM1_FIRMWARE_CATALOG.md](firmwares/FM1_FIRMWARE_CATALOG.md).
5. **Virtual MIDI Port on Windows (`loopMIDI`)**:
   - Install **loopMIDI** and create a virtual MIDI port (e.g. `FM-1 Hub`) if you want to route Web MIDI from the Hub into `fm1-live.exe`.
   - Select that port under **MIDI Out** in **Section 2**.

---

## 2. Local LLM Setup (AI Features)

The Hub uses a **local OpenAI-compatible Chat Completions server** for AI patch generation, Smart Macros, 16-step sequence design/refinement, and multi-track MIDI compositions.

### Requirements
Your LLM backend must expose:
1. `GET /v1/models` — returns loaded model IDs
2. `POST /v1/chat/completions` — supports **Structured Outputs** (`response_format: { type: "json_schema", json_schema: { strict: true, ... } }`)

Compatible local backends include:
- **Unsloth Studio** *(default — port `8888`, verified with `gemma-4-12B-it-GGUF`)*
- **llama.cpp (`llama-server`)** *(port `8080`)*
- **LM Studio** *(port `1234`)*
- **Ollama** *(OpenAI endpoint on port `11434`)*

### Default Endpoint & Auto-Model Detection
Out of the box, [`hub/src/shell/llmClient.js`](hub/src/shell/llmClient.js) connects to:
- **Endpoint:** `http://127.0.0.1:8888/v1/chat/completions`
- **Model selection:** Automatically queries `GET /v1/models` on the same host/port and picks the model marked `loaded: true` (or `status.value === "loaded"`), falling back to the first listed model ID.
- **Timeout:** `60000` ms (`60` seconds).

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `FM1_LLM_URL` | `http://127.0.0.1:8888/v1/chat/completions` | Chat Completions URL of your local LLM server |
| `FM1_LLM_MODEL` | *(auto-detected via `/v1/models`)* | Pin a specific model ID instead of auto-detecting |
| `FM1_LLM_TIMEOUT_MS` | `60000` | Request timeout in milliseconds (raise to `120000` on slower GPUs/CPUs) |

#### Using a Different Port or Backend
You can set these variables permanently in `Launch FM-1 App.bat` or per session in PowerShell before starting Electron:

- **Unsloth Studio (default `8888`):** Start Unsloth Studio and make sure a model is loaded (`http://127.0.0.1:8888/v1/models`). No env vars needed.
- **LM Studio (`1234`):**
  ```powershell
  $env:FM1_LLM_URL="http://127.0.0.1:1234/v1/chat/completions"
  ```
- **llama.cpp `llama-server` (`8080`):**
  ```powershell
  $env:FM1_LLM_URL="http://127.0.0.1:8080/v1/chat/completions"
  ```
- **Ollama (`11434`):**
  ```powershell
  $env:FM1_LLM_URL="http://127.0.0.1:11434/v1/chat/completions"
  $env:FM1_LLM_MODEL="qwen2.5:14b"
  ```

### What the LLM Powers & Where Prompts Live
- **Section 3 — 4-Slot AI Patch Deck:** Warms 4 FM-1 patch roles (`Bass`, `Lead`, `Pad`, `Perc`) in the background for 0 ms live switching using genre rules in `hub/skills/*.md` (`acid-techno`, `ambient-dub`, `chicago-acid-house`, `cyberpunk-electro`, `detroit-techno`, `industrial-techno`).
- **Section 4 — AI Smart Macro Assign:** Picks 3 expressive FM parameters and sweep ranges for the active patch.
- **Section 2B — 16-Step Pattern AI:** Generates new patterns (`Design New (AI)`) or edits the active pattern (`Refine Active`, e.g. `"more energetic"`, `"calmer"`).
- **Section 2C — Multi-Track MIDI Composition Studio:** Generates or refines multi-track JSON compositions following [`hub/prompts/fm1-midi-composition.md`](hub/prompts/fm1-midi-composition.md) using scientific note names (`"E4"`, `"F#3"`, `"Bb2"`).

### Using External Chat LLMs (No Local GPU Required)
You can use **Section 2C** and **Section 2B** without any local LLM server running:
1. Click **`Copy Skill Prompt`** in **Section 2C** (copies [`hub/prompts/fm1-midi-composition.md`](hub/prompts/fm1-midi-composition.md)).
2. Paste those rules into any chat LLM along with your song/motif request.
3. Paste the returned JSON into the **Section 2C** editor box (commented JSONC and code fences are stripped automatically) and click **`Import / Validate JSON`**.

### Troubleshooting LLM Connections
- **Connection refused on `127.0.0.1:8888`:** Make sure Unsloth Studio (or your chosen LLM server) is running, or set `FM1_LLM_URL` to the port your server uses.
- **"No active model returned":** Confirm a model is loaded in your LLM app by checking `http://127.0.0.1:8888/v1/models` in a browser or PowerShell (`Invoke-RestMethod http://127.0.0.1:8888/v1/models`).
- **Timeouts on slower hardware:** Set `FM1_LLM_TIMEOUT_MS=120000` (or `180000`) and trigger 1 action at a time while warming slots.
- **Schema errors:** Ensure your backend supports OpenAI `response_format: { type: "json_schema", strict: true }`. Check **Section 5. Live Debugging Console** in the Hub for exact HTTP/LLM error messages.

---

## 3. Launching the Hub & Window Settings

Double-click or run from PowerShell:
```powershell
.\Launch FM-1 App.bat
```
*(Or run `cd hub && npm run electron` directly.)*

`Launch FM-1 App.bat` locks the Hub window size by default:
- `FM1_WINDOW_WIDTH=1180`
- `FM1_WINDOW_HEIGHT=1056`
- `FM1_WINDOW_X=` / `FM1_WINDOW_Y=` *(blank = centered; set pixel coordinates to pin screen position)*
- `FM1_WINDOW_LOCK=1` *(set to `0` to remember manual resize/move bounds in `hub/.electron-data/window-bounds.json`)*

---

## 4. ATEK303 v1.4 & Skiff v2.7.2 Workflows

### ATEK303 v1.4
- **Safe CC Mode:** Selecting `04_atek303.fwsc` sets **CC Mode** to **`ATEK303 (Safe Tuning)`**, keeping `CC 78` locked at center (`64`) while mapping `CC 74/71/75/76/77/79` (14 oscillator waves + cutoff/res/env/decay/accent).
- **Bidirectional `.flash` Sync (`saves/04_atek303.flash`):**
  - Clickable saved slot pads + **`↻ Refresh`** let you pull any ATEK303 preset into **Section 2B** or jump ATEK303 straight to a slot (**`⚡ Jump ATEK303 → Slot`**).
  - In **Section 2C**, click **`↑ Send Track → ATEK303`** or **`↑ All Tracks → ATEK303`** to write tracks straight into `.flash` slots (with **`Auto-Reload ATEK303`** checked to refresh `fm1-live.exe` immediately).
- **Zero-Gap Live Playback:** To switch patterns without restarting `fm1-live.exe`, leave ATEK303's internal sequencer stopped, click **Section 2B `Play Sequence`**, and left-click slot pads to queue seamless Step-1 switches (or turn ATEK303's `PRESETS` knob while playing).

### Skiff v2.7.2
- **6-Track Channel Jump (`T1`–`T6`):** One-click channel switching (`Ch 1–6`) synced with **Section 2** and **Section 2C** track pills.
- **Native `REMOTE` (`CC 102–115`):** Works out of the box with Skiff's `MENU › MIDI › REMOTE` (**`Skiff PLAY`**, **`REC`**, **`EDIT`**, **`SAVE`**).
- **1-Click Recording:** Use **`⏺ Record Pattern → Skiff Track`** (Section 2B) or **`⏺ Record → Skiff`** (Section 2C) to arm Skiff REC, send clocked MIDI (`24 PPQN`), and disarm automatically.
- **Samples / Two-Way SysEx:** Skiff supports uploading samples via USB-MIDI SysEx in the [Skiff Browser Editor](https://illuminus5.github.io/skiff/webapp/editor/) when connected to **real FM-1 hardware** (`fm1-live.exe v0.5.1` on Windows does not send MIDI Out back to WinMM).

---

## 5. MCP Servers & Testing

- **Hub MCP Server (`hub/src/server.js`):** Exposes patch deck telemetry, styles, and generation controls over stdio MCP.
- **Emulator MCP Server (`mcp/fm1_mcp.py`):** Wraps `fm1-live.exe` and `fm1-emu.exe` for headless screenshots, WAV rendering, and benchmarks (see [mcp/README.md](mcp/README.md)).
- **Run Automated Tests:**
  ```powershell
  cd hub
  npm test
  ```
