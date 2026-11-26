import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  applyAlgorithmRoulette,
  applyChaosEnvelope,
  applySmartMacroValue,
  interpolatePatchChain,
  ROULETTE_FLAVORS,
  validateSmartMacro,
} from '../src/core/copilotMacros.js';
import {
  applySlotPatch,
  beginLoadStyle,
  createInitialDeckState,
} from '../src/core/deckState.js';
import {
  activateAtekFlashSlot,
  createBlankFlashImage,
  listAtekFlashPresets,
  readAtekActivePattern,
  readAtekFlashPreset,
  writeAtekFlashPreset,
} from '../src/core/atekFlashCodec.js';
import {
  compositionToMidiFileBytes,
  compositionTrackToAtek16StepPattern,
  midiToNoteName,
  noteNameToMidi,
  parseCompositionJson,
  validateComposition,
} from '../src/core/midiComposition.js';
import {
  ATEK303_CC_MAP,
  ATEK303_WAVES,
  DEFAULT_CC_MAP,
  encodeSkiffRemoteButton,
  matchPresetTrigger,
  parseMidiMessage,
  patchToAtek303CcMessages,
  patchToMidiCcMessages,
  patchToSkiffCcMessages,
  SKIFF_CC_MAP,
  SKIFF_REMOTE_BUTTON_CC,
} from '../src/core/midiMapper.js';
import {
  DEFAULT_PATCH,
  interpolatePatches,
  nudgeModulators,
  validatePatch,
} from '../src/core/patchSchema.js';
import {
  advanceStep,
  createBlankPattern,
  createInitialSequencerState,
  quantizeLiveStep,
  queuePatternSwitch,
  recordNoteAtStep,
  STARTER_PATTERNS,
  validatePattern,
} from '../src/core/patternSequencer.js';
import { applySnapFx, SNAP_FX_LIST } from '../src/core/snapFx.js';
import { createDebugLog } from '../src/shell/debugLog.js';
import { createDeckController } from '../src/shell/deckController.js';
import { startFastPathServer } from '../src/shell/fastPathHttp.js';
import {
  createLlmConfig,
  requestPatternFromLlm,
  requestPatternRefinementFromLlm,
} from '../src/shell/llmClient.js';
import { createPatchStore } from '../src/shell/patchStore.js';
import { createPatternStore } from '../src/shell/patternStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(HUB_ROOT, 'skills');

test('validatePatch accepts valid patch and rejects invalid algorithm/operator count', () => {
  const valid = validatePatch(DEFAULT_PATCH);
  assert.equal(valid.success, true);
  assert.equal(valid.value.patchName, 'Init Cyber Bass');

  const badAlgo = validatePatch({ ...DEFAULT_PATCH, algorithm: 9 });
  assert.equal(badAlgo.success, false);

  const badOps = validatePatch({ ...DEFAULT_PATCH, operators: DEFAULT_PATCH.operators.slice(0, 3) });
  assert.equal(badOps.success, false);
});

test('interpolatePatches and nudgeModulators preserve immutability and lock Op 1 ratio', () => {
  const patchB = {
    ...DEFAULT_PATCH,
    patchName: 'Acid Lead',
    algorithm: 4,
    feedback: 0.85,
    operators: DEFAULT_PATCH.operators.map((op) => ({
      ...op,
      ratio: op.id === 1 ? 2.0 : 4.0,
      level: 0.5,
    })),
  };

  const mid = interpolatePatches(DEFAULT_PATCH, patchB, 0.5);
  assert.equal(mid.algorithm, 4);
  assert.equal(mid.feedback, 0.7);
  assert.equal(DEFAULT_PATCH.feedback, 0.55);

  const drifted = nudgeModulators(DEFAULT_PATCH, 0.25);
  assert.equal(drifted.operators[0].ratio, DEFAULT_PATCH.operators[0].ratio);
  assert.equal(drifted.operators[1].ratio, 2.25);
  assert.equal(DEFAULT_PATCH.operators[1].ratio, 2.0);
});

test('deckState drops stale generationEpoch responses', () => {
  const s0 = createInitialDeckState();
  const s1 = beginLoadStyle(s0, 'cyberpunk-electro', 'prompt-1');
  const s2 = beginLoadStyle(s1, 'acid-techno', 'prompt-2');

  const afterStale = applySlotPatch(s2, 0, s1.generationEpoch, DEFAULT_PATCH);
  assert.equal(afterStale.slots[0].patch, null);

  const afterCurrent = applySlotPatch(s2, 0, s2.generationEpoch, DEFAULT_PATCH);
  assert.equal(afterCurrent.slots[0].patch?.patchName, 'Init Cyber Bass');
});

