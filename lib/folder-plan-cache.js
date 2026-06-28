import crypto from 'node:crypto';

export function createFolderPlanCache({ now = Date.now, ttlMs = 5 * 60 * 1000, maxEntries = 32 } = {}) {
  const entries = new Map();

  function prune(currentTime = now()) {
    for (const [token, entry] of entries) {
      if (entry.expiresAt <= currentTime) entries.delete(token);
    }
    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  }

  return {
    put(entry) {
      prune();
      const token = crypto.randomBytes(16).toString('hex');
      entries.set(token, {
        ...entry,
        expiresAt: now() + ttlMs,
      });
      return token;
    },

    take(token, { remote, remotePath } = {}) {
      if (!token) return null;
      prune();
      const entry = entries.get(token);
      if (!entry) return null;
      if (entry.remote !== remote || entry.remotePath !== remotePath) return null;
      entries.delete(token);
      const { expiresAt, ...publicEntry } = entry;
      return publicEntry;
    },
  };
}
