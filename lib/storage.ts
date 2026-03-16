/**
 * Storage abstraction: uses Vercel KV when configured, otherwise in-memory for local dev.
 * Allows login (Admin/Admin) to work locally without KV_REST_API_URL/KV_REST_API_TOKEN.
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

async function initStore(): Promise<KVStore> {
  if (_store) return _store;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    try {
      const { kv } = await import("@vercel/kv");
      _store = {
        async get<T>(key: string): Promise<T | null> {
          return (await kv.get(key)) as T | null;
        },
        async set(key, value) {
          await kv.set(key, value);
        },
        async del(key) {
          await kv.del(key);
        },
      };
      return _store;
    } catch (e) {
      console.warn("[storage] Vercel KV init failed, using in-memory store:", (e as Error).message);
    }
  } else {
    console.warn("[storage] KV_REST_API_URL/KV_REST_API_TOKEN not set — using in-memory store (Admin/Admin works locally)");
  }
  _store = createMemoryStore();
  return _store;
}

export async function getStore(): Promise<KVStore> {
  return initStore();
}