test('createDeckController auto-detects model via /v1/models, warms all 4 slots, and refills on trigger', async () => {
  const callCounter = { count: 0 };
  const mockFetch = async (url, init) => {
    if (url === 'http://127.0.0.1:8888/v1/models') {
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'unsloth/active-model' }] }),
      };
    }
    assert.equal(url, 'http://127.0.0.1:8888/v1/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'unsloth/active-model');
    callCounter.count += 1;
    const patch = {
      ...DEFAULT_PATCH,
      patchName: `Generated-${callCounter.count}`,
    };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n' + JSON.stringify(patch) + '\n```' } }],
      }),
    };
  };

  const applied = [];
  const controller = createDeckController({
    skillsDir: SKILLS_DIR,
    llmConfig: createLlmConfig({}),
    fetchImpl: mockFetch,
    onPatchApplied: (patch, meta) => applied.push({ patch, meta }),
  });

  const loadRes = await controller.loadStyle('cyberpunk-electro', { waitForWarm: true });
  assert.equal(loadRes.success, true);
  assert.equal(loadRes.value.slots.every((s) => s.ready), true);
  assert.equal(callCounter.count, 4);

  const trig = controller.triggerSlot(0);
  assert.equal(trig.success, true);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].meta.slotId, 0);

  await new Promise((r) => setTimeout(r, 25));
  assert.equal(callCounter.count, 5);
  assert.equal(controller.getStatus().slots[0].ready, true);
});

test('MCP stdio server responds to initialize, tools/list, list_music_styles, and get_deck_status', async () => {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: HUB_ROOT,
    env: { ...process.env, FM1_DISABLE_HTTP: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const responses = new Map();
  const bufferRef = { text: '' };

  child.stdout.on('data', (chunk) => {
    bufferRef.text += chunk.toString('utf-8');
    const lines = bufferRef.text.split('\n');
    bufferRef.text = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined) {
        responses.set(msg.id, msg);
      }
    }
  });

  const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');

  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'fm1-test', version: '1.0' },
    },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'list_music_styles', arguments: {} },
  });
  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'get_deck_status', arguments: {} },
  });

  const deadline = Date.now() + 5000;
  while (responses.size < 4 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }

  child.kill();

  assert.equal(responses.has(1), true);
  assert.equal(responses.has(2), true);
  assert.equal(responses.has(3), true);
  assert.equal(responses.has(4), true);

  const toolNames = responses.get(2).result.tools.map((t) => t.name);
  assert.deepEqual(toolNames, [
    'list_music_styles',
    'set_music_style',
    'trigger_cached_patch',
    'get_deck_status',
    'get_active_patch',
    'morph_patch_with_slot',
    'apply_harmonic_drift',
    'engage_chaos_envelope',
    'release_chaos_envelope',
    'algorithm_roulette',
    'assign_smart_macro',
    'set_smart_macro_value',
    'list_snap_fx',
    'engage_snap_fx',
    'release_snap_fx',
    'list_favorite_patches',
    'save_favorite_patch',
    'load_favorite_patch',
    'list_patterns',
    'generate_ai_pattern',
    'refine_ai_pattern',
  ]);

  const stylesPayload = JSON.parse(responses.get(3).result.content[0].text);
  for (const expectedStyle of [
    'acid-techno',
    'ambient-dub',
    'chicago-acid-house',
    'cyberpunk-electro',
    'detroit-techno',
    'industrial-techno',
  ]) {
    assert.ok(stylesPayload.styles.includes(expectedStyle), `Missing skill: ${expectedStyle}`);
  }
  assert.equal(stylesPayload.llmEndpoint, 'http://127.0.0.1:8888/v1/chat/completions');
  assert.equal(stylesPayload.llmModel, 'auto (from /v1/models)');

  const statusPayload = JSON.parse(responses.get(4).result.content[0].text);
  assert.equal(statusPayload.slots.length, 4);
  assert.equal(statusPayload.activePatchName, 'Init Cyber Bass');
});

test('fastPathHttp serves live dashboard HTML, /status JSON, /styles JSON, and /logs', async () => {
  const debugLog = createDebugLog();
  debugLog.push('info', 'test', 'Dashboard boot check');
  const controller = createDeckController({
    skillsDir: SKILLS_DIR,
    llmConfig: createLlmConfig({}),
    debugLog,
  });
  const server = startFastPathServer(controller, 0, { debugLog });
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const htmlRes = await fetch(`${base}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes('FM-1 Live Hub'));
    assert.ok(html.includes('Live Debugging Console'));
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch);
    new vm.Script(scriptMatch[1], { filename: 'public/index.html' });

    const statusRes = await fetch(`${base}/status`);
    assert.equal(statusRes.status, 200);
    const status = await statusRes.json();
    assert.equal(status.slots.length, 4);

    const stylesRes = await fetch(`${base}/styles`);
    assert.equal(stylesRes.status, 200);
    const stylesData = await stylesRes.json();
    assert.ok(stylesData.styles.includes('chicago-acid-house'));

    const logsRes = await fetch(`${base}/logs`);
    assert.equal(logsRes.status, 200);
    const logsData = await logsRes.json();
    assert.equal(logsData.logs.length, 1);
    assert.equal(logsData.logs[0].message, 'Dashboard boot check');

    const clearRes = await fetch(`${base}/logs/clear`, { method: 'POST' });
    assert.equal(clearRes.status, 200);
    const afterClear = await (await fetch(`${base}/logs`)).json();
    assert.equal(afterClear.logs.length, 0);

    const clientLogRes = await fetch(`${base}/logs/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'info', source: 'midi-tx', message: 'Sent test CC' }),
    });
    assert.equal(clientLogRes.status, 200);
    const afterClientLog = await (await fetch(`${base}/logs`)).json();
    assert.equal(afterClientLog.logs[0].message, 'Sent test CC');

    const presetsRes = await fetch(`${base}/presets`);
    assert.equal(presetsRes.status, 200);
    const presetsData = await presetsRes.json();
    assert.ok(presetsData.presets.some((p) => p.id === 'harmonic_drift'));

    const midiCcRes = await fetch(`${base}/midi-cc?ch=2`);
    assert.equal(midiCcRes.status, 200);
    const midiCcData = await midiCcRes.json();
    assert.equal(midiCcData.channel, 2);
    assert.equal(midiCcData.messages.length, 10);
    assert.equal(midiCcData.messages[0][0], 0xb1);

    const atekCcRes = await fetch(`${base}/midi-cc?ch=1&mode=atek303&wave=13`);
    assert.equal(atekCcRes.status, 200);
    const atekCcData = await atekCcRes.json();
    assert.equal(atekCcData.mode, 'atek303');
    assert.equal(atekCcData.waves.length, 14);
    assert.equal(atekCcData.messages.length, 7);
    assert.deepEqual(atekCcData.messages[5], [0xb0, 78, 64]);
    assert.deepEqual(atekCcData.messages[6], [0xb0, 79, 127]);

    const snapRes = await fetch(`${base}/snap-fx`);
    assert.equal(snapRes.status, 200);
    const snapData = await snapRes.json();
    assert.equal(snapData.effects.length, 23);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('midiMapper encodes 7-bit CCs, ATEK303 safe tuning CCs, parses MIDI bytes, and matches presets.json triggers', () => {
  const ccs = patchToMidiCcMessages(DEFAULT_PATCH, 3);
  assert.equal(ccs.length, 10);
  assert.equal(ccs[0][0], 0xb2);
  assert.equal(ccs[0][1], DEFAULT_CC_MAP.algorithm);
  assert.ok(ccs.every(([, , val]) => val >= 0 && val <= 127));

  assert.equal(ATEK303_WAVES.length, 14);
  const atekCcs = patchToAtek303CcMessages(DEFAULT_PATCH, 1, 0);
  assert.equal(atekCcs.length, 7);
  assert.deepEqual(atekCcs.find(([, cc]) => cc === ATEK303_CC_MAP.tuning), [0xb0, 78, 64]);
  assert.deepEqual(atekCcs.find(([, cc]) => cc === ATEK303_CC_MAP.wave), [0xb0, 79, 0]);

  const skiffCcs = patchToSkiffCcMessages(DEFAULT_PATCH, 3);
  assert.equal(skiffCcs.length, 9);
  assert.equal(skiffCcs[0][0], 0xb2);
  assert.ok(skiffCcs.some(([, cc]) => cc === SKIFF_CC_MAP.reverbSend));
  assert.ok(skiffCcs.some(([, cc]) => cc === SKIFF_CC_MAP.delaySend));

  assert.deepEqual(encodeSkiffRemoteButton('PLAY', true, 16), [0xbf, SKIFF_REMOTE_BUTTON_CC.PLAY, 127]);
  assert.deepEqual(encodeSkiffRemoteButton('REC', false, 16), [0xbf, SKIFF_REMOTE_BUTTON_CC.REC, 0]);
  assert.equal(encodeSkiffRemoteButton('UNKNOWN_BTN', true, 16), null);

  const noteOn = parseMidiMessage([0x99, 36, 100]);
  assert.deepEqual(noteOn, { type: 'note_on', channel: 10, note: 36, velocity: 100 });

  const ccMsg = parseMidiMessage([0xb0, 16, 64]);
  assert.deepEqual(ccMsg, { type: 'cc', channel: 1, number: 16, value: 64 });

  const presetsConfig = {
    presets: [
      { id: 'harmonic_drift', midiTrigger: { type: 'note_on', note: 36, channel: 10 } },
      { id: 'style_morph', midiTrigger: { type: 'cc', number: 16, channel: 1 } },
    ],
  };
  assert.equal(matchPresetTrigger(noteOn, presetsConfig)?.id, 'harmonic_drift');
  assert.equal(matchPresetTrigger(ccMsg, presetsConfig)?.id, 'style_morph');
  assert.equal(matchPresetTrigger(parseMidiMessage([0x90, 60, 100]), presetsConfig), null);
});

test('copilotMacros apply Chaos Envelope, Algorithm Roulette gain compensation, and Smart Macro', async () => {
  const chaotic = applyChaosEnvelope(DEFAULT_PATCH, 0.8);
  assert.ok(chaotic.feedback > DEFAULT_PATCH.feedback);
  assert.ok(chaotic.operators[1].decay < DEFAULT_PATCH.operators[1].decay);
  assert.equal(chaotic.operators[0].decay, DEFAULT_PATCH.operators[0].decay);

  // Switch from 1-carrier Algo 2 to 4-carrier Algo 8 -> carrier levels scaled by sqrt(1/4) = 0.5
  const rouletted = applyAlgorithmRoulette(DEFAULT_PATCH, 8);
  assert.equal(rouletted.algorithm, 8);
  assert.equal(rouletted.operators[0].level, 0.475);

  // Every roulette flavor produces a schema-valid patch across all 8 algorithms
  assert.equal(ROULETTE_FLAVORS.length, 10);
  for (const flavor of ROULETTE_FLAVORS) {
    const varied = applyAlgorithmRoulette(DEFAULT_PATCH, 5, flavor.id);
    assert.equal(validatePatch(varied).success, true, `Invalid roulette flavor ${flavor.id}`);
    assert.ok(varied.patchName.includes(flavor.name));
  }

  // interpolatePatchChain smoothly blends across a multi-patch sequence
  const p1 = applyAlgorithmRoulette(DEFAULT_PATCH, 3, 'glass_bell');
  const p2 = applyAlgorithmRoulette(DEFAULT_PATCH, 6, 'metallic_fm');
  const midFirst = interpolatePatchChain([DEFAULT_PATCH, p1, p2], 0.5);
  const midSecond = interpolatePatchChain([DEFAULT_PATCH, p1, p2], 1.5);
  assert.equal(midFirst.feedback, 0.35);
  assert.equal(midSecond.feedback, 0.465);
  assert.deepEqual(interpolatePatchChain([DEFAULT_PATCH, p1, p2], 2), p2);

  const macroCandidate = {
    macroName: 'Acid Bite',
    bindings: [
      { target: 'feedback', min: 0.3, max: 0.9, curve: 'linear' },
      { target: 'op2.level', min: 0.2, max: 1.0, curve: 'exp' },
      { target: 'op2.decay', min: 0.1, max: 0.5, curve: 'linear' },
    ],
  };
  const validMacro = validateSmartMacro(macroCandidate);
  assert.equal(validMacro.success, true);

  const halfMacro = applySmartMacroValue(DEFAULT_PATCH, validMacro.value, 0.5);
  assert.equal(halfMacro.feedback, 0.6);
  assert.equal(halfMacro.operators[1].level, 0.4);
  assert.equal(halfMacro.operators[1].decay, 0.3);

  const mockFetch = async (url) => {
    if (url.endsWith('/models')) {
      return { ok: true, json: async () => ({ data: [{ id: 'mock-model' }] }) };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(macroCandidate) } }],
      }),
    };
  };

  const controller = createDeckController({
    skillsDir: SKILLS_DIR,
    llmConfig: createLlmConfig({}),
    fetchImpl: mockFetch,
  });

  const beforeChaos = controller.getActivePatch();
  controller.engageChaos(0.75);
  assert.ok(controller.getActivePatch().feedback > beforeChaos.feedback);
  controller.releaseChaos();
  assert.deepEqual(controller.getActivePatch(), beforeChaos);

  const assignRes = await controller.assignSmartMacro();
  assert.equal(assignRes.success, true);
  assert.equal(assignRes.value.macro.macroName, 'Acid Bite');
  const setRes = controller.setSmartMacroAmount(1.0);
  assert.equal(setRes.success, true);
  assert.equal(setRes.value.feedback, 0.9);

  // Multi-step Algorithm Roulette history & /roulette/back undo
  const preSpinBaseline = controller.getActivePatch();
  const spin1 = controller.triggerAlgorithmRoulette(3, 'glass_bell');
  assert.equal(spin1.success, true);
  assert.equal(controller.getMacroState().rouletteHistoryDepth, 1);
  const spin2 = controller.triggerAlgorithmRoulette(6, 'metallic_fm');
  assert.equal(spin2.success, true);
  assert.equal(controller.getMacroState().rouletteHistoryDepth, 2);

  const server = startFastPathServer(controller, 0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const slideMid = await fetch(`${base}/roulette/slide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: 1.5 }),
    });
    assert.equal(slideMid.status, 200);
    const slideData = await slideMid.json();
    assert.equal(slideData.value.feedback, (spin1.value.feedback + spin2.value.feedback) / 2);

    const slideZero = await fetch(`${base}/roulette/slide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: 0 }),
    });
    assert.equal(slideZero.status, 200);
    assert.deepEqual(controller.getActivePatch(), preSpinBaseline);
    assert.equal(controller.getMacroState().rouletteHistoryDepth, 2);

    const back1 = await fetch(`${base}/roulette/back`, { method: 'POST' });
    assert.equal(back1.status, 200);
    assert.deepEqual(controller.getActivePatch(), spin1.value);
    assert.equal(controller.getMacroState().rouletteHistoryDepth, 1);

    const back2 = await fetch(`${base}/roulette/back`, { method: 'POST' });
    assert.equal(back2.status, 200);
    assert.deepEqual(controller.getActivePatch(), preSpinBaseline);
    assert.equal(controller.getMacroState().rouletteHistoryDepth, 0);

    const back3 = await fetch(`${base}/roulette/back`, { method: 'POST' });
    assert.equal(back3.status, 409);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('snapFx provides 23 valid genre momentary effects, right-click default lock, and Original Default reset', async () => {
  assert.equal(SNAP_FX_LIST.length, 23);

  for (const fx of SNAP_FX_LIST) {
    const res = applySnapFx(DEFAULT_PATCH, fx.id, 1.0);
    assert.equal(res.success, true, `Failed on ${fx.id}`);
    const valid = validatePatch(res.value);
    assert.equal(valid.success, true, `Schema invalid on ${fx.id}: ${valid.error}`);
  }

  assert.equal(applySnapFx(DEFAULT_PATCH, 'unknown_fx').success, false);

  const controller = createDeckController({
    skillsDir: SKILLS_DIR,
    llmConfig: createLlmConfig({}),
  });
  const baseline = controller.getActivePatch();

  const engageRes = controller.engageSnapFx('trance_gate', 1.0);
  assert.equal(engageRes.success, true);
  assert.equal(controller.getMacroState().activeSnapFxId, 'trance_gate');
  assert.notDeepEqual(controller.getActivePatch(), baseline);

  const releaseRes = controller.releaseSnapFx();
  assert.equal(releaseRes.success, true);
  assert.equal(controller.getMacroState().activeSnapFxId, null);
  assert.deepEqual(controller.getActivePatch(), baseline);

  const server = startFastPathServer(controller, 0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const setDefRes = await fetch(`${base}/snap-fx/set-default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'acid_squelch' }),
    });
    assert.equal(setDefRes.status, 200);
    const acidDefault = controller.getActivePatch();
    assert.equal(controller.getMacroState().defaultSnapFxId, 'acid_squelch');
    assert.ok(acidDefault.patchName.includes('[Acid Squelch]'));

    controller.engageSnapFx('psytrance_fm_zap', 1.0);
    controller.releaseSnapFx();
    assert.deepEqual(controller.getActivePatch(), acidDefault);

    const resetRes = await fetch(`${base}/snap-fx/reset-default`, { method: 'POST' });
    assert.equal(resetRes.status, 200);
    assert.equal(controller.getMacroState().defaultSnapFxId, null);
    assert.deepEqual(controller.getActivePatch(), baseline);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('patchStore saves, lists, loads, and deletes favorites via disk & HTTP', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fm1-favs-'));
  const patchStore = createPatchStore({ patchesDir: tmpDir });
  const controller = createDeckController({
    skillsDir: SKILLS_DIR,
    llmConfig: createLlmConfig({}),
  });
  const server = startFastPathServer(controller, 0, { patchStore });
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const saveRes = await fetch(`${base}/favorites/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Berlin Sub 909' }),
    });
    assert.equal(saveRes.status, 200);
    const saved = await saveRes.json();
    assert.equal(saved.success, true);
    assert.equal(saved.value.id, 'berlin_sub_909');

    const listData = await (await fetch(`${base}/favorites`)).json();
    assert.equal(listData.favorites.length, 1);
    assert.equal(listData.favorites[0].patchName, 'Berlin Sub 909');

    controller.triggerAlgorithmRoulette(7);
    assert.equal(controller.getActivePatch().algorithm, 7);

    const loadRes = await fetch(`${base}/favorites/berlin_sub_909/load`, { method: 'POST' });
    assert.equal(loadRes.status, 200);
    const loaded = await loadRes.json();
    assert.equal(loaded.success, true);
    assert.equal(controller.getActivePatch().patchName, 'Berlin Sub 909');
    assert.equal(controller.getActivePatch().algorithm, DEFAULT_PATCH.algorithm);

    const delRes = await fetch(`${base}/favorites/berlin_sub_909`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    const afterDel = await (await fetch(`${base}/favorites`)).json();
    assert.equal(afterDel.favorites.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('patternSequencer switches queued patterns at Step 0 and patternStore persists custom patterns', async () => {
  assert.equal(STARTER_PATTERNS.length, 4);
  for (const entry of STARTER_PATTERNS) {
    assert.equal(validatePattern(entry.pattern).success, true, `Invalid starter: ${entry.id}`);
  }

  let seq = { ...createInitialSequencerState(STARTER_PATTERNS), playing: true };
  seq = queuePatternSwitch(seq, 'bond_spy_vamp');
  assert.equal(seq.activePatternId, 'acid_303_classic');
  assert.equal(seq.queuedPatternId, 'bond_spy_vamp');

  // Steps 1..15 keep acid_303_classic active
  for (let i = 1; i < 16; i += 1) {
    const res = advanceStep(seq);
    seq = res.nextState;
    assert.equal(res.stepIndex, i);
    assert.equal(res.switchedToPatternId, null);
    assert.equal(seq.activePatternId, 'acid_303_classic');
  }

  // Step 15 -> Step 0 commits the queued switch cleanly at end of sequence!
  const wrap = advanceStep(seq);
  assert.equal(wrap.stepIndex, 0);
  assert.equal(wrap.switchedToPatternId, 'bond_spy_vamp');
  assert.equal(wrap.nextState.activePatternId, 'bond_spy_vamp');
  assert.equal(wrap.nextState.queuedPatternId, null);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fm1-pats-'));
  const patternStore = createPatternStore({ patternsDir: tmpDir });
  const controller = createDeckController({
    skillsDir: SKILLS_DIR,
    llmConfig: createLlmConfig({}),
  });
  const server = startFastPathServer(controller, 0, { patternStore });
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const customPattern = {
      ...STARTER_PATTERNS[0].pattern,
      patternName: 'Custom Techno Sequence',
      bpm: 132,
    };

    const saveRes = await fetch(`${base}/patterns/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: customPattern }),
    });
    assert.equal(saveRes.status, 200);

    const listData = await (await fetch(`${base}/patterns`)).json();
    assert.equal(listData.patterns.length, 5);
    assert.ok(listData.patterns.some((p) => p.id === 'custom_techno_sequence'));

    const delRes = await fetch(`${base}/patterns/custom_techno_sequence`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('requestPatternFromLlm and requestPatternRefinementFromLlm send artist/mood prompts', async () => {
  const seenPrompts = [];
  const mockFetch = async (url, init) => {
    if (url.endsWith('/models')) {
      return { ok: true, json: async () => ({ data: [{ id: 'mock-model' }] }) };
    }
    const body = JSON.parse(init.body);
    seenPrompts.push(body.messages[0].content);
    const outPattern = {
      ...STARTER_PATTERNS[0].pattern,
      patternName: seenPrompts.length === 1 ? 'Devo Synth-Punk 16' : 'Devo Energetic 16',
      bpm: 136,
    };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(outPattern) } }],
      }),
    };
  };

  const config = createLlmConfig({});
  const genRes = await requestPatternFromLlm({
    config,
    skillPrompt: '',
    styleName: 'cyberpunk-electro',
    bpm: 136,
    userPrompt: 'in the style of Devo',
    fetchImpl: mockFetch,
  });
  assert.equal(genRes.success, true);
  assert.equal(genRes.value.patternName, 'Devo Synth-Punk 16');
  assert.ok(seenPrompts[0].includes('in the style of Devo'));

  const refRes = await requestPatternRefinementFromLlm({
    config,
    currentPattern: genRes.value,
    feedback: 'more energetic',
    styleName: 'cyberpunk-electro',
    bpm: 136,
    fetchImpl: mockFetch,
  });
  assert.equal(refRes.success, true);
  assert.equal(refRes.value.patternName, 'Devo Energetic 16');
  assert.ok(seenPrompts[1].includes('more energetic'));
});

