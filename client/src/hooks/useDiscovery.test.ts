import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDiscovery } from "./useDiscovery.js";
import { discoverPages } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({ discoverPages: vi.fn() }));
const api = vi.mocked(discoverPages);

const page = (path: string) => ({ url: `https://x.test${path}`, path, title: path });

beforeEach(() => api.mockReset());

describe("useDiscovery", () => {
  it("starts with nothing asked and nothing wrong", () => {
    const { result } = renderHook(() => useDiscovery());
    expect(result.current).toMatchObject({ status: "idle", error: null, pages: [], host: "" });
  });

  it("reports the resolved site, not the one that was typed", async () => {
    // The server may add a scheme or a www; everything downstream should use
    // what it resolved rather than the raw input.
    api.mockResolvedValue({ pages: [page("/")], rootUrl: "https://www.x.test/", host: "www.x.test", via: "sitemap" });
    const { result } = renderHook(() => useDiscovery());

    await act(async () => void (await result.current.discover("x.test")));

    expect(result.current.rootUrl).toBe("https://www.x.test/");
    expect(result.current.host).toBe("www.x.test");
  });

  it("reports how the pages were found", async () => {
    // sitemap vs links is a finding about the site, not an implementation
    // detail: a site with no sitemap discovered by crawling anchors is a
    // different quality of result.
    api.mockResolvedValue({ pages: [page("/")], rootUrl: "https://x.test/", host: "x.test", via: "links" });
    const { result } = renderHook(() => useDiscovery());

    await act(async () => void (await result.current.discover("x.test")));

    expect(result.current.via).toBe("links");
  });

  it("returns null on failure, which pages.length cannot express", async () => {
    // A site with no pages and a site that could not be reached are different
    // screens, and both leave `pages` empty.
    api.mockImplementation(async () => { throw new Error("nope"); });
    const { result } = renderHook(() => useDiscovery());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.discover("x.test");
    });
    expect(returned).toBeNull();

    api.mockResolvedValue({ pages: [], rootUrl: "https://x.test/", host: "x.test", via: "sitemap" });
    await act(async () => {
      returned = await result.current.discover("x.test");
    });
    expect(returned).toEqual([]);
    expect(result.current.status).toBe("ready");
  });

  /**
   * Two things at once, deliberately. The message a failed attempt surfaces has
   * to be the API surface's own — replacing it with a generic one is what makes
   * an error screen useless — and it has to disappear when the next attempt
   * starts, or a reader retries successfully and still sees the old failure.
   */
  it("surfaces the API's message, then clears it when the next attempt starts", async () => {
    api.mockImplementation(async () => { throw new Error("Couldn't resolve that host."); });
    const { result } = renderHook(() => useDiscovery());
    await act(async () => void (await result.current.discover("x.test")));
    expect(result.current.error).toBe("Couldn't resolve that host.");
    expect(result.current.status).toBe("idle");

    api.mockResolvedValue({ pages: [page("/")], rootUrl: "https://x.test/", host: "x.test", via: "sitemap" });
    await act(async () => void (await result.current.discover("x.test")));

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.status).toBe("ready");
  });

  it("is discovering while the request is in flight", async () => {
    type Response = { pages: ReturnType<typeof page>[]; rootUrl: string; host: string; via: string };
    let release!: (v: Response) => void;
    const pending = new Promise<Response>((res) => { release = res; });
    api.mockReturnValue(pending);
    const { result } = renderHook(() => useDiscovery());

    let settled: Promise<unknown>;
    act(() => { settled = result.current.discover("x.test"); });
    await waitFor(() => expect(result.current.status).toBe("discovering"));

    await act(async () => {
      release({ pages: [page("/")], rootUrl: "https://x.test/", host: "x.test", via: "sitemap" });
      await settled;
    });
    expect(result.current.status).toBe("ready");
  });

  it("keeps a page added by hand alongside the discovered ones", async () => {
    api.mockResolvedValue({ pages: [page("/")], rootUrl: "https://x.test/", host: "x.test", via: "sitemap" });
    const { result } = renderHook(() => useDiscovery());
    await act(async () => void (await result.current.discover("x.test")));

    act(() => result.current.addPage(page("/hidden")));

    expect(result.current.pages.map((p) => p.path)).toEqual(["/", "/hidden"]);
  });

  it("resets to the start without discarding what was found", async () => {
    // "Change site" returns to the URL step; the pages stay until the next
    // discovery replaces them, so going back and forward does not re-fetch.
    api.mockResolvedValue({ pages: [page("/")], rootUrl: "https://x.test/", host: "x.test", via: "sitemap" });
    const { result } = renderHook(() => useDiscovery());
    await act(async () => void (await result.current.discover("x.test")));

    act(() => result.current.reset());

    expect(result.current.status).toBe("idle");
    expect(result.current.pages).toHaveLength(1);
  });
});
