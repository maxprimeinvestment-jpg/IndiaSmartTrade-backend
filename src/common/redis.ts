import { Logger } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';

const logger = new Logger('Redis');

const DEFAULT_URL = 'redis://localhost:6379';

/**
 * Single place every ioredis client is created.
 *
 * The important bit for Railway (and any IPv6-only private network) is
 * `family: 0`: it tells Node's DNS resolver to return BOTH A and AAAA records.
 * Railway's `*.railway.internal` hostnames resolve over IPv6, and ioredis
 * defaults to IPv4-only lookup — so without this the socket never connects,
 * commands queue forever, and any `await` on a Redis call during onModuleInit
 * hangs the whole boot (the app never reaches `listen()` and the health check
 * times out). A URL with `?family=0` would also work; doing it here means no
 * env var has to be remembered.
 *
 * `retryStrategy` keeps reconnecting with capped backoff instead of giving up,
 * so a brief Redis blip self-heals. `connectTimeout` bounds each attempt.
 */
export function createRedisClient(url?: string, extra: RedisOptions = {}): Redis {
  const client = new Redis(url ?? DEFAULT_URL, {
    family: 0,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
    ...extra,
  });

  client.on('error', (err) => {
    // ioredis emits 'error' on every failed reconnect attempt; log once at warn
    // so we don't crash the process (an unhandled 'error' event would).
    logger.warn(`Redis connection error: ${err.message}`);
  });

  return client;
}
