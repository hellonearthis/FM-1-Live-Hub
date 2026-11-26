import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  activateAtekFlashSlot,
  listAtekFlashPresets,
  readAtekActivePattern,
  readAtekFlashPreset,
  writeAtekFlashPreset,
} from '../core/atekFlashCodec.js';
import {
  compositionToMidiFileBytes,
  compositionTrackToAtek16StepPattern,
  parseCompositionJson,
  validateComposition,
} from '../core/midiComposition.js';
import {
  ATEK303_WAVES,
  patchToAtek303CcMessages,
  patchToMidiCcMessages,
  patchToSkiffCcMessages,
} from '../core/midiMapper.js';
import {
  requestCompositionFromLlm,
  requestCompositionRefinementFromLlm,
  requestPatternFromLlm,
  requestPatternRefinementFromLlm,
} from './llmClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_PUBLIC_DIR = path.join(HUB_ROOT, 'public');
const DEFAULT_PRESETS_PATH = path.join(HUB_ROOT, 'config', 'presets.json');
const DEFAULT_SAVES_DIR = path.resolve(HUB_ROOT, '..', 'saves');
const DEFAULT_PROMPT_GUIDE_PATH = path.join(HUB_ROOT, 'prompts', 'fm1-midi-composition.md');

const readCompositionPromptGuide = async (guidePath) => {
  try {
    return await fs.readFile(guidePath, 'utf-8');
  } catch {
    return '';
  }
};

const withAtekFlashReload = async (fm1Launcher, shouldReload, writeFn) => {
  const status = fm1Launcher ? fm1Launcher.getStatus() : null;
  const isAtekRunning =
    Boolean(shouldReload) &&
    Boolean(status?.running) &&
    String(status?.firmware || '').toLowerCase().includes('atek303');
  if (isAtekRunning) {
    const { firmware } = status;
    fm1Launcher.stop();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = await writeFn();
    await fm1Launcher.launch(firmware);
    return { result, reloaded: true };
  }
  const result = await writeFn();
  return { result, reloaded: false };
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? JSON.parse(raw) : {};
};

