export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateServerEnv } = await import("./lib/env-validate");
    validateServerEnv();

    if (process.env.REDIS_URL?.trim()) {
      const { ensureBoardRealtimeRedisSubscriber } = await import("./lib/board-realtime-redis");
      void ensureBoardRealtimeRedisSubscriber().catch((err: unknown) => {
        console.error("[board-redis] falha ao iniciar subscritor", err);
      });
    }
  }
}
