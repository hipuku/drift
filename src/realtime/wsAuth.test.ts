import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { upgradeAllowed, verifyUpgrade } from "./wsServer.js";

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

describe("verifyUpgrade, on a real handshake", () => {
  let wss: WebSocketServer | undefined;
  afterEach(async () => {
    await new Promise<void>((resolve) => (wss ? wss.close(() => resolve()) : resolve()));
    wss = undefined;
  });

  async function connect(headers: Record<string, string>) {
    wss = new WebSocketServer({ port: 0, verifyClient: verifyUpgrade("s3cret") });
    await new Promise<void>((resolve) => wss!.once("listening", () => resolve()));
    const { port } = wss.address() as AddressInfo;
    return new Promise<{ status: number; challenge?: string } | "open">((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
      ws.on("open", () => {
        ws.close();
        resolve("open");
      });
      ws.on("unexpected-response", (_req, res) => {
        resolve({ status: res.statusCode ?? 0, challenge: res.headers["www-authenticate"] });
      });
    });
  }

  it("refuses with 401 and the Bearer challenge, as the API does", async () => {
    expect(await connect({})).toEqual({ status: 401, challenge: "Bearer" });
  });

  it("opens with the token", async () => {
    expect(await connect({ authorization: "Bearer s3cret" })).toBe("open");
  });
});
