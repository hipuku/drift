import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCrawlProgress } from "./useCrawlProgress";
import { getCrawlStatus } from "./api.js";

vi.mock("./api.js", () => ({
  getCrawlStatus: vi.fn(),
  progressSocketUrl: () => "ws://localhost/ws",
}));

const status = vi.mocked(getCrawlStatus);

/**
 * A WebSocket stand-in that records what was sent and lets a test drive the
 * events. jsdom has no WebSocket, and a real one would make these tests depend
 * on a running backend.
 */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static throwOnConstruct = false;

  sent: string[] = [];
  closed = false;
  private listeners: Record<string, ((e: unknown) => void)[]> = {};

  constructor(public url: string) {
    if (FakeSocket.throwOnConstruct) throw new Error("socket refused");
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event: unknown = {}) {
    for (const fn of this.listeners[type] ?? []) fn(event);
  }

  /** Deliver a server frame, as the real socket would. */
  message(payload: unknown) {
    this.emit("message", { data: JSON.stringify(payload) });
  }

  static latest(): FakeSocket {
    const s = FakeSocket.instances[FakeSocket.instances.length - 1];
    if (!s) throw new Error("no socket was opened");
    return s;
  }
}

const progressFrame = (over: Record<string, unknown> = {}) => ({
  type: "progress",
  data: {
    pagesCrawled: 1,
    maxPages: 5,
    lastUrl: "https://x.test/a",
    lastTitle: "A",
    lastElements: 10,
    ...over,
  },
});

beforeEach(() => {
  FakeSocket.instances = [];
  FakeSocket.throwOnConstruct = false;
  vi.stubGlobal("WebSocket", FakeSocket);
  // Default: a crawl still in flight, so nothing resolves unless a test says so.
  status.mockResolvedValue({ status: "active", result: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("subscription", () => {
  it("opens a socket and subscribes to the job", async () => {
    renderHook(() => useCrawlProgress("job-1"));

    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    act(() => FakeSocket.latest().emit("open"));

    expect(FakeSocket.latest().url).toBe("ws://localhost/ws");
    expect(JSON.parse(FakeSocket.latest().sent[0]!)).toEqual({
      type: "subscribe",
      jobId: "job-1",
    });
  });

  it("opens no socket and stays idle without a job id", () => {
    const { result } = renderHook(() => useCrawlProgress(null));
    expect(FakeSocket.instances).toHaveLength(0);
    expect(status).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("running");
  });

  it("survives a socket that refuses to construct", async () => {
    // The socket is best-effort. If it cannot even be created, the poll must
    // still resolve the crawl rather than the hook throwing during render.
    FakeSocket.throwOnConstruct = true;
    status.mockResolvedValue({
      status: "completed",
      result: { rootUrl: "https://x.test", crawledAt: "now", pages: [] },
    });

    const { result } = renderHook(() => useCrawlProgress("job-1"));

    await waitFor(() => expect(result.current.phase).toBe("completed"));
  });

  it("closes the socket on unmount", async () => {
    const { unmount } = renderHook(() => useCrawlProgress("job-1"));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));

    unmount();

    expect(FakeSocket.latest().closed).toBe(true);
  });
});

describe("progress frames", () => {
  it("accumulates crawled pages in arrival order", async () => {
    const { result } = renderHook(() => useCrawlProgress("job-1"));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));

    act(() => {
      FakeSocket.latest().message(progressFrame());
      FakeSocket.latest().message(
        progressFrame({ pagesCrawled: 2, lastUrl: "https://x.test/b", lastTitle: "B" }),
      );
    });

    expect(result.current.crawledPages.map((p) => p.url)).toEqual([
      "https://x.test/a",
      "https://x.test/b",
    ]);
    expect(result.current.progress?.pagesCrawled).toBe(2);
  });

  it("dedupes a page that arrives twice", async () => {
    const { result } = renderHook(() => useCrawlProgress("job-1"));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));

    act(() => {
      FakeSocket.latest().message(progressFrame());
      FakeSocket.latest().message(progressFrame({ pagesCrawled: 2 }));
    });

    expect(result.current.crawledPages).toHaveLength(1);
    // The counter still advances even though the page list does not.
    expect(result.current.progress?.pagesCrawled).toBe(2);
  });

  it("ignores a malformed frame instead of throwing", async () => {
    const { result } = renderHook(() => useCrawlProgress("job-1"));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));

    act(() => FakeSocket.latest().emit("message", { data: "<html>not json</html>" }));

    expect(result.current.crawledPages).toEqual([]);
    expect(result.current.phase).toBe("running");
  });

  it("ignores frames without a progress payload", async () => {
    const { result } = renderHook(() => useCrawlProgress("job-1"));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));

    act(() => {
      FakeSocket.latest().message({ type: "hello" });
      FakeSocket.latest().message({ type: "progress" });
    });

    expect(result.current.progress).toBeNull();
  });

  it("ignores late progress once the crawl has completed", async () => {
    status.mockResolvedValue({
      status: "completed",
      result: { rootUrl: "https://x.test", crawledAt: "now", pages: [] },
    });
    const { result } = renderHook(() => useCrawlProgress("job-1"));
    await waitFor(() => expect(result.current.phase).toBe("completed"));

    act(() => FakeSocket.latest().message(progressFrame()));

    // A frame arriving after completion must not reopen the run.
    expect(result.current.phase).toBe("completed");
    expect(result.current.crawledPages).toEqual([]);
  });
});

