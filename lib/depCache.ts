// Caches a project's installed node_modules as a WebContainer binary snapshot in
// IndexedDB, keyed by a hash of its lockfile, so Run can skip `npm install` on
// repeat boots. Purely an accelerator: every call is best-effort and the boot
// must work identically if the cache is empty, full, or throws.

const DB = "nova-deps";
const STORE = "snapshots";
const MAX_BYTES = 700 * 1024 * 1024; // keep the whole cache under ~700MB (LRU-evicted)

interface SnapRecord { data: Uint8Array; size: number; at: number }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function reqP<T>(r: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result as T); r.onerror = () => reject(r.error); });
}

// SHA-256 hex of the lockfile (so the cache invalidates whenever deps change).
export async function hashLock(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
    return "x" + (h >>> 0).toString(16);
  }
}

export async function getDepSnapshot(key: string): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const rec = await reqP<SnapRecord | undefined>(store.get(key));
    if (!rec) return null;
    store.put({ ...rec, at: Date.now() }, key); // LRU touch (fire-and-forget)
    return rec.data;
  } catch {
    return null;
  }
}

export async function delDepSnapshot(key: string): Promise<void> {
  try {
    const db = await openDb();
    db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
  } catch {
    /* ignore */
  }
}

// Per-browser kill switch: set when a restored snapshot proves unusable (e.g. the
// WebContainer build can't re-grant the .bin exec bit), so we stop caching and
// always do a clean install instead of fail-recovering on every boot.
const NO_CACHE_FLAG = "nova:wc-no-cache";
export const depCacheDisabled = () => { try { return !!localStorage.getItem(NO_CACHE_FLAG); } catch { return false; } };
export const disableDepCache = () => { try { localStorage.setItem(NO_CACHE_FLAG, "1"); } catch { /* ignore */ } };

export async function putDepSnapshot(key: string, data: Uint8Array): Promise<void> {
  try {
    if (!data || data.byteLength > MAX_BYTES) return; // don't cache a single oversized tree
    const db = await openDb();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    store.put({ data, size: data.byteLength, at: Date.now() } as SnapRecord, key);
    await new Promise<void>((res) => { store.transaction.oncomplete = () => res(); store.transaction.onerror = () => res(); });
    await enforceCap();
  } catch {
    /* quota / unavailable — fine, just no cache */
  }
}

// Evict least-recently-used snapshots until the cache is under the size cap.
async function enforceCap(): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const keys = await reqP<IDBValidKey[]>(store.getAllKeys());
    const recs = await reqP<SnapRecord[]>(store.getAll());
    let total = recs.reduce((n, r) => n + (r?.size || 0), 0);
    if (total <= MAX_BYTES) return;
    const entries = keys.map((k, i) => ({ k, at: recs[i]?.at || 0, size: recs[i]?.size || 0 })).sort((a, b) => a.at - b.at);
    for (const e of entries) {
      if (total <= MAX_BYTES) break;
      store.delete(e.k);
      total -= e.size;
    }
  } catch {
    /* ignore */
  }
}
