import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./crawl.js";

describe("isSameOrigin", () => {
  const origin = "https://picocss.com";

  it("accepts a page on the origin", () => {
    expect(isSameOrigin("https://picocss.com/docs", origin)).toBe(true);
  });

  it("refuses a host that starts with the origin's host", () => {
    expect(isSameOrigin("https://picocss.com.example.net/", origin)).toBe(false);
  });

  it("refuses the same host on another port", () => {
    expect(isSameOrigin("https://picocss.com:8443/", origin)).toBe(false);
  });

  it("refuses the same host on another scheme", () => {
    expect(isSameOrigin("http://picocss.com/", origin)).toBe(false);
  });

  it("refuses a string that is not a URL", () => {
    expect(isSameOrigin("/docs", origin)).toBe(false);
  });
});