test('createBlankPattern, recordNoteAtStep immutability, and fm1-hub-map.json panel bindings', async () => {
  const blank = createBlankPattern('Blank Test', 132, 'F minor');
  assert.equal(validatePattern(blank).success, true);
  assert.equal(blank.steps.length, 16);
  assert.equal(blank.steps.every((s) => s.note === null), true);

  const recorded = recordNoteAtStep(blank, 3, 45, 118, { accent: true });
  assert.equal(blank.steps[3].note, null);
  assert.equal(recorded.steps[3].note, 45);
  assert.equal(recorded.steps[3].velocity, 118);
  assert.equal(recorded.steps[3].accent, true);
  assert.equal(validatePattern(recorded).success, true);

  const cleared = recordNoteAtStep(recorded, 3, null);
  assert.equal(recorded.steps[3].note, 45);
  assert.equal(cleared.steps[3].note, null);
  assert.equal(validatePattern(cleared).success, true);

  assert.deepEqual(quantizeLiveStep(4, 30, 120), { stepIndex: 4, snappedToNext: false });
  assert.deepEqual(quantizeLiveStep(4, 65, 120), { stepIndex: 5, snappedToNext: true });
  assert.deepEqual(quantizeLiveStep(15, 70, 120), { stepIndex: 0, snappedToNext: true });

  const mapRaw = await fs.readFile(path.join(HUB_ROOT, 'config', 'fm1-hub-map.json'), 'utf8');
  const fm1Map = JSON.parse(mapRaw);
  const buttons = new Set(
    fm1Map.bindings.filter((b) => b.to?.type === 'button').map((b) => b.to.button)
  );
  const knobs = new Set(
    fm1Map.bindings.filter((b) => b.to?.type === 'knob').map((b) => b.to.knob)
  );
  assert.ok(buttons.has('PLAY'));
  assert.ok(buttons.has('REC'));
  assert.ok(buttons.has('SEQ'));
  assert.ok(buttons.has('ENV'));
  assert.ok(buttons.has('LFO'));
  assert.ok(knobs.has('KNOB1'));
});

