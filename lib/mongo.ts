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
  return 35_000;
}

/**
 * Tamanho do pool por processo Node. Valores baixos (ex.: 10) geram
 * `MongoWaitQueueTimeoutError` sob burst (login + /api/auth/session + /api/boards).
 * Em serverless, cada instância quente tem o seu pool — não suba demais no Atlas M0
 * se tiver centenas de instâncias quentes (limite de ligações ao cluster).
 * Default ~32 equilibra burst (registo + /api/auth/session + /api/boards) com ligações ao Atlas;
 * afinar em staging com `MONGO_MAX_POOL_SIZE` / métricas de fila.
 */
function mongoMaxPoolSize(): number {
  const raw = process.env.MONGO_MAX_POOL_SIZE?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 100) return Math.floor(n);
  }
  return 32;
}

/** Tempo máximo à espera de uma ligação livre no pool (fila). */
function mongoWaitQueueTimeoutMs(): number {
  const raw = process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1_000 && n <= 120_000) return Math.floor(n);
  }
  return 40_000;
}

const globalForMongo = globalThis as typeof globalThis & {
  _fluxBoardMongoClient?: Promise<MongoClient>;
};

export function isMongoConfigured(): boolean {
  return Boolean(mongoUri());
}

/**
 * TCP + seleção de réplica / handshake TLS (`secureConnect`).
 * Default 12s; em redes lentas ou VPN, subir com `MONGO_CONNECT_TIMEOUT_MS` (ex.: 30000).
 * Se o erro persistir, o problema costuma ser firewall, IP não liberado no Atlas ou URI incorreta — aumentar só mascara.
 */
function mongoConnectPhaseTimeoutMs(): number {
  const raw = process.env.MONGO_CONNECT_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 5_000 && n <= 90_000) return Math.floor(n);
  }
  return 12_000;
}

export async function getMongoClient(): Promise<MongoClient> {
  const uri = mongoUri();
  if (!uri) throw new Error("MONGODB_URI (or MONGO_URI) is not set");
  if (!globalForMongo._fluxBoardMongoClient) {
    const tConnect = mongoConnectPhaseTimeoutMs();
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: tConnect,
      connectTimeoutMS: tConnect,
      socketTimeoutMS: mongoSocketTimeoutMs(),
      maxPoolSize: mongoMaxPoolSize(),
      waitQueueTimeoutMS: mongoWaitQueueTimeoutMs(),
      /** Mantém uma ligação quente por instância (menos handshake em cold start). Atlas M0: monitorizar contagem de conexões. */
      minPoolSize: 1,
      heartbeatFrequencyMS: 10_000,
      /** Evita abrir dezenas de handshakes em paralelo no mesmo tick (Atlas). */
      maxConnecting: 5,
    });
    const pending = client.connect();
    globalForMongo._fluxBoardMongoClient = pending.catch((err) => {
      globalForMongo._fluxBoardMongoClient = undefined;
      throw err;
    });
  }
  return globalForMongo._fluxBoardMongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const name = process.env.MONGODB_DB;
  return name ? client.db(name) : client.db();
}
