/**
 * Redis connection for BullMQ.
 *
 * Reads REDIS_URL (e.g. redis://127.0.0.1:6379) and falls back to a local
 * default. The same connection backs the queue, the workers, and — later —
 * checkpoint state storage, so it is defined once here.
 */

import type { ConnectionOptions } from "bullmq";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 6379;

export function redisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    return { host: DEFAULT_HOST, port: DEFAULT_PORT };
  }

  const parsed = new URL(url);
  return {
    host: parsed.hostname || DEFAULT_HOST,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : DEFAULT_PORT,
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(parsed.username ? { username: parsed.username } : {}),
  };
}
