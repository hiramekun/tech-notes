/**
 * 未送信のレビューを端末に溜めておくアウトボックス。
 *
 * 電波の切れる場所でもスワイプを止めないための仕組み。冪等キー
 * (clientEventId) を持たせてあるので、復帰後にまとめて送り直しても二重に反映されない。
 * IndexedDB が使えない環境(プライベートウィンドウなど)ではメモリだけで動く。
 */
import type { PendingReview } from "./types";

const DB_NAME = "tech-notes-study";
const DB_VERSION = 1;
const STORE = "outbox";

let memoryFallback: PendingReview[] = [];

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "clientEventId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      transaction.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

export async function enqueue(review: PendingReview): Promise<void> {
  const stored = await withStore("readwrite", (store) => store.put(review));
  if (stored === null) memoryFallback.push(review);
}

export async function pending(): Promise<PendingReview[]> {
  const rows = await withStore<PendingReview[]>("readonly", (store) => store.getAll());
  if (rows === null) return [...memoryFallback];
  return rows.sort((a, b) => a.reviewedAt - b.reviewedAt);
}

export async function forget(clientEventIds: string[]): Promise<void> {
  if (clientEventIds.length === 0) return;

  const db = await openDb();
  if (!db) {
    const done = new Set(clientEventIds);
    memoryFallback = memoryFallback.filter((review) => !done.has(review.clientEventId));
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      for (const id of clientEventIds) store.delete(id);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
