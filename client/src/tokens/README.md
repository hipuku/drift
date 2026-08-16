# Vendored haus tokens

These three files are copied from [`haus`](https://github.com/hipuku/haus)
(`packages/tokens/src/`). They are vendored rather than installed because
`@haus/tokens` is not published to npm, and vendoring lets drift build
standalone on any host (Cloudflare, Vercel, CI) with no sibling checkout.

Only the CSS custom properties (`--space-*`, `--text-*`, etc.) are used.