/** Start local HTTP fast-path & live dashboard server on 127.0.0.1. */
export const startFastPathServer = (
  controller,
  port = Number(process.env.FM1_FASTPATH_PORT || 3001),
  {
    fm1Launcher = null,
    patchStore = null,
    patternStore = null,
    llmConfig = null,
    publicDir = DEFAULT_PUBLIC_DIR,
    presetsPath = DEFAULT_PRESETS_PATH,
    savesDir = DEFAULT_SAVES_DIR,
    promptGuidePath = DEFAULT_PROMPT_GUIDE_PATH,
    debugLog = null,
  } = {}
) => {
  const server = http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const urlPath = parsedUrl.pathname;

    try {
      if (method === 'GET' && (urlPath === '/' || urlPath === '/index.html')) {
        const html = await fs.readFile(path.join(publicDir, 'index.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }

      if (method === 'GET' && urlPath === '/status') {
        return sendJson(res, 200, controller.getStatus());
      }

      if (method === 'GET' && urlPath === '/patch') {
        return sendJson(res, 200, controller.getActivePatch());
      }

      if (method === 'GET' && urlPath === '/styles') {
        const styles = await controller.listStyles();
        return sendJson(res, 200, { styles });
      }

      if (method === 'GET' && urlPath === '/logs') {
        return sendJson(res, 200, { logs: debugLog ? debugLog.list() : [] });
      }

      if (method === 'POST' && urlPath === '/logs/clear') {
        if (debugLog) {
          debugLog.clear();
        }
        return sendJson(res, 200, { cleared: true });
      }

      if (method === 'POST' && urlPath === '/logs/client') {
        if (debugLog) {
          const body = await readJsonBody(req);
          debugLog.push(
            body.level || 'info',
            body.source || 'midi',
            body.message || '',
            body.detail ?? null
          );
        }
        return sendJson(res, 200, { logged: true });
      }

      if (method === 'GET' && urlPath === '/presets') {
        const raw = await fs.readFile(presetsPath, 'utf-8');
        return sendJson(res, 200, JSON.parse(raw));
      }

      if (method === 'GET' && urlPath === '/midi-cc') {
        const channel = Number(parsedUrl.searchParams.get('ch') || 1);
        const mode = parsedUrl.searchParams.get('mode') || 'fm';
        const waveParam = parsedUrl.searchParams.get('wave');
        const waveIndex = waveParam !== null && waveParam !== '' ? Number(waveParam) : null;
        const patch = controller.getActivePatch();
        const messages =
          mode === 'atek303'
            ? patchToAtek303CcMessages(patch, channel, waveIndex)
            : mode === 'skiff'
              ? patchToSkiffCcMessages(patch, channel)
              : patchToMidiCcMessages(patch, channel);
        return sendJson(res, 200, {
          channel,
          mode,
          patchName: patch.patchName,
          waves: ATEK303_WAVES,
          messages,
        });
      }

      const consumeMatch = urlPath.match(/^\/slot\/(\d+)\/consume$/);
      if (method === 'POST' && consumeMatch) {
        const result = controller.triggerSlot(Number(consumeMatch[1]));
        return sendJson(res, result.success ? 200 : 409, result);
      }

      const styleMatch = urlPath.match(/^\/style\/([a-z0-9-]+)$/i);
      if (method === 'POST' && styleMatch) {
        const result = await controller.loadStyle(styleMatch[1]);
        return sendJson(res, result.success ? 200 : 400, result);
      }

      if (method === 'POST' && urlPath === '/drift') {
        const body = await readJsonBody(req);
        const result = controller.applyHarmonicDrift(Number(body.deltaRatio ?? 0.15));
        return sendJson(res, 200, result);
      }

      if (method === 'POST' && urlPath === '/morph') {
        const body = await readJsonBody(req);
        const result = controller.morphWithSlot(Number(body.slotId), Number(body.amount));
        return sendJson(res, result.success ? 200 : 409, result);
      }

      if (method === 'POST' && urlPath === '/chaos/engage') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, controller.engageChaos(Number(body.intensity ?? 0.75)));
      }

      if (method === 'POST' && urlPath === '/chaos/release') {
        return sendJson(res, 200, controller.releaseChaos());
      }

      if (method === 'POST' && urlPath === '/roulette') {
        const body = await readJsonBody(req);
        const nextAlgo = body.algorithm !== undefined ? Number(body.algorithm) : undefined;
        return sendJson(res, 200, controller.triggerAlgorithmRoulette(nextAlgo, body.flavorId));
      }

      if (method === 'POST' && urlPath === '/roulette/back') {
        const result = controller.undoAlgorithmRoulette();
        return sendJson(res, result.success ? 200 : 409, result);
      }

      if (method === 'POST' && urlPath === '/roulette/slide') {
        const body = await readJsonBody(req);
        const result = controller.setRouletteSlide(Number(body.position ?? 0));
        return sendJson(res, result.success ? 200 : 409, result);
      }

      if (method === 'GET' && urlPath === '/macro') {
        return sendJson(res, 200, controller.getMacroState());
      }

      if (method === 'POST' && urlPath === '/macro/assign') {
        const result = await controller.assignSmartMacro();
        return sendJson(res, result.success ? 200 : 502, result);
      }

      if (method === 'POST' && urlPath === '/macro/value') {
        const body = await readJsonBody(req);
        const result = controller.setSmartMacroAmount(Number(body.amount ?? 0));
        return sendJson(res, result.success ? 200 : 409, result);
      }

      if (method === 'GET' && urlPath === '/snap-fx') {
        const macroState = controller.getMacroState();
        return sendJson(res, 200, {
          effects: controller.listSnapFx(),
          activeSnapFxId: macroState.activeSnapFxId,
          defaultSnapFxId: macroState.defaultSnapFxId,
        });
      }

      if (method === 'POST' && urlPath === '/snap-fx/engage') {
        const body = await readJsonBody(req);
        const result = controller.engageSnapFx(
          body.id,
          body.intensity !== undefined ? Number(body.intensity) : 1.0
        );
        return sendJson(res, result.success ? 200 : 400, result);
      }

      if (method === 'POST' && urlPath === '/snap-fx/release') {
        return sendJson(res, 200, controller.releaseSnapFx());
      }

      if (method === 'POST' && urlPath === '/snap-fx/set-default') {
        const body = await readJsonBody(req);
        const result = controller.setSnapFxAsDefault(
          body.id,
          body.intensity !== undefined ? Number(body.intensity) : 1.0
        );
        return sendJson(res, result.success ? 200 : 400, result);
      }

      if (method === 'POST' && urlPath === '/snap-fx/reset-default') {
        return sendJson(res, 200, controller.resetSnapFxDefault());
      }

      if (method === 'GET' && urlPath === '/favorites') {
        const favorites = patchStore ? await patchStore.listFavorites() : [];
        return sendJson(res, 200, { favorites });
      }

      if (method === 'POST' && urlPath === '/favorites/save') {
        if (!patchStore) {
          return sendJson(res, 503, { success: false, error: 'Patch store not configured.' });
        }
        const body = await readJsonBody(req);
        const result = await patchStore.saveFavorite(controller.getActivePatch(), {
          style: controller.getStatus().style,
          name: body.name,
        });
        return sendJson(res, result.success ? 200 : 400, result);
      }

      const favLoadMatch = urlPath.match(/^\/favorites\/([a-z0-9_-]+)\/load$/i);
      if (method === 'POST' && favLoadMatch) {
        if (!patchStore) {
          return sendJson(res, 503, { success: false, error: 'Patch store not configured.' });
        }
        const loaded = await patchStore.loadFavorite(favLoadMatch[1]);
        if (!loaded.success) {
          return sendJson(res, 404, loaded);
        }
        return sendJson(res, 200, controller.applyExternalPatch(loaded.value, 'favorite'));
      }

      const favDeleteMatch = urlPath.match(/^\/favorites\/([a-z0-9_-]+)$/i);
      if (method === 'DELETE' && favDeleteMatch) {
        if (!patchStore) {
          return sendJson(res, 503, { success: false, error: 'Patch store not configured.' });
        }
        const deleted = await patchStore.deleteFavorite(favDeleteMatch[1]);
        return sendJson(res, deleted.success ? 200 : 404, deleted);
      }

      if (method === 'GET' && urlPath === '/patterns') {
        const patterns = patternStore ? await patternStore.listPatterns() : [];
        return sendJson(res, 200, { patterns });
      }

      if (method === 'POST' && urlPath === '/patterns/save') {
        if (!patternStore) {
          return sendJson(res, 503, { success: false, error: 'Pattern store not configured.' });
        }
        const body = await readJsonBody(req);
        const result = await patternStore.savePattern(body.pattern, {
          style: controller.getStatus().style,
        });
        return sendJson(res, result.success ? 200 : 400, result);
      }

      if (method === 'POST' && urlPath === '/patterns/generate') {
        if (!patternStore || !llmConfig) {
          return sendJson(res, 503, { success: false, error: 'Pattern generator not configured.' });
        }
        const body = await readJsonBody(req);
        const bpm = Number(body.bpm || 126);
        const userPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        const styleName = controller.getStatus().style;
        const skillPrompt = controller.getActiveSkillPrompt();
        if (debugLog) {
          debugLog.push('info', 'patterns', `Designing AI pattern (${userPrompt || styleName || 'default'} @ ${bpm} BPM)...`);
        }
        const gen = await requestPatternFromLlm({ config: llmConfig, skillPrompt, styleName, bpm, userPrompt });
        if (!gen.success) {
          if (debugLog) debugLog.push('error', 'patterns', 'AI pattern generation failed', gen.error);
          return sendJson(res, 502, gen);
        }
        const saved = await patternStore.savePattern(gen.value, { style: userPrompt || styleName });
        return sendJson(res, saved.success ? 200 : 400, saved);
      }

      if (method === 'POST' && urlPath === '/patterns/refine') {
        if (!patternStore || !llmConfig) {
          return sendJson(res, 503, { success: false, error: 'Pattern refiner not configured.' });
        }
        const body = await readJsonBody(req);
        const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
        if (!feedback) {
          return sendJson(res, 400, { success: false, error: 'Feedback comment is required to refine a pattern.' });
        }
        const allPatterns = await patternStore.listPatterns();
        const found = body.pattern
          ? { pattern: body.pattern }
          : allPatterns.find((p) => p.id === body.patternId);
        if (!found?.pattern) {
          return sendJson(res, 404, { success: false, error: `Pattern "${body.patternId}" not found.` });
        }
        const styleName = controller.getStatus().style;
        const bpm = body.bpm !== undefined ? Number(body.bpm) : found.pattern.bpm;
        if (debugLog) {
          debugLog.push('info', 'patterns', `Refining "${found.pattern.patternName}" (${feedback})...`);
        }
        const refined = await requestPatternRefinementFromLlm({
          config: llmConfig,
          currentPattern: found.pattern,
          feedback,
          styleName,
          bpm,
        });
        if (!refined.success) {
          if (debugLog) debugLog.push('error', 'patterns', 'Pattern refinement failed', refined.error);
          return sendJson(res, 502, refined);
        }
        const saved = await patternStore.savePattern(refined.value, { style: feedback });
        return sendJson(res, saved.success ? 200 : 400, saved);
      }

      const patDeleteMatch = urlPath.match(/^\/patterns\/([a-z0-9_-]+)$/i);
      if (method === 'DELETE' && patDeleteMatch) {
        if (!patternStore) {
          return sendJson(res, 503, { success: false, error: 'Pattern store not configured.' });
        }
        const deleted = await patternStore.deletePattern(patDeleteMatch[1]);
        return sendJson(res, deleted.success ? 200 : 400, deleted);
      }

      if (method === 'GET' && urlPath === '/fm1/status') {
        if (!fm1Launcher) {
          return sendJson(res, 200, { running: false, pid: null, firmware: null, firmwares: [] });
        }
        const firmwares = await fm1Launcher.listFirmwares();
        return sendJson(res, 200, { ...fm1Launcher.getStatus(), firmwares });
      }

      if (method === 'POST' && urlPath === '/fm1/launch') {
        if (!fm1Launcher) {
          return sendJson(res, 503, { success: false, error: 'FM-1 launcher not configured.' });
        }
        const body = await readJsonBody(req);
        const result = await fm1Launcher.launch(body.firmware, {
          mhz: body.mhz,
          useFlashSave: body.useFlashSave ?? true,
          midi: body.midi,
        });
        return sendJson(res, result.success ? 200 : 400, result);
      }

      if (method === 'POST' && urlPath === '/fm1/stop') {
        if (!fm1Launcher) {
          return sendJson(res, 503, { stopped: false, message: 'FM-1 launcher not configured.' });
        }
        return sendJson(res, 200, fm1Launcher.stop());
      }

      const atekFlashPath = path.join(savesDir, '04_atek303.flash');

      if (method === 'GET' && urlPath === '/atek/flash/presets') {
        try {
          const bytes = new Uint8Array(await fs.readFile(atekFlashPath));
          return sendJson(res, 200, { exists: true, presets: listAtekFlashPresets(bytes) });
        } catch {
          return sendJson(res, 200, { exists: false, presets: listAtekFlashPresets(null) });
        }
      }

      if (method === 'POST' && urlPath === '/atek/flash/import') {
        if (!patternStore) {
          return sendJson(res, 503, { success: false, error: 'Pattern store not configured.' });
        }
        const body = await readJsonBody(req);
        const slot = Number(body.slot || 1);
        let bytes;
        try {
          bytes = new Uint8Array(await fs.readFile(atekFlashPath));
        } catch {
          return sendJson(res, 404, { success: false, error: 'saves/04_atek303.flash not found.' });
        }
        const decoded = readAtekFlashPreset(bytes, slot);
        if (!decoded.success) {
          return sendJson(res, 404, decoded);
        }
        const saved = await patternStore.savePattern(decoded.value.pattern, {
          style: 'atek303-flash',
        });
        if (!saved.success) {
          return sendJson(res, 400, saved);
        }
        if (debugLog) {
          debugLog.push('info', 'atek-flash', `Pulled ATEK303 Slot ${slot} ("${decoded.value.name}") -> Hub`);
        }
        return sendJson(res, 200, { success: true, slot, name: decoded.value.name, value: saved.value });
      }

      if (method === 'POST' && urlPath === '/atek/flash/export') {
        const body = await readJsonBody(req);
        const slot = Number(body.slot || 13);
        const setActive = body.setActive !== false;
        const reloadFm1 = Boolean(body.reloadFm1);
        let pattern = body.pattern || null;
        if (!pattern && patternStore && body.patternId) {
          const list = await patternStore.listPatterns();
          pattern = list.find((p) => p.id === body.patternId)?.pattern || null;
        }
        if (!pattern) {
          return sendJson(res, 400, { success: false, error: 'Pattern is required to export to ATEK303 flash.' });
        }

        const { result: written, reloaded } = await withAtekFlashReload(fm1Launcher, reloadFm1, async () => {
          let currentFlash = null;
          try {
            currentFlash = new Uint8Array(await fs.readFile(atekFlashPath));
          } catch {}

          const next = writeAtekFlashPreset(currentFlash, slot, {
            name: body.name || pattern.patternName,
            pattern,
            patch: controller.getActivePatch(),
            setActive,
          });
          if (!next.success) return next;
          await fs.mkdir(savesDir, { recursive: true });
          await fs.writeFile(atekFlashPath, next.value.flash);
          return next;
        });

        if (!written.success) {
          return sendJson(res, 400, written);
        }
        if (debugLog) {
          debugLog.push(
            'info',
            'atek-flash',
            `Pushed "${written.value.name}" -> ATEK303 Slot ${written.value.slot}${reloaded ? ' (reloaded ATEK303)' : ''}`
          );
        }
        return sendJson(res, 200, {
          success: true,
          slot: written.value.slot,
          name: written.value.name,
          presets: listAtekFlashPresets(written.value.flash),
          reloaded,
        });
      }

      if (method === 'POST' && urlPath === '/atek/flash/export-composition') {
        const body = await readJsonBody(req);
        const source =
          typeof body.raw === 'string'
            ? parseCompositionJson(body.raw)
            : validateComposition(body.composition);
        if (!source.success) {
          return sendJson(res, 400, source);
        }

        const comp = source.value;
        const allTracks = Boolean(body.allTracks);
        const startSlot = Math.max(1, Math.min(32, Math.round(Number(body.startSlot || 13))));
        const setActive = body.setActive !== false;
        const reloadFm1 = Boolean(body.reloadFm1);
        const requestedTrackIndex = Math.max(0, Math.min(comp.tracks.length - 1, Math.round(Number(body.trackIndex || 0))));
        const indices = allTracks
          ? comp.tracks.map((_, idx) => idx).slice(0, 32 - startSlot + 1)
          : [requestedTrackIndex];

        const prepared = [];
        for (const idx of indices) {
          const conv = compositionTrackToAtek16StepPattern(comp, idx);
          if (!conv.success) {
            return sendJson(res, 400, conv);
          }
          prepared.push({
            idx,
            trackName: comp.tracks[idx].name,
            pattern: conv.value,
          });
        }

        const { result: batchResult, reloaded } = await withAtekFlashReload(fm1Launcher, reloadFm1, async () => {
          let flash = null;
          try {
            flash = new Uint8Array(await fs.readFile(atekFlashPath));
          } catch {}

          const written = [];
          for (let offset = 0; offset < prepared.length; offset += 1) {
            const targetSlot = startSlot + offset;
            const item = prepared[offset];
            const resWrite = writeAtekFlashPreset(flash, targetSlot, {
              name: item.pattern.patternName,
              pattern: item.pattern,
              patch: controller.getActivePatch(),
              setActive: setActive && offset === 0,
            });
            if (!resWrite.success) return resWrite;
            flash = resWrite.value.flash;
            written.push({
              slot: resWrite.value.slot,
              name: resWrite.value.name,
              trackName: item.trackName,
            });
          }

          await fs.mkdir(savesDir, { recursive: true });
          await fs.writeFile(atekFlashPath, flash);
          return { success: true, value: { written, flash } };
        });

        if (!batchResult.success) {
          return sendJson(res, 400, batchResult);
        }
        if (debugLog) {
          const summary = batchResult.value.written.map((w) => `#${w.slot}:${w.name}`).join(', ');
          debugLog.push(
            'info',
            'atek-flash',
            `Pushed composition "${comp.title}" -> ${summary}${reloaded ? ' (reloaded ATEK303)' : ''}`
          );
        }
        return sendJson(res, 200, {
          success: true,
          written: batchResult.value.written,
          presets: listAtekFlashPresets(batchResult.value.flash),
          reloaded,
        });
      }

      if (method === 'POST' && urlPath === '/atek/flash/activate') {
        const body = await readJsonBody(req);
        const slot = Number(body.slot || 1);
        const reloadFm1 = Boolean(body.reloadFm1);

        const { result: actRes, reloaded } = await withAtekFlashReload(fm1Launcher, reloadFm1, async () => {
          let currentFlash;
          try {
            currentFlash = new Uint8Array(await fs.readFile(atekFlashPath));
          } catch {
            return { success: false, statusCode: 404, error: 'saves/04_atek303.flash not found.' };
          }
          const activated = activateAtekFlashSlot(currentFlash, slot);
          if (!activated.success) {
            return { ...activated, statusCode: 400 };
          }
          await fs.writeFile(atekFlashPath, activated.value.flash);
          return activated;
        });

        if (!actRes.success) {
          return sendJson(res, actRes.statusCode || 400, { success: false, error: actRes.error });
        }
        if (debugLog) {
          debugLog.push(
            'info',
            'atek-flash',
            `Activated ATEK303 Slot #${actRes.value.slot} ("${actRes.value.name}")${reloaded ? ' (reloaded ATEK303)' : ''}`
          );
        }
        return sendJson(res, 200, {
          success: true,
          slot: actRes.value.slot,
          name: actRes.value.name,
          reloaded,
        });
      }

      if (method === 'GET' && urlPath === '/compositions/prompt-guide') {
        const guide = await readCompositionPromptGuide(promptGuidePath);
        return sendJson(res, 200, { success: true, guide });
      }

      if (method === 'POST' && urlPath === '/compositions/import') {
        const body = await readJsonBody(req);
        const result =
          typeof body.raw === 'string'
            ? parseCompositionJson(body.raw)
            : validateComposition(body.composition ?? body);
        return sendJson(res, result.success ? 200 : 400, result);
      }

      if (method === 'POST' && urlPath === '/compositions/generate') {
        if (!llmConfig) {
          return sendJson(res, 503, { success: false, error: 'Composition LLM not configured.' });
        }
        const body = await readJsonBody(req);
        const target = typeof body.target === 'string' ? body.target : 'skiff';
        const bpm = Number(body.bpm || 120);
        const lengthBeats = Number(body.lengthBeats || (target === 'atek303' ? 4 : 8));
        const userPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        const key = typeof body.key === 'string' ? body.key.trim() : '';
        const promptGuide = await readCompositionPromptGuide(promptGuidePath);
        if (debugLog) {
          debugLog.push('info', 'compositions', `Generating ${target} MIDI composition (${userPrompt || 'groove'} @ ${bpm} BPM)...`);
        }
        const gen = await requestCompositionFromLlm({
          config: llmConfig,
          promptGuide,
          userPrompt,
          target,
          bpm,
          lengthBeats,
          key,
        });
        if (!gen.success) {
          if (debugLog) debugLog.push('error', 'compositions', 'Composition generation failed', gen.error);
          return sendJson(res, 502, gen);
        }
        if (debugLog) {
          debugLog.push('info', 'compositions', `Generated "${gen.value.title}" (${gen.value.tracks.length} tracks, ${gen.value.length_beats} beats)`);
        }
        return sendJson(res, 200, gen);
      }

      if (method === 'POST' && urlPath === '/compositions/refine') {
        if (!llmConfig) {
          return sendJson(res, 503, { success: false, error: 'Composition LLM not configured.' });
        }
        const body = await readJsonBody(req);
        const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
        if (!feedback) {
          return sendJson(res, 400, { success: false, error: 'Feedback text is required to refine a composition.' });
        }
        const current =
          typeof body.raw === 'string'
            ? parseCompositionJson(body.raw)
            : validateComposition(body.composition);
        if (!current.success) {
          return sendJson(res, 400, current);
        }
        const promptGuide = await readCompositionPromptGuide(promptGuidePath);
        const refined = await requestCompositionRefinementFromLlm({
          config: llmConfig,
          promptGuide,
          currentComposition: current.value,
          feedback,
        });
        if (!refined.success) {
          if (debugLog) debugLog.push('error', 'compositions', 'Composition refinement failed', refined.error);
          return sendJson(res, 502, refined);
        }
        if (debugLog) {
          debugLog.push('info', 'compositions', `Refined "${refined.value.title}"`);
        }
        return sendJson(res, 200, refined);
      }

      if (method === 'POST' && urlPath === '/compositions/to-pattern') {
        const body = await readJsonBody(req);
        const source =
          typeof body.raw === 'string'
            ? parseCompositionJson(body.raw)
            : validateComposition(body.composition);
        if (!source.success) {
          return sendJson(res, 400, source);
        }
        const trackIndex = Number(body.trackIndex || 0);
        const converted = compositionTrackToAtek16StepPattern(source.value, trackIndex);
        if (!converted.success) {
          return sendJson(res, 400, converted);
        }
        if (body.save && patternStore) {
          const saved = await patternStore.savePattern(converted.value, {
            style: `comp:${source.value.title}`,
          });
          return sendJson(res, saved.success ? 200 : 400, saved);
        }
        return sendJson(res, 200, converted);
      }

      if (method === 'POST' && urlPath === '/compositions/export-mid') {
        const body = await readJsonBody(req);
        const source =
          typeof body.raw === 'string'
            ? parseCompositionJson(body.raw)
            : validateComposition(body.composition);
        if (!source.success) {
          return sendJson(res, 400, source);
        }
        const bytes = compositionToMidiFileBytes(source.value);
        const safeName =
          source.value.title
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '_')
            .replace(/^_|_$/g, '') || 'fm1_composition';
        res.writeHead(200, {
          'Content-Type': 'audio/midi',
          'Content-Disposition': `attachment; filename="${safeName}.mid"`,
          'Content-Length': String(bytes.length),
        });
        return res.end(Buffer.from(bytes));
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return sendJson(res, 500, { error: message });
    }
  });

  server.on('error', (err) => {
    console.error(`[fm1-hub] fast-path HTTP error on port ${port}: ${err.message}`);
  });

  server.listen(port, '127.0.0.1', () => {
    const actualPort = server.address()?.port ?? port;
    console.error(`[fm1-hub] fast-path HTTP listening on http://127.0.0.1:${actualPort}`);
  });

  return server;
};
