import { describe, expect, it } from "vitest";
import { contractStatus } from "./crawlJobs.js";

describe("contractStatus", () => {
  it("reports every not-yet-started BullMQ state as queued", () => {
    for (const state of ["waiting", "delayed", "prioritized", "waiting-children"]) {
      expect(contractStatus(state)).toBe("queued");
    }
  });

  it("passes the three states the contract shares with BullMQ through", () => {
    expect(contractStatus("active")).toBe("active");
    expect(contractStatus("completed")).toBe("completed");
    expect(contractStatus("failed")).toBe("failed");
  });

  it("reports a job in no list as not found", () => {
    expect(contractStatus("unknown")).toBe("not_found");
  });
});