test('atekFlashCodec round-trips AT64 16-step patterns and serves /atek/flash/export & /import', async () => {
  const blankFlash = createBlankFlashImage();
  assert.equal(listAtekFlashPresets(blankFlash).length, 32);

  const samplePattern = STARTER_PATTERNS[0].pattern;
  const writeRes = writeAtekFlashPreset(blankFlash, 13, {
    name: 'HUB ACID 13',
    pattern: samplePattern,
    patch: DEFAULT_PATCH,
  });
  assert.equal(writeRes.success, true);
  assert.equal(writeRes.value.name, 'HUB ACID 13');
  assert.equal(listAtekFlashPresets(blankFlash)[12].used, false);

  const slots = listAtekFlashPresets(writeRes.value.flash);
  assert.equal(slots[12].used, true);
  assert.equal(slots[12].name, 'HUB ACID 13');
  assert.equal(slots[12].bpm, samplePattern.bpm);

  const readRes = readAtekFlashPreset(writeRes.value.flash, 13);
  assert.equal(readRes.success, true);
  assert.equal(readRes.value.pattern.bpm, samplePattern.bpm);
  assert.equal(readRes.value.pattern.steps[0].note, samplePattern.steps[0].note);
  assert.equal(readRes.value.pattern.steps[0].accent, samplePattern.steps[0].accent);
  assert.equal(readRes.value.pattern.steps[1].note, null);
  assert.equal(readRes.value.pattern.steps[2].slide, true);
  assert.equal(validatePattern(readRes.value.pattern).success, true);

  const tmpSaves = await fs.mkdtemp(path.join(os.tmpdir(), 'fm1-atek-saves-'));
  const tmpPatterns = await fs.mkdtemp(path.join(os.tmpdir(), 'fm1-atek-pats-'));
  const patternStore = createPatternStore({ patternsDir: tmpPatterns });
  const controller = createDeckController({ skillsDir: SKILLS_DIR, llmConfig: createLlmConfig({}) });
  const server = startFastPathServer(controller, 0, { patternStore, savesDir: tmpSaves });
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const exportRes = await fetch(`${base}/atek/flash/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 14, pattern: samplePattern, name: 'ATEK HTTP 14' }),
    });
    assert.equal(exportRes.status, 200);
    const exportData = await exportRes.json();
    assert.equal(exportData.success, true);
    assert.equal(exportData.presets[13].name, 'ATEK HTTP 14');

    const importRes = await fetch(`${base}/atek/flash/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 14 }),
    });
    assert.equal(importRes.status, 200);
    const importData = await importRes.json();
    assert.equal(importData.success, true);
    assert.equal(importData.value.pattern.steps[0].note, samplePattern.steps[0].note);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpSaves, { recursive: true, force: true });
    await fs.rm(tmpPatterns, { recursive: true, force: true });
  }
});

