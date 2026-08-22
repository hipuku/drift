import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditFlow } from "./AuditFlow";
import { getAudit, startCrawl } from "../lib/api.js";
import { useCrawlProgress, type CrawlProgressState } from "../lib/useCrawlProgress.js";

vi.mock("../lib/api.js", () => ({
  startCrawl: vi.fn(),
  getAudit: vi.fn(),
}));

vi.mock("../lib/useCrawlProgress.js", () => ({ useCrawlProgress: vi.fn() }));

/**
 * The two substantive screens are stubbed. Configure has its own tests and
 * Audit is 1800 lines; what matters here is the orchestration between them.
 */
vi.mock("../screens/Configure/Configure.js", () => ({
  Configure: ({ onSubmit }: { onSubmit?: (url: string, pages: string[]) => void }) => (
    <button onClick={() => onSubmit?.("picocss.com", ["/", "/docs"])}>submit-configure</button>
  ),
}));

vi.mock("../screens/Audit/Audit.js", () => ({
  Audit: ({ audit, onBack }: { audit: { id: string }; onBack: () => void }) => (
    <div>
      <p>audit-screen:{audit.id}</p>
      <button onClick={onBack}>back</button>
    </div>
  ),
}));

const crawlHook = vi.mocked(useCrawlProgress);
const start = vi.mocked(startCrawl);
const audit = vi.mocked(getAudit);

const running: CrawlProgressState = {
  phase: "running",
  progress: null,
  crawledPages: [],
  result: null,
  error: null,
};

const completed = (pageCount: number): CrawlProgressState => ({
  ...running,
  phase: "completed",
  result: {
    rootUrl: "https://picocss.com",
    crawledAt: "now",
    pages: Array.from({ length: pageCount }, (_, i) => ({
      url: `https://picocss.com/${i}`,
      title: `p${i}`,
      elementCount: 10,
    })),
  },
});

/** Drive the hook's return value, then let the flow's effect react to it. */
const setCrawl = (state: CrawlProgressState) => crawlHook.mockReturnValue(state);

