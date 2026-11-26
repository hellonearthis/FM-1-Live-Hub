# **FM-1 \+ MCP \+ MIDI: Code Architecture & Technical Ideas Outline**

# **1\. Central Node.js Hub & State Synchronization**

## **Concept Overview**

The central Node.js process functions as the lightweight, single-threaded single source of truth and state router for the entire ecosystem. Operating simultaneously between human hardware performance inputs (MIDI controllers), AI tool requests (MCP server calls), and the target sound engine (headless FM-1 synth), Node.js prevents parameter mutation races and volume drops. By maintaining a synchronized in-memory state object and dispatching atomic updates to the audio engine, the architecture guarantees that physical knob tweaks and background AI patch morphs execute cleanly without state desynchronization.

* **Unified JSON Patch State:** Maintain a single source of truth in Node.js for operator ratios, algorithm selection, feedback, and ADSR envelopes so physical MIDI inputs and AI tool calls modify the same state without conflicts.  
* **Headless FM-1 Engine Bridge:** Push JSON parameter updates directly to the headless FM-1 synth via UDP, WebSocket, or IPC.  
* **Hardware MIDI Listener (`easymidi` / `webmidi`):** Listen for physical MIDI pad Note-On messages and Control Change (CC) knob turns, updating the shared state and pushing changes immediately to the audio engine.  
* **Bidirectional MIDI Feedback:** Optionally transmit updated CC values back to controllers with motorized faders or LCD screens when the AI mutates a patch.

## **Data Structures & State Examples**

### **FM-1 Patch JSON Schema (FM1\_SCHEMA\_GUIDE)**

```json
{"$schema": "http://json-schema.org/draft-07/schema#", "type": "object", "properties": {"patchName": {"type": "string"}, "algorithm": {"type": "integer", "minimum": 1, "maximum": 8}, "feedback": {"type": "number", "minimum": 0.0, "maximum": 1.0}, "operators": {"type": "array", "minItems": 4, "maxItems": 4, "items": {"type": "object", "properties": {"id": {"type": "integer", "minimum": 1, "maximum": 4}, "ratio": {"type": "number", "minimum": 0.5, "maximum": 16.0}, "level": {"type": "number", "minimum": 0.0, "maximum": 1.0}, "attack": {"type": "number", "minimum": 0.001, "maximum": 10.0}, "decay": {"type": "number", "minimum": 0.001, "maximum": 10.0}, "sustain": {"type": "number", "minimum": 0.0, "maximum": 1.0}, "release": {"type": "number", "minimum": 0.001, "maximum": 10.0}}, "required": ["id", "ratio", "level", "attack", "decay", "sustain", "release"]}}}, "required": ["patchName", "algorithm", "feedback", "operators"]}
```

### **MIDI Preset Configuration (presets.json)**

```json
{
  "activeStyleSkill": "cyberpunk-electro",
  "quantizeBars": 1,
  "presets": [
    {
      "id": "harmonic_drift",
      "midiTrigger": { "type": "note_on", "note": 36, "channel": 10 },
      "mode": "nudge_modulators",
      "syncToDownbeat": false,
      "mcpAction": "mutate_patch"
    },
    {
      "id": "style_morph",
      "midiTrigger": { "type": "cc", "number": 16, "channel": 1 },
      "mode": "crossfade_cached_slots",
      "syncToDownbeat": false,
      "mcpAction": "interpolate_slots"
    },
    {
      "id": "ghost_response",
      "midiTrigger": { "type": "note_on", "note": 37, "channel": 10 },
      "mode": "counterphrase_generator",
      "syncToDownbeat": true,
      "mcpAction": "generate_counterphrase"
    }
  ]
}
```

# **2\. Zero-Latency AI Caching & Timing Architecture**

## **Concept Overview**

Local LLM inference introduces a typical generation delay of 400ms to 2 seconds—a latency profile unacceptable for live musical performance. To achieve zero-latency responsiveness, the architecture cleanly decouples the real-time audio playback path from asynchronous LLM text generation. A 4-slot ring buffer (StylePatchDeck) continuously pre-warms patches in the background according to the active music style. When a musician strikes a physical pad, the patch payload is read instantly from local RAM (0ms latency), while an asynchronous task asynchronously refills the consumed slot in the background. Optionally, in v2 implementations, pending patch updates are aligned with incoming 24 PPQN MIDI clock pulses to commit state updates perfectly on the next bar's downbeat.