describe("completion", () => {
  it("reports completion with the result", async () => {
    const result_ = { rootUrl: "https://x.test", crawledAt: "now", pages: [] };
    status.mockResolvedValue({ status: "completed", result: result_ });

    const { result } = renderHook(() => useCrawlProgress("job-1"));

    await waitFor(() => expect(result.current.phase).toBe("completed"));
    expect(result.current.result).toEqual(result_);
    expect(result.current.error).toBeNull();
  });

  it("prefers the worker's reason when the crawl fails", async () => {
    status.mockResolvedValue({
      status: "failed",
      result: null,
      error: "net::ERR_CERT_AUTHORITY_INVALID",
    });

    const { result } = renderHook(() => useCrawlProgress("job-1"));

    await waitFor(() => expect(result.current.phase).toBe("failed"));
    expect(result.current.error).toBe("net::ERR_CERT_AUTHORITY_INVALID");
  });

  it("falls back to a friendly message when the worker gives no reason", async () => {
    status.mockResolvedValue({ status: "failed", result: null });

    const { result } = renderHook(() => useCrawlProgress("job-1"));

    await waitFor(() => expect(result.current.phase).toBe("failed"));
    expect(result.current.error).toContain("couldn’t finish");
  });

  it("treats an expired job as failed, with its own message", async () => {
    status.mockResolvedValue({ status: "not_found", result: null });

    const { result } = renderHook(() => useCrawlProgress("job-1"));

    await waitFor(() => expect(result.current.phase).toBe("failed"));
    expect(result.current.error).toBe("That crawl job has expired. Start a new audit.");
  });

  it("keeps polling through a transient fetch error", async () => {
    vi.useFakeTimers();
    status
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue({
        status: "completed",
        result: { rootUrl: "https://x.test", crawledAt: "now", pages: [] },
      });

    const { result } = renderHook(() => useCrawlProgress("job-1"));

    // First poll rejects. The run must not fail; it must schedule another.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(status).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe("completed");
  });

  it("stops polling once the crawl has completed", async () => {
    vi.useFakeTimers();
    status.mockResolvedValue({
      status: "completed",
      result: { rootUrl: "https://x.test", crawledAt: "now", pages: [] },
    });

    renderHook(() => useCrawlProgress("job-1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsAtCompletion = status.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(status.mock.calls.length).toBe(callsAtCompletion);
  });
});

describe("job change", () => {
  it("resets a completed state when a new job starts", async () => {
    // The bug this guards: a lingering "completed" from the previous crawl let
    // the orchestrator fetch the audit before the new job had finished, and the
    // server answered 409 "the crawl has not finished".
    status.mockResolvedValue({
      status: "completed",
      result: { rootUrl: "https://x.test", crawledAt: "now", pages: [] },
    });
    const { result, rerender } = renderHook(({ id }) => useCrawlProgress(id), {
      initialProps: { id: "job-1" as string | null },
    });
    await waitFor(() => expect(result.current.phase).toBe("completed"));

    status.mockResolvedValue({ status: "active", result: null });
    rerender({ id: "job-2" });

    expect(result.current.phase).toBe("running");
    expect(result.current.result).toBeNull();
  });

  it("resets when the job is cleared to null", async () => {
    status.mockResolvedValue({
      status: "completed",
      result: { rootUrl: "https://x.test", crawledAt: "now", pages: [] },
    });
    const { result, rerender } = renderHook(({ id }) => useCrawlProgress(id), {
      initialProps: { id: "job-1" as string | null },
    });
    await waitFor(() => expect(result.current.phase).toBe("completed"));

    rerender({ id: null });

    expect(result.current.phase).toBe("running");
    expect(result.current.result).toBeNull();
  });

  it("closes the previous socket when the job changes", async () => {
    const { rerender } = renderHook(({ id }) => useCrawlProgress(id), {
      initialProps: { id: "job-1" as string | null },
    });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const first = FakeSocket.latest();

    rerender({ id: "job-2" });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(2));

    expect(first.closed).toBe(true);
    act(() => FakeSocket.latest().emit("open"));
    expect(JSON.parse(FakeSocket.latest().sent[0]!).jobId).toBe("job-2");
  });

  it("does not let a previous job's in-flight poll land as the new job's state", async () => {
    // Regression. The guard used to be a ref shared across effect runs. On a
    // job change React runs the old cleanup and the new effect body in one
    // commit, so the ref was already true again when job-1's poll resolved,
    // and job-1's "completed" was written as job-2's state, so the audit was
    // then fetched for a crawl that had not finished (a 409).
    let resolveFirst!: (v: unknown) => void;
    const firstPoll = new Promise((r) => {
      resolveFirst = r;
    });
    status.mockImplementation(((jobId: string) =>
      jobId === "job-1" ? firstPoll : Promise.resolve({ status: "active", result: null })) as never);

    const { result, rerender } = renderHook(({ id }) => useCrawlProgress(id), {
      initialProps: { id: "job-1" as string | null },
    });
    rerender({ id: "job-2" });

    await act(async () => {
      resolveFirst({
        status: "completed",
        result: { rootUrl: "https://stale.test", crawledAt: "old", pages: [] },
      });
      await firstPoll;
    });

    expect(result.current.phase).toBe("running");
    expect(result.current.result).toBeNull();
  });

  it("ignores a frame from the socket of a job that has been replaced", async () => {
    const { result, rerender } = renderHook(({ id }) => useCrawlProgress(id), {
      initialProps: { id: "job-1" as string | null },
    });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const stale = FakeSocket.latest();

    rerender({ id: "job-2" });
    act(() => stale.message(progressFrame({ lastUrl: "https://stale.test/" })));

    expect(result.current.crawledPages).toEqual([]);
  });
});