beforeEach(() => {
  setCrawl(running);
  start.mockResolvedValue({ jobId: "job-1" });
  audit.mockResolvedValue({ id: "audit-1" } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Get to the crawling phase, which is the entry point for most cases. */
async function startCrawling() {
  const view = render(<AuditFlow />);
  await userEvent.click(screen.getByRole("button", { name: "submit-configure" }));
  await waitFor(() => expect(start).toHaveBeenCalled());
  return view;
}

describe("configure", () => {
  it("starts on the configure screen", () => {
    render(<AuditFlow />);
    expect(screen.getByRole("button", { name: "submit-configure" })).toBeInTheDocument();
  });

  it("starts the crawl with the submitted url and pages", async () => {
    await startCrawling();
    expect(start).toHaveBeenCalledWith("picocss.com", ["/", "/docs"]);
  });

  it("derives the host from a bare domain for the crawl screen", async () => {
    await startCrawling();
    // "picocss.com" is not a valid URL on its own; the flow retries it with a
    // scheme rather than showing the raw string.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Crawling picocss.com",
    );
  });

  it("fails with the server's message when the crawl cannot be queued", async () => {
    start.mockRejectedValue(new Error("Redis is unreachable."));

    render(<AuditFlow />);
    await userEvent.click(screen.getByRole("button", { name: "submit-configure" }));

    expect(await screen.findByText("Redis is unreachable.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audit stopped" })).toBeInTheDocument();
  });

  it("falls back to a generic message when the rejection is not an Error", async () => {
    start.mockRejectedValue("boom");

    render(<AuditFlow />);
    await userEvent.click(screen.getByRole("button", { name: "submit-configure" }));

    expect(await screen.findByText("Could not start the crawl.")).toBeInTheDocument();
  });

  it("does not subscribe to progress before a crawl exists", () => {
    render(<AuditFlow />);
    // The hook is called with null until the flow is actually crawling, so no
    // socket is opened on the configure screen.
    expect(crawlHook).toHaveBeenCalledWith(null);
  });
});

describe("crawl completion", () => {
  it("fetches the audit and lands on it", async () => {
    const { rerender } = await startCrawling();

    setCrawl(completed(2));
    await act(async () => rerender(<AuditFlow />));

    await waitFor(() => expect(audit).toHaveBeenCalledWith("job-1"));
    expect(await screen.findByText("audit-screen:audit-1")).toBeInTheDocument();
  });

  it("fails rather than showing an empty audit when no page could be read", async () => {
    const { rerender } = await startCrawling();

    setCrawl(completed(0));
    await act(async () => rerender(<AuditFlow />));

    expect(await screen.findByText(/Couldn't read any pages/)).toBeInTheDocument();
    // The audit is never requested for a crawl that produced nothing.
    expect(audit).not.toHaveBeenCalled();
  });

  it("only loads the audit once, however often the effect re-runs", async () => {
    const { rerender } = await startCrawling();

    setCrawl(completed(2));
    await act(async () => rerender(<AuditFlow />));
    await act(async () => rerender(<AuditFlow />));
    await act(async () => rerender(<AuditFlow />));

    await waitFor(() => expect(audit).toHaveBeenCalledTimes(1));
  });

  it("surfaces a failed crawl with the reason the worker gave", async () => {
    const { rerender } = await startCrawling();

    setCrawl({ ...running, phase: "failed", error: "net::ERR_NAME_NOT_RESOLVED" });
    await act(async () => rerender(<AuditFlow />));

    expect(await screen.findByText("net::ERR_NAME_NOT_RESOLVED")).toBeInTheDocument();
  });

  it("falls back when a failed crawl carries no reason", async () => {
    const { rerender } = await startCrawling();

    setCrawl({ ...running, phase: "failed", error: null });
    await act(async () => rerender(<AuditFlow />));

    expect(await screen.findByText("The crawl failed.")).toBeInTheDocument();
  });

  it("fails with the server's message when the audit itself cannot be read", async () => {
    audit.mockRejectedValue(new Error("the crawl has not finished"));
    const { rerender } = await startCrawling();

    setCrawl(completed(2));
    await act(async () => rerender(<AuditFlow />));

    expect(await screen.findByText("the crawl has not finished")).toBeInTheDocument();
  });
});

describe("recovery", () => {
  it("returns to configure from the error screen", async () => {
    start.mockRejectedValue(new Error("nope"));
    render(<AuditFlow />);
    await userEvent.click(screen.getByRole("button", { name: "submit-configure" }));
    await screen.findByText("nope");

    await userEvent.click(screen.getByRole("button", { name: "Start over" }));

    expect(screen.getByRole("button", { name: "submit-configure" })).toBeInTheDocument();
  });

  it("allows a second audit after finishing one", async () => {
    const { rerender } = await startCrawling();
    setCrawl(completed(2));
    await act(async () => rerender(<AuditFlow />));
    await screen.findByText("audit-screen:audit-1");

    await userEvent.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByRole("button", { name: "submit-configure" })).toBeInTheDocument();

    // The load guard must have been released, or the next crawl would never
    // fetch its audit.
    setCrawl(running);
    await userEvent.click(screen.getByRole("button", { name: "submit-configure" }));
    setCrawl(completed(2));
    await act(async () => rerender(<AuditFlow />));

    await waitFor(() => expect(audit).toHaveBeenCalledTimes(2));
  });
});

describe("browser history", () => {
  it("pushes an entry when moving forward, so Back walks the flow", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const { rerender } = await startCrawling();

    setCrawl(completed(2));
    await act(async () => rerender(<AuditFlow />));
    await screen.findByText("audit-screen:audit-1");

    expect(push).toHaveBeenCalledWith({ phase: "audit" }, "");
    push.mockRestore();
  });

  it("restores the phase a popstate names", async () => {
    const { rerender } = await startCrawling();
    setCrawl(completed(2));
    await act(async () => rerender(<AuditFlow />));
    await screen.findByText("audit-screen:audit-1");

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { phase: "configure" } }));
    });

    expect(screen.getByRole("button", { name: "submit-configure" })).toBeInTheDocument();
  });

  it("falls back to configure when a popstate carries no phase", async () => {
    // Popping past the app's own entries lands on an unrelated state; the flow
    // must not render a blank screen.
    const { rerender } = await startCrawling();
    setCrawl(completed(2));
    await act(async () => rerender(<AuditFlow />));
    await screen.findByText("audit-screen:audit-1");

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    expect(screen.getByRole("button", { name: "submit-configure" })).toBeInTheDocument();
  });
});
