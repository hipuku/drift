import { afterEach, describe, expect, it } from "vitest";
import { redisConnection } from "./connection.js";

const original = process.env.REDIS_URL;

afterEach(() => {
  if (original === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = original;
});

describe("redisConnection", () => {
  it("defaults to localhost when REDIS_URL is unset", () => {
    delete process.env.REDIS_URL;
    expect(redisConnection()).toEqual({ host: "127.0.0.1", port: 6379 });
  });

  it("parses host and port from REDIS_URL", () => {
    process.env.REDIS_URL = "redis://redis.internal:6380";
    expect(redisConnection()).toEqual({ host: "redis.internal", port: 6380 });
  });

  it("includes credentials when present", () => {
    process.env.REDIS_URL = "redis://user:secret@10.0.0.1:6379";
    expect(redisConnection()).toEqual({
      host: "10.0.0.1",
      port: 6379,
      username: "user",
      password: "secret",
    });
  });
});
