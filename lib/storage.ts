/**
 * In-memory KV used only when MONGODB_URI is not set (local dev without MongoDB).
 * Production / Vercel: configure MongoDB — see lib/mongo.ts and kv-*.ts.
 */
const memory = new Map<string, unknown>();

export interface KVStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

let _store: KVStore | null = null;

function createMemoryStore(): KVStore {
  return {
    async get<T>(key: string): Promise<T | null> {
      const v = memory.get(key);
      return (v === undefined ? null : v) as T | null;
    },
    async set(key: string, value: unknown): Promise<void> {
      memory.set(key, value);
    },
    async del(key: string): Promise<void> {
      memory.delete(key);
    },
  };
}

export async function getStore(): Promise<KVStore> {
  if (!_store) {
    console.warn(
      "[storage] MONGODB_URI not set — using in-memory store (data is lost on restart)"
    );
    _store = createMemoryStore();
  }
  return _store;
}
