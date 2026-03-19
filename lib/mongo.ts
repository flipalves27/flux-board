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

export async function getMongoClient(): Promise<MongoClient> {
  const uri = mongoUri();
  if (!uri) throw new Error("MONGODB_URI (or MONGO_URI) is not set");
  if (!globalForMongo._fluxBoardMongoClient) {
    const client = new MongoClient(uri);
    globalForMongo._fluxBoardMongoClient = client.connect();
  }
  return globalForMongo._fluxBoardMongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const name = process.env.MONGODB_DB;
  return name ? client.db(name) : client.db();
}
