Two gaps in webhook delivery that share one fix: the header set.

### Replay

The signature is `sha256=HMAC(body)`. There is no timestamp, so a captured delivery is replayable indefinitely and a receiver has no way to detect it. Stripe and GitHub sign `timestamp.body` and send the timestamp alongside, precisely so a receiver can reject anything outside a tolerance window.

### Idempotency

There is no delivery or event id. Retries are at-least-once with no way for a receiver to deduplicate: if attempt 1 is processed but its response is lost, and attempt 2 succeeds, the receiver double-processes and cannot know it did. Retrying without an idempotency key hands the correctness problem to every consumer.

### Proposal

```
x-drift-delivery: <uuid>          stable across retries of the same event
x-drift-timestamp: <unix seconds>
x-drift-signature: sha256=HMAC(`${timestamp}.${body}`)
```

Document the tolerance window drift expects receivers to enforce, and the comparison being constant-time, in DESIGN.md beside the existing webhook decisions.

### Breaking

This changes the signature's preimage, so any existing receiver's verification stops matching. There are no external consumers today, which makes now the cheap moment. If that changes, ship both headers for a window and remove the old one on a version bump.

### Related

`features/webhook-delivery.feature` in drift-tests asserts the current signature shape and will need updating in the same change.