test('midiComposition parses canonical + commented legacy JSON, converts to 16-step pattern & SMF .mid, and serves HTTP routes', async () => {
  assert.equal(noteNameToMidi('C4'), 60);
  assert.equal(noteNameToMidi('E4'), 64);
  assert.equal(noteNameToMidi('F#3'), 54);
  assert.equal(noteNameToMidi('Bb2'), 46);
  assert.equal(midiToNoteName(60), 'C4');

  const legacyCommentedJson = `{
    // Legacy split schema with JSONC comments
    "metadata": {
      "title": "James Bond Opening",
      "tempo_bpm": 120,
      "time_signature": "4/4",
      "key": "E Minor"
    },
    "tracks": [
      { "track_name": "Lead Brass", "midi_channel": 0 },
      { "track_name": "Rhythmic Bass", "midi_channel": 1 }
    ],
    "events": [
      {
        "track": "Lead Brass",
        "notes": [
          { "note": "E4", "velocity": 90, "start_time": 0, "duration_beats": 1.0 },
          { "note": "B4", "velocity": 100, "start_time": 1.0, "duration_beats": 1.0, "accent": true }
        ]
      },
      {
        "track": "Rhythmic Bass",
        "notes": [
          { "note": "E2", "velocity": 80, "start_time": 0, "duration_beats": 1.0 },
          { "note": "B1", "velocity": 80, "start_time": 2.0, "duration_beats": 1.0 }
        ]
      }
    ]
  }`;

  const parsed = parseCompositionJson(legacyCommentedJson);
  assert.equal(parsed.success, true);
  assert.equal(parsed.value.title, 'James Bond Opening');
  assert.equal(parsed.value.length_beats, 4);
  assert.equal(parsed.value.tracks.length, 2);
  assert.equal(parsed.value.tracks[0].channel, 1);
  assert.equal(parsed.value.tracks[0].notes[0].midi, 64);
  assert.equal(parsed.value.tracks[1].notes[1].midi, 35);

  const stepPat = compositionTrackToAtek16StepPattern(parsed.value, 0);
  assert.equal(stepPat.success, true);
  assert.equal(stepPat.value.steps[0].note, 64);
  assert.equal(stepPat.value.steps[4].note, 71);
  assert.equal(stepPat.value.steps[4].accent, true);

  const smfBytes = compositionToMidiFileBytes(parsed.value);
  assert.equal(String.fromCharCode(...smfBytes.slice(0, 4)), 'MThd');
  assert.equal(smfBytes[9], 1); // Format 1
  assert.equal(smfBytes[11], 3); // 1 meta track + 2 instrument tracks
  assert.equal(String.fromCharCode(...smfBytes.slice(14, 18)), 'MTrk');

  const tmpPatterns = await fs.mkdtemp(path.join(os.tmpdir(), 'fm1-comp-pats-'));
  const patternStore = createPatternStore({ patternsDir: tmpPatterns });
  const controller = createDeckController({ skillsDir: SKILLS_DIR, llmConfig: createLlmConfig({}) });
  const server = startFastPathServer(controller, 0, { patternStore });
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const guideRes = await fetch(`${base}/compositions/prompt-guide`);
    assert.equal(guideRes.status, 200);
    const guideData = await guideRes.json();
    assert.equal(guideData.success, true);
    assert.ok(guideData.guide.includes('scientific note names'));

    const impRes = await fetch(`${base}/compositions/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: legacyCommentedJson }),
    });
    assert.equal(impRes.status, 200);
    const impData = await impRes.json();
    assert.equal(impData.success, true);

    const toPatRes = await fetch(`${base}/compositions/to-pattern`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition: impData.value, trackIndex: 1, save: true }),
    });
    assert.equal(toPatRes.status, 200);
    const toPatData = await toPatRes.json();
    assert.equal(toPatData.success, true);
    assert.equal(toPatData.value.pattern.steps[0].note, 40);

    const midRes = await fetch(`${base}/compositions/export-mid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition: impData.value }),
    });
    assert.equal(midRes.status, 200);
    assert.equal(midRes.headers.get('content-type'), 'audio/midi');
    const midBuf = new Uint8Array(await midRes.arrayBuffer());
    assert.equal(String.fromCharCode(...midBuf.slice(0, 4)), 'MThd');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpPatterns, { recursive: true, force: true });
  }
});