* **4-Slot Style Patch Deck (`StylePatchDeck`):** Maintain an in-memory 4-slot ring buffer (Slot 0: Bassline, Slot 1: Lead/Pluck, Slot 2: Pad, Slot 3: Wild-card) that MIDI pads read with 0ms inference latency.  
* **Background Cache Warmer:** Fire asynchronous requests to the local LLM endpoint (`/v1/chat/completions` with `json_object` enforcement) on style load and automatically refill spent slots in the background.  
* **Generation Epoch Cancellation:** Track a `generationEpoch` counter so stale background LLM responses are discarded if the user switches music styles mid-warm.  
* **Direct Hardware Fast-Path:** Expose a local HTTP/WebSocket endpoint alongside the MCP stdio server so physical MIDI pads can trigger `consumeSlot()` directly without LLM host round-trip overhead.  
* **Bar-Quantized Staging Buffer ("Stage & Snap", v2):** Count incoming MIDI Clock pulses (24 PPQN / 96 pulses per 4/4 bar) to hold pending AI patch payloads in a queue and commit them cleanly on Beat 1 of the next bar.

## **Code Example — 4-Slot Background Cache Warmer (patchCache.js)**

```js
import fetch from 'node-fetch';

export class StylePatchDeck {
  constructor(llmEndpoint, schemaGuide) {
    this.llmEndpoint = llmEndpoint;
    this.schemaGuide = schemaGuide;
    this.activeStyle = null;
    this.activeSkillPrompt = '';
    this.generationEpoch = 0;
    this.slots = [
      { id: 0, role: 'Bassline', patch: null, warming: false },
      { id: 1, role: 'Lead/Pluck', patch: null, warming: false },
      { id: 2, role: 'Pad', patch: null, warming: false },
      { id: 3, role: 'Wild-card', patch: null, warming: false }
    ];
  }

  async loadStyle(styleName, skillMarkdownPrompt) {
    this.activeStyle = styleName;
    this.activeSkillPrompt = skillMarkdownPrompt;
    this.generationEpoch++;
    for (const slot of this.slots) {
      slot.patch = null;
      slot.warming = false;
    }
    await this.warmAllSlots();
  }

  async warmAllSlots() {
    const promises = this.slots.map(s => this.refillSlot(s.id));
    await Promise.all(promises);
  }

  async refillSlot(slotId) {
    const slot = this.slots[slotId];
    if (!slot || slot.warming) return;
    slot.warming = true;
    const currentEpoch = this.generationEpoch;

    try {
      const prompt = `System Style Rules:\n${this.activeSkillPrompt}\n\nGenerate an FM-1 patch JSON object specifically styled for slot role: "${slot.role}". Output strict raw JSON conforming to this schema:\n${JSON.stringify(this.schemaGuide)}`;
      const response = await fetch(this.llmEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local-model',
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await response.json();
      const parsedPatch = JSON.parse(data.choices[0].message.content);

      if (this.generationEpoch === currentEpoch) {
        slot.patch = parsedPatch;
      }
    } catch (err) {
      console.error(`Failed to refill slot ${slotId}:`, err);
    } finally {
      if (this.generationEpoch === currentEpoch) {
        slot.warming = false;
      }
    }
  }

  consumeSlot(slotId) {
    const slot = this.slots[slotId];
    if (!slot || !slot.patch) return null;
    const patch = slot.patch;
    slot.patch = null;
    this.refillSlot(slotId);
    return patch;
  }

  getStatus() {
    return {
      style: this.activeStyle,
      epoch: this.generationEpoch,
      slots: this.slots.map(s => ({ id: s.id, role: s.role, ready: !!s.patch, warming: s.warming }))
    };
  }
}
```

# **3\. MCP Server Tools & Music Style Skills**

## **Concept Overview**

To allow instantaneous shifting across genres without rewriting underlying server code, music genre knowledge is completely decoupled into modular Skill files stored as standard Markdown in a /skills directory. When a style skill is loaded (e.g., Cyberpunk Electro vs. Ambient Dub), its system prompt overlays strict guidelines onto the MCP server tools, regulating operator ratio selections, algorithm constraints, and ADSR envelope shapes. The MCP server exposes standardized tools to the client, allowing the AI to query cache status, swap performance styles, or trigger cached patches using unified tool definitions.

* **Dynamic Style Skill Loader (`set_music_style`):** Read standalone Markdown skill files (e.g., `cyberpunk-electro.md`, `ambient-dub.md`) from a `/skills` directory as system-prompt overlays and trigger cache pre-warming.  
* **Structured FM-1 Schema Enforcement:** Inject strict numerical boundaries for algorithms (1–8), feedback (0.0–1.0), operator ratios, and ADSR envelopes into the system prompt.  
* **Zero-Latency Slot Trigger (`trigger_cached_patch`):** MCP tool that applies a pre-warmed slot to the FM-1 engine and queues a background refill.  
* **Deck Telemetry Tool (`get_deck_status`):** Expose active style and per-slot readiness/warming flags for AI inspection and hardware status LEDs.

## **Code Example — MCP Server & Tool Registration (server.js)**

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { StylePatchDeck } from './patchCache.js';

