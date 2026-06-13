import type { StateStorage } from "zustand/middleware";

// A zustand StateStorage backed by IndexedDB. IndexedDB has a much larger quota
// than localStorage (~hundreds of MB vs ~5MB) and is supported in every modern
// browser — so projects persist durably on the user's device on Chromium,
// Firefox, AND Safari (the File System Access "real folder" feature is the only
// Chromium-only part). Existing localStorage values are migrated on first read.

const DB = "nova-store";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key: string): Promise<string | null> {
  return openDb().then(
    (db) =>
      new Promise<string | null>((resolve, reject) => {
        const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        r.onsuccess = () => resolve((r.result ?? null) as string | null);
        r.onerror = () => reject(r.error);
      })
  );
}

function idbSet(key: string, val: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(val, key);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      })
  );
}

function idbDel(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const r = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      })
  );
}

const idbAvailable = () => typeof window !== "undefined" && !!window.indexedDB;
const ls = () => (typeof localStorage !== "undefined" ? localStorage : null);

export function idbStorage(): StateStorage {
  return {
    getItem: async (name) => {
      if (!idbAvailable()) return ls()?.getItem(name) ?? null;
      try {
        const val = await idbGet(name);
        if (val != null) return val;
        // migrate a legacy localStorage value (from before IndexedDB persistence)
        const legacy = ls()?.getItem(name) ?? null;
        if (legacy != null) {
          await idbSet(name, legacy);
          try {
            ls()?.removeItem(name);
          } catch {
            /* ignore */
          }
          return legacy;
        }
        return null;
      } catch {
        return ls()?.getItem(name) ?? null;
      }
    },
    setItem: async (name, value) => {
      if (!idbAvailable()) {
        try {
          ls()?.setItem(name, value);
        } catch {
          /* quota */
        }
        return;
      }
      try {
        await idbSet(name, value);
      } catch {
        try {
          ls()?.setItem(name, value);
        } catch {
          /* ignore */
        }
      }
    },
    removeItem: async (name) => {
      if (idbAvailable()) {
        try {
          await idbDel(name);
        } catch {
          /* ignore */
        }
      }
      try {
        ls()?.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}
