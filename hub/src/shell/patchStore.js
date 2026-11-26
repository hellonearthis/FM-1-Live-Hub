import fs from 'node:fs/promises';
import path from 'node:path';
import { validatePatch } from '../core/patchSchema.js';

const SAFE_ID = /^[a-z0-9_-]+$/i;

const toSlug = (name) => {
  const cleaned = String(name || 'patch')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || `patch_${Date.now()}`;
};

/** Create a disk-backed store for favorite FM-1 patches in hub/patches/*.json. */
export const createPatchStore = ({ patchesDir, debugLog = null }) => {
  const log = (level, message, detail = null) => {
    if (debugLog) {
      debugLog.push(level, 'favorites', message, detail);
    }
  };

  const listFavorites = async () => {
    try {
      const entries = await fs.readdir(patchesDir, { withFileTypes: true });
      const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));
      const records = await Promise.all(
        jsonFiles.map(async (entry) => {
          try {
            const raw = await fs.readFile(path.join(patchesDir, entry.name), 'utf-8');
            const data = JSON.parse(raw);
            return {
              id: data.id || entry.name.slice(0, -5),
              patchName: data.patch?.patchName || entry.name.slice(0, -5),
              style: data.style ?? null,
              savedAt: data.savedAt ?? null,
              algorithm: data.patch?.algorithm ?? null,
              feedback: data.patch?.feedback ?? null,
            };
          } catch {
            return null;
          }
        })
      );
      return records.filter(Boolean).sort((a, b) => a.patchName.localeCompare(b.patchName));
    } catch {
      return [];
    }
  };

  const saveFavorite = async (patch, { style = null, name = null } = {}) => {
    const valid = validatePatch(patch);
    if (!valid.success) {
      return valid;
    }

    const patchToSave =
      typeof name === 'string' && name.trim()
        ? { ...valid.value, patchName: name.trim() }
        : valid.value;

    const id = toSlug(patchToSave.patchName);
    if (!SAFE_ID.test(id)) {
      return { success: false, error: `Invalid favorite id "${id}".` };
    }

    await fs.mkdir(patchesDir, { recursive: true });
    const record = {
      id,
      style,
      savedAt: new Date().toISOString(),
      patch: patchToSave,
    };

    const filePath = path.join(patchesDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2) + '\n', 'utf-8');
    log('info', `Saved favorite patch "${patchToSave.patchName}"`, { id, style });
    return {
      success: true,
      value: {
        id,
        patchName: patchToSave.patchName,
        style,
        savedAt: record.savedAt,
      },
    };
  };

  const loadFavorite = async (id) => {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) {
      return { success: false, error: `Invalid favorite id "${id}".` };
    }
    const filePath = path.join(patchesDir, `${id}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const valid = validatePatch(data.patch);
      if (!valid.success) {
        return valid;
      }
      log('info', `Loaded favorite patch "${valid.value.patchName}"`, { id });
      return { success: true, value: valid.value };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to load favorite "${id}": ${msg}` };
    }
  };

  const deleteFavorite = async (id) => {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) {
      return { success: false, error: `Invalid favorite id "${id}".` };
    }
    const filePath = path.join(patchesDir, `${id}.json`);
    try {
      await fs.unlink(filePath);
      log('info', `Deleted favorite patch "${id}"`);
      return { success: true, value: { deleted: id } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to delete favorite "${id}": ${msg}` };
    }
  };

  return Object.freeze({
    listFavorites,
    saveFavorite,
    loadFavorite,
    deleteFavorite,
  });
};
