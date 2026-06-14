import type { AssetMap } from "./assets";

// Binary asset persistence in IndexedDB. Separate DB from the zustand string
// store (idbKv) so the two never fight over schema versions. Stores raw Blobs
// keyed by "<projectId>::<repo-relative path>" so assets survive page reloads;
// on open they're turned back into object URLs.

const DB = "nova-assets";
const STORE = "blobs";

function available() {
  return typeof window !== "undefined" && !!window.indexedDB;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const key = (projectId: string, path: string) => `${projectId}::${path}`;

export async function saveAsset(projectId: string, path: string, blob: Blob): Promise<void> {
  if (!projectId || !available()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(blob, key(projectId, path));
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  } catch {
    /* persistence is best-effort */
  }
}

// Load every persisted asset for a project as an AssetMap (path -> object URL).
export async function loadAssets(projectId: string): Promise<AssetMap> {
  if (!projectId || !available()) return {};
  const prefix = projectId + "::";
  try {
    const db = await openDb();
    return await new Promise<AssetMap>((resolve) => {
      const out: AssetMap = {};
      const req = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        const k = String(cur.key);
        if (k.startsWith(prefix)) {
          try { out[k.slice(prefix.length)] = URL.createObjectURL(cur.value as Blob); } catch { /* skip */ }
        }
        cur.continue();
      };
      req.onerror = () => resolve(out);
    });
  } catch {
    return {};
  }
}

// Drop all persisted assets for a project (called when the project is deleted).
export async function deleteProjectAssets(projectId: string): Promise<void> {
  if (!projectId || !available()) return;
  const prefix = projectId + "::";
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const req = db.transaction(STORE, "readwrite").objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve();
        if (String(cur.key).startsWith(prefix)) cur.delete();
        cur.continue();
      };
      req.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

// Persist all of a freshly-imported project's assets (blob URLs -> Blobs).
export function persistAssetMap(projectId: string, assets: AssetMap): void {
  if (!projectId || !available()) return;
  Object.entries(assets).forEach(([path, url]) => {
    fetch(url)
      .then((r) => r.blob())
      .then((b) => saveAsset(projectId, path, b))
      .catch(() => { /* ignore */ });
  });
}
