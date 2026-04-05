import { Db, MongoClient } from "mongodb";

function mongoUri(): string | undefined {
  return process.env.MONGODB_URI || process.env.MONGO_URI;
}

/** Pós-handshake: o default do driver é 0 (sem limite), o que pode pendurar a função até o `maxDuration` da Vercel (504). */
function mongoSocketTimeoutMs(): number {
  const raw = process.env.MONGO_SOCKET_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 600_000);
  }
  return 30_000;
}

const globalForMongo = globalThis as typeof globalThis & {
  _fluxBoardMongoClient?: Promise<MongoClient>;
};

export function isMongoConfigured(): boolean {
  return Boolean(mongoUri());
}

/**
 * Seleção de servidor / handshake: manter moderado; operações em si são limitadas por `socketTimeoutMS`.
 */
const MONGO_TIMEOUT_MS = 12_000;

export async function getMongoClient(): Promise<MongoClient> {
  const uri = mongoUri();
  if (!uri) throw new Error("MONGODB_URI (or MONGO_URI) is not set");
  if (!globalForMongo._fluxBoardMongoClient) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: MONGO_TIMEOUT_MS,
      connectTimeoutMS: MONGO_TIMEOUT_MS,
      socketTimeoutMS: mongoSocketTimeoutMs(),
      maxPoolSize: 10,
      waitQueueTimeoutMS: MONGO_TIMEOUT_MS,
    });
    globalForMongo._fluxBoardMongoClient = client.connect();
  }
  return globalForMongo._fluxBoardMongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const name = process.env.MONGODB_DB;
  return name ? client.db(name) : client.db();
}
