import "server-only";

import type { BoardRealtimeEnvelopeV1 } from "./board-realtime-envelope";
import { BOARD_REALTIME_CHANNEL_PREFIX, boardRedisChannel, parseBoardRealtimeEnvelope } from "./board-realtime-envelope";
import { applyBoardRealtimeEnvelope } from "./board-realtime-apply";

function isBoardRealtimeRedisEnabled(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

type RedisClient = import("ioredis").default;

let redisCtor: typeof import("ioredis").default | null = null;
let publisher: RedisClient | null = null;
let subscriberBootStarted = false;

async function getRedisClass(): Promise<typeof import("ioredis").default> {
  if (!redisCtor) {
    const m = await import("ioredis");
    redisCtor = m.default;
  }
  return redisCtor;
}

async function getPublisher(): Promise<RedisClient | null> {
  if (!isBoardRealtimeRedisEnabled()) return null;
  if (!publisher) {
    const Redis = await getRedisClass();
    publisher = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    publisher.on("error", (err: Error) => {
      console.error("[board-redis] publisher", err);
    });
  }
  return publisher;
}

/**
 * Publica o envelope no canal do board. Retorna true se usou Redis.
 */
async function publishBoardRealtimeEnvelopeIfEnabled(env: BoardRealtimeEnvelopeV1): Promise<boolean> {
  const redis = await getPublisher();
  if (!redis) return false;
  const channel = boardRedisChannel(env.boardId);
  await redis.publish(channel, JSON.stringify(env));
  return true;
}

/**
 * Pipeline único: com Redis só publica; sem Redis aplica no hub local.
 */
export async function publishOrDeliverBoardEvent(env: BoardRealtimeEnvelopeV1): Promise<void> {
  const usedRedis = await publishBoardRealtimeEnvelopeIfEnabled(env);
  if (!usedRedis) {
    applyBoardRealtimeEnvelope(env);
  }
}

/**
 * Arranca PSUBSCRIBE uma vez por processo Node (instrumentation).
 */
export async function ensureBoardRealtimeRedisSubscriber(): Promise<void> {
  if (!isBoardRealtimeRedisEnabled() || subscriberBootStarted) return;
  subscriberBootStarted = true;

  const Redis = await getRedisClass();
  const url = process.env.REDIS_URL!;
  const sub = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  sub.on("error", (err: Error) => {
    console.error("[board-redis] subscriber", err);
  });

  const pattern = `${BOARD_REALTIME_CHANNEL_PREFIX}*`;
  await sub.psubscribe(pattern);

  sub.on("pmessage", (_pat: string, channel: string, message: string) => {
    const prefix = BOARD_REALTIME_CHANNEL_PREFIX;
    if (!channel.startsWith(prefix)) return;
    const boardIdFromChannel = channel.slice(prefix.length);
    const env = parseBoardRealtimeEnvelope(message);
    if (!env || env.boardId !== boardIdFromChannel) {
      return;
    }
    try {
      applyBoardRealtimeEnvelope(env);
    } catch (e) {
      console.error("[board-redis] apply envelope", e);
    }
  });
}
