/**
 * Which addresses the server may reach on a caller's behalf.
 *
 * Every URL drift fetches comes from a caller: the site to crawl, the pages
 * picked from it, the callback to post the audit to. Each is an SSRF vector.
 * Without a check, a request to crawl `http://169.254.169.254/` has a headless
 * browser on the server read the cloud metadata endpoint, and a page that
 * redirects to `http://10.0.0.5/` has it read the private network.
 *
 * A host passes when every address it resolves to is public. A name can point
 * anywhere (`localtest.me` resolves to 127.0.0.1), so the check is on the
 * resolved addresses, never on how the name looks. An operator can exempt
 * named hosts through an environment variable, for a fixture site in tests or
 * a receiver inside the same network.
 */

import { lookup } from "node:dns/promises";

export type Resolve = (host: string) => Promise<Array<{ address: string; family: number }>>;

const systemResolve: Resolve = (host) => lookup(host, { all: true }).catch(() => []);

/** The message a caller sees when the site to crawl is on a private network. */
export const CRAWL_PRIVATE =
  "That address is on a private or local network, which drift does not crawl.";

/**
 * Addresses the server must not reach: unspecified, loopback, private,
 * carrier-grade NAT (100.64/10), link-local, unique-local and multicast. An
 * IPv4-mapped IPv6 address (`::ffff:127.0.0.1`, `::ffff:7f00:1`) is checked as
 * the IPv4 address it carries.
 */
export function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) {
    const v6 = address.toLowerCase();
    const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    if (dotted) return isPrivateAddress(dotted[1]!, 4);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
    if (hex) {
      const high = Number.parseInt(hex[1]!, 16);
      const low = Number.parseInt(hex[2]!, 16);
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`, 4);
    }
    return (
      v6 === "::" ||
      v6 === "::1" ||
      /^f[cd]/.test(v6) ||
      /^fe[89ab]/.test(v6) ||
      v6.startsWith("ff")
    );
  }
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/**
 * The hosts named in a comma-separated environment variable, lower-cased.
 * Empty by default, so a guard is fully on unless the operator opts a host in.
 * Read on every call, so tests and config can set it at runtime.
 */
export function allowedHosts(variable: string): Set<string> {
  return new Set(
    (process.env[variable] ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** A URL's hostname as the resolver takes it: IPv6 literals lose their brackets. */
export function bareHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

/**
 * How a host resolves: `public` when every address is public, `private` when
 * any address is not, `unresolved` when it resolves to nothing.
 */
export async function classifyHost(
  hostname: string,
  resolve: Resolve = systemResolve,
): Promise<"public" | "private" | "unresolved"> {
  const resolved = await resolve(bareHost(hostname));
  if (resolved.length === 0) return "unresolved";
  return resolved.some((r) => isPrivateAddress(r.address, r.family)) ? "private" : "public";
}

/**
 * Whether the crawler may load anything from this host. Allowlisted hosts in
 * `DRIFT_CRAWL_ALLOWED_HOSTS` pass; anything else must resolve, and only to
 * public addresses. Unresolved is refused here because the browser would load
 * the request with its own resolver, which is the one place a name could
 * answer differently.
 */
export async function isCrawlableHost(
  hostname: string,
  options: { resolve?: Resolve } = {},
): Promise<boolean> {
  if (allowedHosts("DRIFT_CRAWL_ALLOWED_HOSTS").has(bareHost(hostname))) return true;
  return (await classifyHost(hostname, options.resolve)) === "public";
}

/**
 * Throw `CRAWL_PRIVATE` when the site a caller asks to crawl resolves to a
 * private address. A bare host gets `https://`, the guess the crawler makes. A
 * host that does not resolve passes: the crawl then fails with the site's own
 * "could not be found", which says more than a refusal would.
 */
export async function assertCrawlable(
  input: string,
  options: { resolve?: Resolve } = {},
): Promise<void> {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return; // not a URL: the caller's own validation reports that
  }
  if (allowedHosts("DRIFT_CRAWL_ALLOWED_HOSTS").has(bareHost(url.hostname))) return;
  if ((await classifyHost(url.hostname, options.resolve)) === "private") {
    throw new Error(CRAWL_PRIVATE);
  }
}
