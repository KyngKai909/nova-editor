// Per-project undo/redo history, persisted in IndexedDB so it survives reloads
// (most visual editors drop history on refresh — Nova keeps it). Stores the
// raw { past, future } snapshot object keyed by project id; SourceFile arrays
// are plain JSON so structured-clone handles them.

const DB = "nova-history";
const STORE = "history";

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

export async function saveHistory(projectId: string, data: unknown): Promise<void> {
  if (!projectId || !available()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(data, projectId);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  } catch {
    /* history persistence is best-effort */
  }
}

export async function loadHistory<T = unknown>(projectId: string): Promise<T | null> {
  if (!projectId || !available()) return null;
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(projectId);
      r.onsuccess = () => resolve((r.result ?? null) as T | null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteHistory(projectId: string): Promise<void> {
  if (!projectId || !available()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const r = db.transaction(STORE, "readwrite").objectStore(STORE).delete(projectId);
      r.onsuccess = () => resolve();
      r.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
