/* Reads Figma through its REST API with a personal access token (FIGMA_TOKEN).

   The file endpoint returns every component and its property definitions on any
   plan, so components are read live. Variables are not: the REST variables
   endpoint needs an Enterprise plan, so they come from the snapshot exported by
   plugin-export.js, and this module only reports when that snapshot is older
   than the file. */

const API = "https://api.figma.com/v1";

/** Figma could not be read: rate limited, down, or unreachable. The check falls
    back to the committed snapshot rather than failing the pull request. */
export class FigmaUnavailable extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/* A rate limit or a server error is worth a short wait. Figma's Retry-After can
   run to days on a monthly limit; anything past MAX_WAIT is not waited for. */
const RETRIES = 2;
const MAX_WAIT = 60;

/** Seconds to wait before retry `attempt` (1-based), or null to stop. */
export function retryDelay(status, retryAfter, attempt) {
  if (attempt > RETRIES || !(status === 429 || status >= 500)) return null;
  const asked = Number(retryAfter);
  if (Number.isFinite(asked) && asked > 0) return asked <= MAX_WAIT ? asked : null;
  return 15 * attempt;
}

const wait = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000));

async function get(url, token) {
  const where = url.replace(API, "");
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { "X-Figma-Token": token },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      throw new FigmaUnavailable(`Figma API unreachable for ${where}: ${e.message}`);
    }
    if (res.ok) {
      // The body arrives after the headers and can fail on its own, so reading
      // it is a transport step too. Malformed JSON is not: that stays an error.
      let text;
      try {
        text = await res.text();
      } catch (e) {
        throw new FigmaUnavailable(`Figma API response cut off for ${where}: ${e.message}`);
      }
      return JSON.parse(text);
    }
    const delay = retryDelay(res.status, res.headers.get("retry-after"), attempt);
    if (delay === null) {
      const message = `Figma API ${res.status} for ${where}`;
      // 401 and 403 are a bad token, which a snapshot would only hide.
      if (res.status === 429 || res.status >= 500) throw new FigmaUnavailable(message, res.status);
      throw new Error(message);
    }
    await wait(delay);
  }
}

/** When the file last changed, without downloading its tree. */
export async function lastModified(key, token) {
  const file = await get(`${API}/files/${key}?depth=1`, token);
  return file.lastModified;
}

/** The file's components in the raw shape plugin-export.js also produces. */
export async function fetchComponents(key, token) {
  const file = await get(`${API}/files/${key}`, token);
  const components = [];
  for (const page of file.document.children ?? []) {
    const walk = (node, parentType) => {
      if (node.type === "COMPONENT_SET" || node.type === "COMPONENT") {
        const defs = node.componentPropertyDefinitions ?? {};
        components.push({
          name: node.name,
          page: page.name,
          type: node.type,
          inSet: parentType === "COMPONENT_SET",
          props: Object.entries(defs).map(([name, d]) => ({
            name,
            type: d.type,
            options: d.variantOptions ?? [],
          })),
        });
      }
      for (const child of node.children ?? []) walk(child, node.type);
    };
    walk(page, "CANVAS");
  }
  return { file: { key, name: file.name, lastModified: file.lastModified }, components };
}
