import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ALGORITHM_CARRIERS,
  applyAlgorithmRoulette,
  applyChaosEnvelope,
  applySmartMacroValue,
  interpolatePatchChain,
  ROULETTE_FLAVORS,
} from '../core/copilotMacros.js';
import { applySnapFx, SNAP_FX_LIST } from '../core/snapFx.js';
import {
  applySlotPatch,
  beginLoadStyle,
  consumeSlot,
  createInitialDeckState,
  markSlotFailed,
  markSlotWarming,
  selectDeckStatus,
  setActivePatch,
} from '../core/deckState.js';
import { interpolatePatches, nudgeModulators, validatePatch } from '../core/patchSchema.js';
import { requestPatchFromLlm, requestSmartMacroFromLlm } from './llmClient.js';

const SAFE_STYLE_NAME = /^[a-z0-9-]+$/i;

/** Create the stateful shell controller coordinating pure deck transitions and async LLM warming. */
export const createDeckController = ({
  skillsDir,
  llmConfig,
  fetchImpl = fetch,
  onPatchApplied = () => {},
  debugLog = null,
}) => {
  const stateRef = { current: createInitialDeckState() };
  const macroRef = {
    chaosSnapshot: null,
    snapFxId: null,
    originalDefaultPatch: stateRef.current.activePatch,
    defaultSnapFxId: null,
    rouletteHistory: [],
    rouletteTarget: null,
    roulettePosition: 0,
    lastRouletteFlavorId: null,
    macro: null,
    basePatch: null,
    amount: 0,
  };

  const log = (level, message, detail = null) => {
    if (debugLog) {
      debugLog.push(level, 'deck', message, detail);
    }
  };

  const listStyles = async () => {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name.slice(0, -3))
      .sort();
  };

  const refillSlot = async (slotId) => {
    const current = stateRef.current;
    const slot = current.slots[slotId];
    if (!slot || slot.warming || !current.activeSkillPrompt) {
      return { success: false, error: 'Slot unavailable or no active style.' };
    }

    const epoch = current.generationEpoch;
    const t0 = Date.now();
    stateRef.current = markSlotWarming(current, slotId);
    log('info', `Warming slot ${slotId} (${slot.role})`, { style: current.activeStyle, epoch });

    const result = await requestPatchFromLlm({
      config: llmConfig,
      skillPrompt: current.activeSkillPrompt,
      role: slot.role,
      fetchImpl,
    });

    const elapsedMs = Date.now() - t0;
    if (result.success) {
      stateRef.current = applySlotPatch(stateRef.current, slotId, epoch, result.value);
      log('info', `Slot ${slotId} ready in ${elapsedMs}ms: ${result.value.patchName}`, {
        algorithm: result.value.algorithm,
        feedback: result.value.feedback,
      });
      return result;
    }

    stateRef.current = markSlotFailed(stateRef.current, slotId, epoch, result.error);
    log('error', `Slot ${slotId} (${slot.role}) failed in ${elapsedMs}ms`, result.error);
    return result;
  };

  const warmAllSlots = async () => {
    const slotIds = stateRef.current.slots.map((slot) => slot.id);
    for (const slotId of slotIds) {
      await refillSlot(slotId);
    }
  };

  const loadStyle = async (styleName, { waitForWarm = false } = {}) => {
    if (typeof styleName !== 'string' || !SAFE_STYLE_NAME.test(styleName)) {
      const error = `Invalid style name "${styleName}". Use alphanumeric/hyphen names only.`;
      log('warn', error);
      return { success: false, error };
    }

    const filePath = path.join(skillsDir, `${styleName}.md`);
    try {
      const markdown = await fs.readFile(filePath, 'utf-8');
      stateRef.current = beginLoadStyle(stateRef.current, styleName, markdown);
      log('info', `Loaded style "${styleName}" (epoch ${stateRef.current.generationEpoch})`);

      const warmPromise = warmAllSlots();
      if (waitForWarm) {
        await warmPromise;
      } else {
        warmPromise.catch((err) => {
          log('error', 'Background warm failed', err instanceof Error ? err.message : String(err));
        });
      }

      return { success: true, value: selectDeckStatus(stateRef.current) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('error', `Failed to load style "${styleName}"`, message);
      return { success: false, error: `Failed to load style "${styleName}": ${message}` };
    }
  };

  const triggerSlot = (slotId) => {
    const { nextState, patch } = consumeSlot(stateRef.current, slotId);
    if (!patch) {
      log('warn', `Trigger rejected: slot ${slotId} is not ready`);
      return { success: false, error: `Slot ${slotId} is not ready.` };
    }

    macroRef.chaosSnapshot = null;
    macroRef.snapFxId = null;
    macroRef.originalDefaultPatch = patch;
    macroRef.defaultSnapFxId = null;
    stateRef.current = nextState;
    log('info', `Triggered slot ${slotId} (0ms) -> ${patch.patchName}`);
    onPatchApplied(patch, { source: 'slot', slotId });
    refillSlot(slotId).catch((err) => {
      log('error', `Background refill failed for slot ${slotId}`, err instanceof Error ? err.message : String(err));
    });

    return { success: true, value: patch };
  };

  const morphWithSlot = (slotId, amount) => {
    const target = stateRef.current.slots[slotId]?.patch;
    if (!target) {
      log('warn', `Morph skipped: slot ${slotId} is not ready`);
      return { success: false, error: `Slot ${slotId} is not ready for morphing.` };
    }
    const morphed = interpolatePatches(stateRef.current.activePatch, target, amount);
    stateRef.current = setActivePatch(stateRef.current, morphed);
    log('info', `Morphed ${Math.round(amount * 100)}% toward slot ${slotId} (${target.patchName})`);
    onPatchApplied(morphed, { source: 'morph', slotId, amount });
    return { success: true, value: morphed };
  };

  const applyHarmonicDrift = (deltaRatio) => {
    const drifted = nudgeModulators(stateRef.current.activePatch, deltaRatio);
    stateRef.current = setActivePatch(stateRef.current, drifted);
    log('info', `Applied Harmonic Drift (${deltaRatio >= 0 ? '+' : ''}${deltaRatio})`);
    onPatchApplied(drifted, { source: 'harmonic_drift', deltaRatio });
    return { success: true, value: drifted };
  };

  const engageSnapFx = (fxId, intensity = 1.0) => {
    if (!macroRef.chaosSnapshot) {
      macroRef.chaosSnapshot = stateRef.current.activePatch;
    }
    const result = applySnapFx(macroRef.chaosSnapshot, fxId, intensity);
    if (!result.success) {
      log('warn', result.error);
      return result;
    }
    macroRef.snapFxId = fxId;
    stateRef.current = setActivePatch(stateRef.current, result.value);
    log('info', `Snap FX ENGAGED: ${fxId}`);
    onPatchApplied(result.value, { source: 'snap_fx_engage', fxId, intensity });
    return result;
  };

  const releaseSnapFx = () => {
    if (!macroRef.chaosSnapshot) {
      macroRef.snapFxId = null;
      return { success: true, value: stateRef.current.activePatch };
    }
    const prevFx = macroRef.snapFxId || 'chaos_envelope';
    const restored = macroRef.chaosSnapshot;
    macroRef.chaosSnapshot = null;
    macroRef.snapFxId = null;
    stateRef.current = setActivePatch(stateRef.current, restored);
    log('info', `Snap FX RELEASED (${prevFx}) -> restored "${restored.patchName}"`);
    onPatchApplied(restored, { source: 'snap_fx_release', fxId: prevFx });
    return { success: true, value: restored };
  };

  const listSnapFx = () => SNAP_FX_LIST;

  const setSnapFxAsDefault = (fxId, intensity = 1.0) => {
    const base = macroRef.originalDefaultPatch;
    const result = applySnapFx(base, fxId, intensity);
    if (!result.success) {
      log('warn', result.error);
      return result;
    }
    const fxMeta = SNAP_FX_LIST.find((fx) => fx.id === fxId);
    const nextPatch = Object.freeze({
      ...result.value,
      patchName: `${base.patchName} [${fxMeta?.name || fxId}]`,
    });
    macroRef.chaosSnapshot = null;
    macroRef.snapFxId = null;
    macroRef.defaultSnapFxId = fxId;
    stateRef.current = setActivePatch(stateRef.current, nextPatch);
    log('info', `Set FM-1 default from Snap FX: ${fxMeta?.name || fxId}`);
    onPatchApplied(nextPatch, { source: 'snap_fx_default', fxId, intensity });
    return { success: true, value: nextPatch };
  };

  const resetSnapFxDefault = () => {
    const restored = macroRef.originalDefaultPatch;
    macroRef.chaosSnapshot = null;
    macroRef.snapFxId = null;
    macroRef.defaultSnapFxId = null;
    stateRef.current = setActivePatch(stateRef.current, restored);
    log('info', `Restored Original Default patch -> "${restored.patchName}"`);
    onPatchApplied(restored, { source: 'snap_fx_reset_default' });
    return { success: true, value: restored };
  };

  const engageChaos = (intensity = 0.75) => engageSnapFx('chaos_envelope', intensity);

  const releaseChaos = () => releaseSnapFx();

  const triggerAlgorithmRoulette = (nextAlgorithm, flavorId = null) => {
    const prev = stateRef.current.activePatch;
    const candidates = [1, 2, 3, 4, 5, 6, 7, 8].filter((a) => a !== prev.algorithm);
    const chosenAlgo =
      Number.isInteger(nextAlgorithm) && nextAlgorithm >= 1 && nextAlgorithm <= 8
        ? nextAlgorithm
        : candidates[Math.floor(Math.random() * candidates.length)];

    const explicitFlavor = flavorId ? ROULETTE_FLAVORS.find((f) => f.id === flavorId) || null : null;
    const flavorPool = ROULETTE_FLAVORS.filter((f) => f.id !== macroRef.lastRouletteFlavorId);
    const chosenFlavor =
      explicitFlavor || flavorPool[Math.floor(Math.random() * flavorPool.length)];

    macroRef.rouletteHistory = [...macroRef.rouletteHistory.slice(-23), prev];
    macroRef.lastRouletteFlavorId = chosenFlavor.id;
    macroRef.chaosSnapshot = null;
    macroRef.snapFxId = null;

    const nextPatch = applyAlgorithmRoulette(prev, chosenAlgo, chosenFlavor.id);
    macroRef.rouletteTarget = nextPatch;
    macroRef.roulettePosition = macroRef.rouletteHistory.length;
    stateRef.current = setActivePatch(stateRef.current, nextPatch);
    const carrierCount = (ALGORITHM_CARRIERS[nextPatch.algorithm] || [1]).length;
    log('info', `Algorithm Roulette: Algo ${prev.algorithm} -> Algo ${nextPatch.algorithm} · ${chosenFlavor.name} (${carrierCount} carrier${carrierCount > 1 ? 's' : ''}, gain compensated)`);
    onPatchApplied(nextPatch, { source: 'algorithm_roulette', algorithm: nextPatch.algorithm, flavorId: chosenFlavor.id });
    return {
      success: true,
      value: nextPatch,
      flavor: chosenFlavor,
      historyDepth: macroRef.rouletteHistory.length,
    };
  };

  const undoAlgorithmRoulette = () => {
    if (macroRef.rouletteHistory.length === 0) {
      return { success: false, error: 'No previous roulette settings in history.' };
    }
    const previous = macroRef.rouletteHistory[macroRef.rouletteHistory.length - 1];
    macroRef.rouletteHistory = macroRef.rouletteHistory.slice(0, -1);
    macroRef.rouletteTarget = macroRef.rouletteHistory.length > 0 ? previous : null;
    macroRef.roulettePosition = macroRef.rouletteHistory.length;
    macroRef.chaosSnapshot = null;
    macroRef.snapFxId = null;
    stateRef.current = setActivePatch(stateRef.current, previous);
    log('info', `Roulette Back -> restored "${previous.patchName}" (Algo ${previous.algorithm})`);
    onPatchApplied(previous, { source: 'algorithm_roulette_back', algorithm: previous.algorithm });
    return {
      success: true,
      value: previous,
      historyDepth: macroRef.rouletteHistory.length,
    };
  };

  const setRouletteSlide = (position) => {
    const chain = macroRef.rouletteTarget
      ? [...macroRef.rouletteHistory, macroRef.rouletteTarget]
      : [];
    if (chain.length < 2) {
      return { success: false, error: 'Spin Algorithm Roulette first to slide between changes.' };
    }
    const clampedPos = Math.min(chain.length - 1, Math.max(0, Number.isFinite(position) ? position : 0));
    const blended = interpolatePatchChain(chain, clampedPos);
    macroRef.chaosSnapshot = null;
    macroRef.snapFxId = null;
    macroRef.roulettePosition = clampedPos;
    stateRef.current = setActivePatch(stateRef.current, blended);
    onPatchApplied(blended, { source: 'algorithm_roulette_slide', position: clampedPos });
    return {
      success: true,
      value: blended,
      position: clampedPos,
      maxPosition: chain.length - 1,
    };
  };

  const assignSmartMacro = async () => {
    const t0 = Date.now();
    const basePatch = stateRef.current.activePatch;
    log('info', `Requesting AI Smart Macro for "${basePatch.patchName}"...`);

    const result = await requestSmartMacroFromLlm({
      config: llmConfig,
      patch: basePatch,
      styleName: stateRef.current.activeStyle,
      fetchImpl,
    });

    const elapsedMs = Date.now() - t0;
    if (!result.success) {
      log('error', `Smart Macro Assign failed in ${elapsedMs}ms`, result.error);
      return result;
    }

    macroRef.macro = result.value;
    macroRef.basePatch = basePatch;
    macroRef.amount = 0;

    log('info', `Smart Macro "${result.value.macroName}" assigned in ${elapsedMs}ms`, {
      targets: result.value.bindings.map((b) => b.target),
    });
    return {
      success: true,
      value: {
        chaosActive: Boolean(macroRef.chaosSnapshot),
        macro: macroRef.macro,
        amount: macroRef.amount,
      },
    };
  };

  const setSmartMacroAmount = (amount) => {
    if (!macroRef.macro || !macroRef.basePatch) {
      return { success: false, error: 'No Smart Macro assigned yet. Run Smart Macro Assign first.' };
    }
    const clamped = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
    const updated = applySmartMacroValue(macroRef.basePatch, macroRef.macro, clamped);
    macroRef.amount = clamped;
    stateRef.current = setActivePatch(stateRef.current, updated);
    log('info', `Smart Macro "${macroRef.macro.macroName}" -> ${Math.round(clamped * 100)}%`);
    onPatchApplied(updated, { source: 'smart_macro', amount: clamped });
    return { success: true, value: updated };
  };

  const getMacroState = () => ({
    chaosActive: Boolean(macroRef.chaosSnapshot),
    activeSnapFxId: macroRef.snapFxId,
    defaultSnapFxId: macroRef.defaultSnapFxId,
    rouletteHistoryDepth: macroRef.rouletteHistory.length,
    rouletteSlidePos: macroRef.roulettePosition,
    rouletteSlideMax: macroRef.rouletteTarget ? macroRef.rouletteHistory.length : 0,
    macro: macroRef.macro,
    amount: macroRef.amount,
  });

  const getStatus = () => selectDeckStatus(stateRef.current);

  const getActivePatch = () => stateRef.current.activePatch;

  const getActiveSkillPrompt = () => stateRef.current.activeSkillPrompt;

  const applyExternalPatch = (patch, source = 'favorite') => {
    const valid = validatePatch(patch);
    if (!valid.success) {
      log('warn', `Rejected external patch (${source})`, valid.error);
      return valid;
    }
    macroRef.chaosSnapshot = null;
    macroRef.snapFxId = null;
    macroRef.originalDefaultPatch = valid.value;
    macroRef.defaultSnapFxId = null;
    stateRef.current = setActivePatch(stateRef.current, valid.value);
    log('info', `Applied ${source} patch -> ${valid.value.patchName}`);
    onPatchApplied(valid.value, { source });
    return valid;
  };

  return Object.freeze({
    listStyles,
    loadStyle,
    refillSlot,
    triggerSlot,
    getStatus,
    getActivePatch,
    getActiveSkillPrompt,
    applyExternalPatch,
    morphWithSlot,
    applyHarmonicDrift,
    listSnapFx,
    engageSnapFx,
    releaseSnapFx,
    setSnapFxAsDefault,
    resetSnapFxDefault,
    engageChaos,
    releaseChaos,
    triggerAlgorithmRoulette,
    undoAlgorithmRoulette,
    setRouletteSlide,
    assignSmartMacro,
    setSmartMacroAmount,
    getMacroState,
  });
};