const deck = new StylePatchDeck('http://127.0.0.1:11434/v1/chat/completions', {});
const server = new Server({ name: 'fm1-mcp-server', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'set_music_style',
      description: 'Load a dynamic Markdown style skill file and pre-warm the patch deck cache.',
      inputSchema: {
        type: 'object',
        properties: { styleName: { type: 'string', description: 'Name of skill (e.g. cyberpunk-electro)' } },
        required: ['styleName']
      }
    },
    {
      name: 'trigger_cached_patch',
      description: 'Instantly apply a pre-warmed slot patch from memory and trigger a background refill.',
      inputSchema: {
        type: 'object',
        properties: { slotId: { type: 'number', minimum: 0, maximum: 3 } },
        required: ['slotId']
      }
    },
    {
      name: 'get_deck_status',
      description: 'Inspect the readiness and warming status of all 4 deck slots.',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (name === 'set_music_style') {
    const filePath = path.join(process.cwd(), 'skills', `${args.styleName}.md`);
    const markdown = await fs.readFile(filePath, 'utf-8');
    await deck.loadStyle(args.styleName, markdown);
    return { content: [{ type: 'text', text: `Loaded style ${args.styleName} and initiated pre-warming.` }] };
  }
  if (name === 'trigger_cached_patch') {
    const patch = deck.consumeSlot(args.slotId);
    if (!patch) return { content: [{ type: 'text', text: `Slot ${args.slotId} is not ready.` }] };
    return { content: [{ type: 'text', text: JSON.stringify(patch) }] };
  }
  if (name === 'get_deck_status') {
    return { content: [{ type: 'text', text: JSON.stringify(deck.getStatus()) }] };
  }
  throw new Error(`Tool not found: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## **Style Skill Prompt Structure Example**

```xml
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
```

# **4\. AI Co-Pilot Performance Behaviors (Presets & Macros)**

## **Concept Overview**

Instead of restricting performance control to simple 1-to-1 MIDI knob mappings, AI Co-Pilot behaviors act as intelligent performance macros. When triggered via hardware buttons or CC thresholds, these behaviors apply contextual multi-parameter mutations to active patches. The LLM can modify non-carrier modulator ratios by slight offsets, switch routing algorithms while recalculating gain compensation to avoid volume spikes, generate complementary counter-phrases dynamically, or automatically map dynamic macro curves across multiple operators to single hardware controls.

* **Harmonic Drift:** Periodically nudge non-carrier modulator ratios by small increments while keeping carrier ratios locked to integer multiples.  
* **Algorithm Roulette:** Query the LLM to switch FM routing algorithms while normalizing carrier output levels to prevent volume spikes.  
* **Ghost Call-and-Response (v2):** Capture 2 bars of incoming MIDI notes and generate a complementary 2-bar counter-phrase in the active genre style.  
* **Chaos Envelope:** Momentarily shorten modulator decays and boost feedback on offbeats while holding a pad, snapping back on release.  
* **Smart Macro Assign:** Have the LLM inspect the active patch and map the 3 most expressive modulator/feedback parameters to a single physical CC knob with custom curves.  
* **Patch DNA Morph:** Continuously interpolate float parameters between the active patch and a cached target patch using a MIDI crossfader or slider.

# **5\. External Second-Screen Telemetry & UI**

## **Concept Overview**

Because headless audio servers and embedded synths lack rich visual displays, second-screen telemetry acts as a critical visual feedback loop for performers and audiences. The Node.js hub streams real-time JSON state packets across WebSocket connections or serial USB COM ports. This allows external displays—such as HTML5 Canvas/WebGL web views or microcontroller screens (ESP32 running LVGL)—to visualize active style skills, 4-slot deck readiness, active operator levels, and envelope shapes without adding processing overhead to the synth's real-time audio thread.

* **Local WebSocket Dashboard (MVP):** Serve a full-screen HTML5 Canvas / WebGL UI from Node.js (`ws://localhost:3000`) to a USB-C portable monitor or tablet, displaying active style, 4-slot warming/ready status, and live operator/envelope bars.  
* **USB Serial Microcontroller Display (v2):** Stream compact JSON state packets over a USB COM port (`serialport`) to an ESP32-S3 touch LCD running LVGL / TFT\_eSPI for hardware telemetry and touch-triggered slot switching.  
* **Raspberry Pi USB Ethernet Gadget (v2):** Run a Pi Zero 2 W in `g_ether` mode over a single USB cable booting into Chromium Kiosk mode pointed at the local Node.js dashboard.

## **Data Structure Example — USB Serial Telemetry Packet**

```json
{"style":"cyberpunk-electro","slots":[1,1,0,1],"algo":2,"fb":0.62,"ops":[1.0,3.0,7.0,1.41]}
```

