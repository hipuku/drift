import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * DNS is stubbed. Resolution is the platform's job, not ours — what this module
 * actually decides is what to do with the address that comes back, and a test
 * that reaches the real resolver tests the network instead, and fails without
 * one. The table below is the resolver: a public name, a loopback name, and a
 * name that does not resolve.
 */
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    const table: Record<string, { address: string; family: number }[]> = {
      "example.com": [{ address: "93.184.216.34", family: 4 }],
      localhost: [{ address: "127.0.0.1", family: 4 }],
      "127.0.0.1": [{ address: "127.0.0.1", family: 4 }],
      "10.0.0.1": [{ address: "10.0.0.1", family: 4 }],
      "192.168.1.10": [{ address: "192.168.1.10", family: 4 }],
      "172.16.0.5": [{ address: "172.16.0.5", family: 4 }],
      "169.254.169.254": [{ address: "169.254.169.254", family: 4 }],
    };
    const hit = table[hostname.toLowerCase()];
    if (!hit) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return hit;
  }),
}));

import { assertDeliverable, deliver } from "./webhook.js";

/**
 * The callback URL comes from the caller, so it is an SSRF vector: without a
 * guard, a request could make the server fetch something on its own network.
 * These cover the shapes that matter — the scheme, and where the host actually
 * resolves to (a public name can still point at 127.0.0.1).
 */
describe("assertDeliverable", () => {
  it("accepts a public https endpoint", async () => {
    await expect(assertDeliverable("https://example.com/hook")).resolves.toBeInstanceOf(URL);
  });

  it("rejects a non-http scheme", async () => {
    await expect(assertDeliverable("file:///etc/passwd")).rejects.toThrow(/http or https/);
    await expect(assertDeliverable("ftp://example.com")).rejects.toThrow(/http or https/);
  });

  it("rejects a malformed URL", async () => {
    await expect(assertDeliverable("not a url")).rejects.toThrow(/valid URL/);
  });

  it("rejects loopback", async () => {
    await expect(assertDeliverable("http://127.0.0.1:3001/hook")).rejects.toThrow(/private or loopback/);
    await expect(assertDeliverable("http://localhost:3001/hook")).rejects.toThrow(/private or loopback/);
  });

  it("rejects private ranges", async () => {
    for (const host of ["10.0.0.1", "192.168.1.10", "172.16.0.5"]) {
      await expect(assertDeliverable(`http://${host}/hook`)).rejects.toThrow(/private or loopback/);
    }
  });

  it("rejects the cloud metadata address", async () => {
    await expect(assertDeliverable("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      /private or loopback/,
    );
  });

  it("rejects a host that does not resolve", async () => {
    await expect(
      assertDeliverable("https://this-host-does-not-exist-4471.invalid/hook"),
    ).rejects.toThrow(/could not be resolved/);
  });

  it("allows a loopback host when it is explicitly allowlisted", async () => {
    // Off by default (the loopback test above proves that). Opt a host in and it
    // is exempt from the private-address refusal — how a trusted internal or
    // test receiver is permitted.
    const prev = process.env.DRIFT_WEBHOOK_ALLOWED_HOSTS;
    process.env.DRIFT_WEBHOOK_ALLOWED_HOSTS = "127.0.0.1, localhost";
    try {
      await expect(assertDeliverable("http://127.0.0.1:3001/hook")).resolves.toBeInstanceOf(URL);
      await expect(assertDeliverable("http://localhost:3001/hook")).resolves.toBeInstanceOf(URL);
    } finally {
      if (prev === undefined) delete process.env.DRIFT_WEBHOOK_ALLOWED_HOSTS;
      else process.env.DRIFT_WEBHOOK_ALLOWED_HOSTS = prev;
    }
  });
});

/**
 * Delivery itself can't be exercised against localhost — the guard above exists
 * precisely to stop that — so the transport is checked against a stubbed fetch.
 */
describe("deliver", () => {
  const payload = {
    event: "crawl.failed" as const,
    jobId: "1",
    site: "https://example.com/",
    error: "nope",
  };

  afterEach(() => vi.unstubAllGlobals());

  it("posts the event and reports success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deliver("https://example.com/hook", payload)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-drift-event"]).toBe("crawl.failed");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("does not retry a 4xx — the receiver rejected us on purpose", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deliver("https://example.com/hook", payload)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx, then gives up rather than throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deliver("https://example.com/hook", payload)).resolves.toBe(false);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  /**
   * The guard resolves the host and refuses private addresses. Following a
   * redirect would check one address and visit another: a caller supplies a
   * public URL that passes every check, and answers 302 with a Location of
   * http://169.254.169.254/. Node's fetch follows redirects by default, so the
   * refusal has to be asked for explicitly, and asserting it here is what stops
   * it being quietly dropped later.
   */
  it("does not follow redirects, which would walk around the SSRF guard", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 302 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deliver("https://example.com/hook", payload)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).redirect).toBe("manual");
  });

  it("signs the body when a secret is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DRIFT_WEBHOOK_SECRET", "shh");

    await deliver("https://example.com/hook", payload);
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers["x-drift-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    vi.unstubAllEnvs();
  });
});
