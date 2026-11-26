import { DEFAULT_PATCH } from './patchSchema.js';

export const SLOT_ROLES = Object.freeze(['Bassline', 'Lead/Pluck', 'Pad', 'Wild-card']);

const isValidSlotId = (slotId) =>
  Number.isInteger(slotId) && slotId >= 0 && slotId < SLOT_ROLES.length;

/** Build the initial immutable 4-slot StylePatchDeck state. */
export const createInitialDeckState = (initialPatch = DEFAULT_PATCH) =>
  Object.freeze({
    activeStyle: null,
    activeSkillPrompt: '',
    generationEpoch: 0,
    activePatch: initialPatch,
    slots: Object.freeze(
      SLOT_ROLES.map((role, id) =>
        Object.freeze({
          id,
          role,
          patch: null,
          warming: false,
          lastError: null,
        })
      )
    ),
  });

/** Reset all slots and increment generationEpoch when switching styles. */
export const beginLoadStyle = (state, styleName, skillPrompt) =>
  Object.freeze({
    ...state,
    activeStyle: styleName,
    activeSkillPrompt: skillPrompt,
    generationEpoch: state.generationEpoch + 1,
    slots: Object.freeze(
      state.slots.map((slot) =>
        Object.freeze({
          ...slot,
          patch: null,
          warming: false,
          lastError: null,
        })
      )
    ),
  });

/** Mark a slot as currently warming unless slotId is invalid or already warming. */
export const markSlotWarming = (state, slotId) => {
  if (!isValidSlotId(slotId) || state.slots[slotId].warming) {
    return state;
  }
  return Object.freeze({
    ...state,
    slots: Object.freeze(
      state.slots.map((slot) =>
        slot.id === slotId
          ? Object.freeze({ ...slot, warming: true, lastError: null })
          : slot
      )
    ),
  });
};

/** Apply a warmed patch to a slot only if the generationEpoch still matches. */
export const applySlotPatch = (state, slotId, epoch, patch) => {
  if (!isValidSlotId(slotId) || epoch !== state.generationEpoch) {
    return state;
  }
  return Object.freeze({
    ...state,
    slots: Object.freeze(
      state.slots.map((slot) =>
        slot.id === slotId
          ? Object.freeze({ ...slot, patch, warming: false, lastError: null })
          : slot
      )
    ),
  });
};

/** Record a warming failure on a slot only if the generationEpoch still matches. */
export const markSlotFailed = (state, slotId, epoch, errorMessage) => {
  if (!isValidSlotId(slotId) || epoch !== state.generationEpoch) {
    return state;
  }
  return Object.freeze({
    ...state,
    slots: Object.freeze(
      state.slots.map((slot) =>
        slot.id === slotId
          ? Object.freeze({ ...slot, warming: false, lastError: errorMessage })
          : slot
      )
    ),
  });
};

/** Consume a ready slot patch, promoting it to activePatch and clearing the slot. */
export const consumeSlot = (state, slotId) => {
  if (!isValidSlotId(slotId)) {
    return { nextState: state, patch: null };
  }
  const target = state.slots[slotId];
  if (!target.patch) {
    return { nextState: state, patch: null };
  }
  const nextState = Object.freeze({
    ...state,
    activePatch: target.patch,
    slots: Object.freeze(
      state.slots.map((slot) =>
        slot.id === slotId ? Object.freeze({ ...slot, patch: null }) : slot
      )
    ),
  });
  return { nextState, patch: target.patch };
};

/** Replace the activePatch cleanly. */
export const setActivePatch = (state, patch) =>
  Object.freeze({
    ...state,
    activePatch: patch,
  });

/** Project a concise telemetry view of the deck state. */
export const selectDeckStatus = (state) => ({
  style: state.activeStyle,
  epoch: state.generationEpoch,
  activePatchName: state.activePatch?.patchName ?? null,
  slots: state.slots.map((slot) => ({
    id: slot.id,
    role: slot.role,
    ready: Boolean(slot.patch),
    warming: slot.warming,
    lastError: slot.lastError,
  })),
});
