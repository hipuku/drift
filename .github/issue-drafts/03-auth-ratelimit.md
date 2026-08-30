The API has no authentication and no rate limiting. Anyone who can reach the service can enqueue Playwright crawls of arbitrary sites.

Two consequences:

- **Resource exhaustion.** Each job is a headless Chromium crawling up to N pages. Unbounded enqueueing is a denial of service against the host, and it costs real money on anything metered.
- **Abuse.** drift will crawl any URL it is given. Exposed, it is someone else's scanner, running from your IP, with your reputation attached.

Today the only control is that the backend is not deployed publicly — the live site replays a captured audit and never talks to the service. That is a deployment decision doing a security control's job, which holds exactly until someone deploys the backend to show it working.

### Proposal, in the order that buys the most per unit of work

1. **A shared-secret header on `/crawl`.** The expensive endpoint is the one that needs it; `/discover` is cheap and read-only.
2. **Rate limit by key**, and separately cap concurrent in-flight jobs per key — the queue depth matters more than requests per second when one request is a two-minute crawl.
3. **An allowlist or a robots.txt check** before crawling, so drift declines to be pointed at arbitrary third parties.

### Not urgent, but blocking

This does not need doing this week. It needs doing **before the backend is exposed**, and the failure mode is that exposing it is a five-minute change made by someone who does not know this issue exists. Worth linking from DESIGN.md's deployment notes so the constraint travels with the decision.
