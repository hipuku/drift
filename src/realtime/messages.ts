/**
 * The WebSocket wire protocol.
 *
 * The socket carries progress and lifecycle signals only: small, frequent
 * messages. The crawl result itself is fetched out of band (over HTTP), not
 * pushed down the socket, so a large payload never travels this channel.
 */

import type { CrawlProgress } from "../queue/crawlQueue.js";

/** Client → server. */
export type ClientMessage =
  | { type: "subscribe"; jobId: string }
  | { type: "unsubscribe"; jobId: string };

/** Server → client. */
export type ServerMessage =
  | { type: "subscribed"; jobId: string }
  | { type: "progress"; jobId: string; data: CrawlProgress }
  | { type: "completed"; jobId: string }
  | { type: "failed"; jobId: string; reason: string };
