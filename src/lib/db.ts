/**
 * Everything Clouded saves lives in this browser's IndexedDB:
 *  - "kv"    → the app state (deadlines, errors, topics, resources, card progress…)
 *  - "files" → PDFs uploaded to the Resource Vault
 * Nothing is sent anywhere. Use Export backup to move data between devices.
 */
const DB_NAME = "clouded";
const VERSION = 1;

export type StoredFile = { id: string; name: string; type: string; blob: Blob };

let dbp: Promise<IDBDatabase> | null = null;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      if (!d.objectStoreNames.contains("files")) d.createObjectStore("files", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const loadState = <T>() => run<T | undefined>("kv", "readonly", (s) => s.get("state"));
export const saveState = (state: unknown) => run("kv", "readwrite", (s) => s.put(state, "state"));

export const putFile = (f: StoredFile) => run("files", "readwrite", (s) => s.put(f));
export const getFile = (id: string) => run<StoredFile | undefined>("files", "readonly", (s) => s.get(id));
export const deleteFile = (id: string) => run("files", "readwrite", (s) => s.delete(id));
export const allFiles = () => run<StoredFile[]>("files", "readonly", (s) => s.getAll());
export const clearFiles = () => run("files", "readwrite", (s) => s.clear());

/** Ask the browser not to clear Clouded's data when the device is low on space. */
export async function persistStorage() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {}
}

export async function storageUsage() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.usage ?? null;
  } catch {
    return null;
  }
}

/* ---------- Local PDFs in the vault ---------- */

export const LOCAL_PREFIX = "local:";
export const isLocalUrl = (url: string) => url.startsWith(LOCAL_PREFIX);

/** Opens a vault item. Local PDFs are read from IndexedDB and shown in a new tab. */
export function openUrl(url: string) {
  if (!isLocalUrl(url)) {
    window.open(url, "_blank", "noopener");
    return;
  }
  // Open the tab synchronously (so it isn't popup-blocked), then point it at the file.
  const w = window.open("", "_blank");
  getFile(url.slice(LOCAL_PREFIX.length)).then((f) => {
    if (!f) {
      w?.close();
      alert("That PDF isn't stored on this device. Import a backup that includes it.");
      return;
    }
    const href = URL.createObjectURL(f.blob);
    if (w) w.location.href = href;
    else location.href = href;
  });
}
