import type { StateStorage } from "zustand/middleware";

// At-rest encryption for the credential stores (API keys, GitHub token). The
// blob written to localStorage is AES-GCM ciphertext, not a plaintext "sk-…".
//
// The AES key is a NON-EXTRACTABLE CryptoKey kept in IndexedDB: JavaScript can
// USE it to decrypt but cannot export the raw bytes. This defeats casual
// inspection (DevTools → Application), naive "scan localStorage for sk-"
// scrapers/extensions, and at-rest disk forensics.
//
// Honest limits: this is NOT XSS-proof. Code running in this origin can still
// open the same IndexedDB and ask the key to decrypt, or read a key from memory
// while it's in use. Encryption raises the bar; it is not a guarantee. The real
// protections are keeping untrusted code out of this origin (CSP + sandboxed
// iframes) and using scoped, revocable keys.

const DB = "nova-secure";
const STORE = "keys";
const KEY_ID = "master";
const PREFIX = "enc:v1:";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result as T | undefined);
        r.onerror = () => reject(r.error);
      })
  );
}

function idbSet(key: string, val: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(val, key);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      })
  );
}

let keyPromise: Promise<CryptoKey> | null = null;
function masterKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await idbGet<CryptoKey>(KEY_ID);
      if (existing) return existing;
      // non-extractable: usable for encrypt/decrypt, but the raw bytes can't be read out
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await idbSet(KEY_ID, key);
      return key;
    })();
  }
  return keyPromise;
}

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function encrypt(plain: string): Promise<string> {
  const key = await masterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return PREFIX + toB64(iv.buffer) + ":" + toB64(ct);
}

async function decrypt(blob: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = blob.slice(PREFIX.length).split(":");
    const key = await masterKey();
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, fromB64(ctB64));
    return new TextDecoder().decode(pt);
  } catch {
    return null; // tampered / wrong key — treat as absent
  }
}

function cryptoAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof localStorage !== "undefined" &&
    !!window.crypto?.subtle &&
    !!window.indexedDB &&
    window.isSecureContext
  );
}

// zustand `StateStorage` backed by localStorage, transparently encrypting values.
// Existing plaintext entries are migrated to ciphertext on first read.
export function encryptedStorage(): StateStorage {
  return {
    getItem: async (name) => {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(name);
      if (raw == null) return null;
      if (!raw.startsWith(PREFIX)) {
        // legacy plaintext from before encryption — return it, and migrate in the background
        if (cryptoAvailable()) encrypt(raw).then((enc) => localStorage.setItem(name, enc)).catch(() => {});
        return raw;
      }
      if (!cryptoAvailable()) return null;
      return (await decrypt(raw)) ?? null;
    },
    setItem: async (name, value) => {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(name, cryptoAvailable() ? await encrypt(value) : value);
    },
    removeItem: (name) => {
      if (typeof localStorage !== "undefined") localStorage.removeItem(name);
    },
  };
}
