// Local-first storage wrapper.
//
// "User owns all data" per the MaraAI spec: chat history, posts, prefs and
// AI memory all live on the device by default. This file is a tiny
// IndexedDB key/value layer with a localStorage fallback for browsers that
// block IDB (private mode in some Safari builds).
//
// The shape is deliberately simple: namespaced records keyed by string.
// Encryption-at-rest is opt-in and lives in `encryptedSync.ts` (future).

const DB_NAME = 'maraai_local_store';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
let idbBlocked = false;

function openDb(): Promise<IDBDatabase> {
  if (idbBlocked || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        idbBlocked = true;
        reject(req.error);
      };
      req.onblocked = () => {
        idbBlocked = true;
        reject(new Error('IndexedDB blocked'));
      };
    });
  }
  return dbPromise;
}

function lsKey(namespace: string, key: string): string {
  return `maraai:${namespace}:${key}`;
}

export async function localGet<T>(namespace: string, key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(`${namespace}:${key}`);
      req.onsuccess = () => resolve((req.result ?? null) as T | null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(lsKey(namespace, key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}

export async function localSet<T>(namespace: string, key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, `${namespace}:${key}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  } catch {
    try {
      localStorage.setItem(lsKey(namespace, key), JSON.stringify(value));
    } catch {
      /* quota exceeded — silently drop. The transparency dashboard will
         report low local-storage availability in a follow-up. */
    }
  }
}

export async function localDelete(namespace: string, key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(`${namespace}:${key}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  } catch {
    try {
      localStorage.removeItem(lsKey(namespace, key));
    } catch {
      /* ignore */
    }
  }
}

/** Append a record to a bounded ring buffer at `namespace:key`. */
export async function localAppend<T>(
  namespace: string,
  key: string,
  value: T,
  cap = 500,
): Promise<T[]> {
  const arr = ((await localGet<T[]>(namespace, key)) ?? []) as T[];
  arr.push(value);
  while (arr.length > cap) arr.shift();
  await localSet(namespace, key, arr);
  return arr;
}

/** Useful from the transparency dashboard: how much room are we using? */
export async function localStorageEstimate(): Promise<{ usageMb: number | null; quotaMb: number | null }>
{
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      const mb = (n?: number) => (n != null ? Number((n / (1024 * 1024)).toFixed(1)) : null);
      return { usageMb: mb(e.usage), quotaMb: mb(e.quota) };
    }
  } catch {
    /* ignore */
  }
  return { usageMb: null, quotaMb: null };
}

export const NAMESPACES = {
  CHAT: 'chat',
  POSTS: 'posts',
  REELS: 'reels',
  PREFS: 'prefs',
  AI_MEMORY: 'ai_memory',
  ONBOARDING: 'onboarding',
} as const;
