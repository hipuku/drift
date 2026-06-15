import { describe, expect, it } from "vitest";
import { SubscriptionRegistry } from "./subscriptions.js";

// Plain objects stand in for clients — the registry is client-type agnostic.
const client = (name: string) => ({ name });

describe("SubscriptionRegistry", () => {
  it("routes a job's events to its subscribers only", () => {
    const reg = new SubscriptionRegistry<object>();
    const a = client("a");
    const b = client("b");
    const c = client("c");

    reg.subscribe("job1", a);
    reg.subscribe("job1", b);
    reg.subscribe("job2", c);

    expect(new Set(reg.subscribers("job1"))).toEqual(new Set([a, b]));
    expect(reg.subscribers("job2")).toEqual([c]);
    expect(reg.subscribers("unknown")).toEqual([]);
  });

  it("unsubscribes a single client and prunes empty jobs", () => {
    const reg = new SubscriptionRegistry<object>();
    const a = client("a");

    reg.subscribe("job1", a);
    expect(reg.jobCount).toBe(1);

    reg.unsubscribe("job1", a);
    expect(reg.subscribers("job1")).toEqual([]);
    expect(reg.jobCount).toBe(0);
  });

  it("removes a client from every job on disconnect", () => {
    const reg = new SubscriptionRegistry<object>();
    const a = client("a");
    const b = client("b");

    reg.subscribe("job1", a);
    reg.subscribe("job2", a);
    reg.subscribe("job2", b);

    reg.removeClient(a);

    expect(reg.subscribers("job1")).toEqual([]);
    expect(reg.subscribers("job2")).toEqual([b]);
    expect(reg.jobCount).toBe(1);
  });

  it("is idempotent on duplicate subscribe", () => {
    const reg = new SubscriptionRegistry<object>();
    const a = client("a");
    reg.subscribe("job1", a);
    reg.subscribe("job1", a);
    expect(reg.subscribers("job1")).toEqual([a]);
  });
});
