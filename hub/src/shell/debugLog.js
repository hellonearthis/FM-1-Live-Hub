/** Create an in-memory ring-buffer debug logger mirrored to stderr (never stdout). */
export const createDebugLog = (maxEntries = 150) => {
  const stateRef = {
    seq: 0,
    entries: [],
  };

  const push = (level, source, message, detail = null) => {
    const entry = Object.freeze({
      id: stateRef.seq + 1,
      ts: new Date().toISOString(),
      level,
      source,
      message,
      detail,
    });
    stateRef.seq += 1;
    const next = [...stateRef.entries, entry];
    stateRef.entries =
      next.length > maxEntries ? next.slice(next.length - maxEntries) : next;

    const suffix = detail ? ` | ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '';
    console.error(`[${source}] ${level.toUpperCase()}: ${message}${suffix}`);
    return entry;
  };

  const list = () => stateRef.entries;

  const clear = () => {
    stateRef.entries = [];
  };

  return Object.freeze({
    push,
    list,
    clear,
  });
};
