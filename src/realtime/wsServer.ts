/**
 * Progress WebSocket server.
 *
 * Bridges BullMQ job events to subscribed browser clients. The crawl worker
 * runs in its own process and reports progress via job.updateProgress; those
 * events surface here through BullMQ's QueueEvents (which reads the queue's
 * cross-process event stream), and are forwarded to the clients that asked
 * for that job id.
 *
 * Clients send { type: "subscribe", jobId }. The server pushes "progress",
 * "completed", and "failed" for that job. It can run on its own port or attach
 * to an existing HTTP server (the future Express app).
 */

import type { IncomingMessage, Server } from "node:http";
import { QueueEvents } from "bullmq";
import { WebSocketServer, type WebSocket } from "ws";
import { CRAWL_QUEUE_NAME, type CrawlProgress } from "../queue/crawlQueue.js";
import { redisConnection } from "../queue/connection.js";
import { tokenMatches } from "../server/access.js";
import type { ClientMessage, ServerMessage } from "./messages.js";
import { SubscriptionRegistry } from "./subscriptions.js";

export interface ProgressServer {
  close(): Promise<void>;
}

export type ProgressServerOptions = ({ port: number } | { server: Server }) & {
  /** When set, a connection needs `Authorization: Bearer <token>`, as the API does. */
  token?: string | null;
};

/**
 * Whether a WebSocket upgrade may go ahead. Progress names job ids and sites,
 * so with a token set the socket is closed to the same callers the API is.
 * The header is the only place it is read: a token in the query string would
 * land in every proxy and access log.
 */
export function upgradeAllowed(req: IncomingMessage, token: string | null | undefined): boolean {
  return !token || tokenMatches(req.headers.authorization, token);
}

export function createProgressServer(options: ProgressServerOptions): ProgressServer {
  const verifyClient = ({ req }: { req: IncomingMessage }) => upgradeAllowed(req, options.token);
  const wss =
    "server" in options
      ? new WebSocketServer({ server: options.server, verifyClient })
      : new WebSocketServer({ port: options.port, verifyClient });

  const registry = new SubscriptionRegistry<WebSocket>();
  const queueEvents = new QueueEvents(CRAWL_QUEUE_NAME, { connection: redisConnection() });

  const send = (client: WebSocket, message: ServerMessage): void => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(message));
    }
  };

  const broadcast = (jobId: string, message: ServerMessage): void => {
    for (const client of registry.subscribers(jobId)) send(client, message);
  };

  queueEvents.on("progress", ({ jobId, data }) => {
    broadcast(jobId, { type: "progress", jobId, data: data as CrawlProgress });
  });
  queueEvents.on("completed", ({ jobId }) => {
    broadcast(jobId, { type: "completed", jobId });
  });
  queueEvents.on("failed", ({ jobId, failedReason }) => {
    broadcast(jobId, { type: "failed", jobId, reason: failedReason });
  });

  wss.on("connection", (socket: WebSocket) => {
    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return; // ignore malformed frames
      }
      if (typeof message?.jobId !== "string") return;

      if (message.type === "subscribe") {
        registry.subscribe(message.jobId, socket);
        send(socket, { type: "subscribed", jobId: message.jobId });
      } else if (message.type === "unsubscribe") {
        registry.unsubscribe(message.jobId, socket);
      }
    });

    socket.on("close", () => registry.removeClient(socket));
    socket.on("error", () => registry.removeClient(socket));
  });

  return {
    async close() {
      await queueEvents.close();
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
