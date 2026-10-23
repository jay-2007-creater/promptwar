import type { StateStorage } from "zustand/middleware";

/**
 * Persistence boundary.
 *
 * Everything the app stores locally goes through this module. Swapping the MVP's localStorage
 * backed implementation for Cloud Firestore later means replacing this file only — no component
 * or service touches browser storage directly.
 *
 * Persisted payloads contain NO credentials. Settings, datasets and plan status are the only
 * things written.
 */

const PREFIX = "ecopilot.";

export const STORAGE_KEYS = {
  app: `${PREFIX}app.v1`,
} as const;

/** Zustand-compatible storage adapter. Failures degrade to an in-memory store, never a crash. */
export function createLocalStorage(): StateStorage {
  const memory = new Map<string, string>();

  const safe = (): Storage | null => {
    try {
      const probe = "__ecopilot_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      return null;
    }
  };

  return {
    getItem: (name) => {
      const store = safe();
      if (!store) return memory.get(name) ?? null;
      try {
        return store.getItem(name);
      } catch {
        return memory.get(name) ?? null;
      }
    },
    setItem: (name, value) => {
      memory.set(name, value);
      const store = safe();
      if (!store) return;
      try {
        store.setItem(name, value);
      } catch {
        /* quota exceeded — keep the in-memory copy so the session still works */
      }
    },
    removeItem: (name) => {
      memory.delete(name);
      const store = safe();
      if (!store) return;
      try {
        store.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}

export function isPersistenceAvailable(): boolean {
  try {
    const probe = "__ecopilot_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedState(): void {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}
