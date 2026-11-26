import fs from 'node:fs/promises';
import path from 'node:path';
import { STARTER_PATTERNS, validatePattern } from '../core/patternSequencer.js';

const SAFE_ID = /^[a-z0-9_-]+$/i;
const BUILTIN_IDS = new Set(STARTER_PATTERNS.map((p) => p.id));

const toSlug = (name) => {
  const cleaned = String(name || 'pattern')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || `pattern_${Date.now()}`;
};

/** Create a disk-backed pattern store merging STARTER_PATTERNS with hub/patterns/*.json. */
export const createPatternStore = ({ patternsDir, debugLog = null }) => {
  const log = (level, message, detail = null) => {
    if (debugLog) {
      debugLog.push(level, 'patterns', message, detail);
    }
  };

  const listPatterns = async () => {
    try {
      const entries = await fs.readdir(patternsDir, { withFileTypes: true });
      const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));
      const custom = await Promise.all(
        jsonFiles.map(async (entry) => {
          try {
            const raw = await fs.readFile(path.join(patternsDir, entry.name), 'utf-8');
            const data = JSON.parse(raw);
            const valid = validatePattern(data.pattern);
            if (!valid.success) {
              return null;
            }
            const id = data.id || entry.name.slice(0, -5);
            return {
              id,
              builtin: false,
              style: data.style ?? null,
              savedAt: data.savedAt ?? null,
              pattern: valid.value,
            };
          } catch {
            return null;
          }
        })
      );
      const validCustom = custom
        .filter((item) => item && !BUILTIN_IDS.has(item.id))
        .sort((a, b) => a.pattern.patternName.localeCompare(b.pattern.patternName));
      return [...STARTER_PATTERNS, ...validCustom];
    } catch {
      return [...STARTER_PATTERNS];
    }
  };

  const savePattern = async (pattern, { style = null } = {}) => {
    const valid = validatePattern(pattern);
    if (!valid.success) {
      return valid;
    }

    const rawSlug = toSlug(valid.value.patternName);
    const id = BUILTIN_IDS.has(rawSlug) ? `${rawSlug}_custom` : rawSlug;
    if (!SAFE_ID.test(id)) {
      return { success: false, error: `Invalid pattern id "${id}".` };
    }

    await fs.mkdir(patternsDir, { recursive: true });
    const record = {
      id,
      builtin: false,
      style,
      savedAt: new Date().toISOString(),
      pattern: valid.value,
    };

    const filePath = path.join(patternsDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2) + '\n', 'utf-8');
    log('info', `Saved pattern "${valid.value.patternName}"`, { id, bpm: valid.value.bpm, style });
    return { success: true, value: record };
  };

  const deletePattern = async (id) => {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) {
      return { success: false, error: `Invalid pattern id "${id}".` };
    }
    if (BUILTIN_IDS.has(id)) {
      return { success: false, error: `Cannot delete built-in pattern "${id}".` };
    }
    const filePath = path.join(patternsDir, `${id}.json`);
    try {
      await fs.unlink(filePath);
      log('info', `Deleted pattern "${id}"`);
      return { success: true, value: { deleted: id } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to delete pattern "${id}": ${msg}` };
    }
  };

  return Object.freeze({
    listPatterns,
    savePattern,
    deletePattern,
  });
};
