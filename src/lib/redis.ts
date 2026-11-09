import { Redis } from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function redis(): Redis {
  if (!globalForRedis.redis) {
    const client = new Redis(env().REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    // Without a listener ioredis logs every reconnect failure as unhandled;
    // callers already surface command errors (e.g. /api/health).
    client.on("error", () => {});
    globalForRedis.redis = client;
  }
  return globalForRedis.redis;
}
