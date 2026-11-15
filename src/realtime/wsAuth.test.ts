import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { upgradeAllowed } from "./wsServer.js";

const request = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as IncomingMessage;

describe("upgradeAllowed", () => {
  it("lets every connection in when no token is set", () => {
    expect(upgradeAllowed(request(), null)).toBe(true);
  });

  it("needs the bearer token when one is set", () => {
    expect(upgradeAllowed(request(), "s3cret")).toBe(false);
    expect(upgradeAllowed(request("Bearer nope"), "s3cret")).toBe(false);
    expect(upgradeAllowed(request("Bearer s3cret"), "s3cret")).toBe(true);
  });
});
