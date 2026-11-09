import { Redis } from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function redis(): Redis {
  globalForRedis.redis ??= new Redis(env().REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  return globalForRedis.redis;
}
