import { Db, MongoClient } from "mongodb";

function mongoUri(): string | undefined {
  return process.env.MONGODB_URI || process.env.MONGO_URI;
}

const globalForMongo = globalThis as typeof globalThis & {
  _fluxBoardMongoClient?: Promise<MongoClient>;
};

export function isMongoConfigured(): boolean {
  return Boolean(mongoUri());
}

/** Abaixo do limite típico de 30s da Vercel: o default do driver é serverSelectionTimeoutMS=30s e competia com o timeout da função (504). */
const MONGO_TIMEOUT_MS = 15_000;

export async function getMongoClient(): Promise<MongoClient> {
  const uri = mongoUri();
  if (!uri) throw new Error("MONGODB_URI (or MONGO_URI) is not set");
  if (!globalForMongo._fluxBoardMongoClient) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: MONGO_TIMEOUT_MS,
      connectTimeoutMS: MONGO_TIMEOUT_MS,
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