test('atekFlashCodec writes active working pattern (oid 0) and /atek/flash/export-composition writes all tracks', async () => {
  const blankFlash = createBlankFlashImage();
  const samplePattern = STARTER_PATTERNS[0].pattern;
  const activeWrite = writeAtekFlashPreset(blankFlash, 15, {
    name: 'ACTIVE ACID 15',
    pattern: samplePattern,
    patch: DEFAULT_PATCH,
    setActive: true,
  });
  assert.equal(activeWrite.success, true);

  const activeDecoded = readAtekActivePattern(activeWrite.value.flash);
  assert.equal(activeDecoded.success, true);
  assert.equal(activeDecoded.value.bpm, samplePattern.bpm);
  assert.equal(activeDecoded.value.steps[0].note, samplePattern.steps[0].note);

  const tmpSaves = await fs.mkdtemp(path.join(os.tmpdir(), 'fm1-atek-comp-saves-'));
  const controller = createDeckController({ skillsDir: SKILLS_DIR, llmConfig: createLlmConfig({}) });
  const server = startFastPathServer(controller, 0, { savesDir: tmpSaves });
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const composition = {
      title: 'Spy Groove',
      tempo_bpm: 128,
      time_signature: '4/4',
      key: 'E Minor',
      length_beats: 4,
      tracks: [
        {
          name: 'Lead',
          channel: 1,
          role: 'lead',
          notes: [{ note: 'E4', start: 0, dur: 0.5, vel: 100, accent: true, slide: false }],
        },
        {
          name: 'Bass',
          channel: 2,
          role: 'bass',
          notes: [{ note: 'E2', start: 0, dur: 0.5, vel: 95, accent: false, slide: false }],
        },
      ],
    };

    const batchRes = await fetch(`${base}/atek/flash/export-composition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition, allTracks: true, startSlot: 13 }),
    });
    assert.equal(batchRes.status, 200);
    const batchData = await batchRes.json();
    assert.equal(batchData.success, true);
    assert.equal(batchData.written.length, 2);
    assert.equal(batchData.written[0].slot, 13);
    assert.equal(batchData.written[1].slot, 14);
    assert.equal(batchData.presets[12].used, true);
    assert.equal(batchData.presets[13].used, true);

    const flashBytes = new Uint8Array(await fs.readFile(path.join(tmpSaves, '04_atek303.flash')));
    const slot14 = readAtekFlashPreset(flashBytes, 14);
    assert.equal(slot14.success, true);
    assert.equal(slot14.value.pattern.steps[0].note, 40);

    const directAct = activateAtekFlashSlot(flashBytes, 14);
    assert.equal(directAct.success, true);
    assert.equal(readAtekActivePattern(directAct.value.flash).value.steps[0].note, 40);

    const actRes = await fetch(`${base}/atek/flash/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 14 }),
    });
    assert.equal(actRes.status, 200);
    const actData = await actRes.json();
    assert.equal(actData.success, true);
    assert.equal(actData.slot, 14);

    const updatedFlash = new Uint8Array(await fs.readFile(path.join(tmpSaves, '04_atek303.flash')));
    const newActive = readAtekActivePattern(updatedFlash);
    assert.equal(newActive.success, true);
    assert.equal(newActive.value.steps[0].note, 40);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpSaves, { recursive: true, force: true });
  }
});
