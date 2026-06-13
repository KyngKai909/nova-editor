// Persist FileSystemDirectoryHandles in IndexedDB (they survive reloads and are
// structured-cloneable, unlike localStorage which only takes JSON). Keyed by
// project id so a device-backed project can re-link to its folder on reopen.

const DB_NAME = "nova-fs";
const STORE = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const saveHandle = (id: string, handle: any) => tx<void>("readwrite", (s) => s.put(handle, id));
export const getHandle = (id: string) => tx<any>("readonly", (s) => s.get(id));
export const deleteHandle = (id: string) => tx<void>("readwrite", (s) => s.delete(id));
