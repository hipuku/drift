import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Crawling } from "./Crawling";
import type { CrawlProgress } from "../../lib/api.js";
import { axe } from "vitest-axe";

const progress = (over: Partial<CrawlProgress> = {}): CrawlProgress => ({
  pagesCrawled: 2,
  maxPages: 5,
  lastUrl: "https://x.test/about",
  ...over,
});

describe("Crawling", () => {
  it("names the host being crawled", () => {
    render(<Crawling host="picocss.com" progress={progress()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Crawling picocss.com");
  });

  it("exposes progress to assistive technology, not just as a coloured bar", () => {
    render(<Crawling host="x.test" progress={progress()} />);

    const bar = screen.getByRole("progressbar", { name: "Pages crawled" });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
  });

  it("shows a starting state before the first page lands", () => {
    render(<Crawling host="x.test" progress={null} />);
    expect(screen.getByText("Starting…")).toBeInTheDocument();
    // With no total yet, the bar cannot claim a maximum.
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuemax");
  });

  it("pluralises the page count", () => {
    const { rerender } = render(
      <Crawling host="x.test" progress={progress({ pagesCrawled: 1, maxPages: 1 })} />,
    );
    expect(screen.getByText("1 of 1 page")).toBeInTheDocument();

    rerender(<Crawling host="x.test" progress={progress({ pagesCrawled: 1, maxPages: 2 })} />);
    expect(screen.getByText("1 of 2 pages")).toBeInTheDocument();
  });

  it("shows the element tally only once there is one", () => {
    const { rerender } = render(<Crawling host="x.test" progress={progress()} />);
    expect(screen.queryByText(/elements read/)).not.toBeInTheDocument();

    rerender(<Crawling host="x.test" progress={progress({ elementsTotal: 12345 })} />);
    expect(screen.getByText("12,345 elements read")).toBeInTheDocument();
  });

  it("lists crawled pages newest first", () => {
    render(
      <Crawling
        host="x.test"
        progress={progress()}
        pages={[
          { url: "https://x.test/first" },
          { url: "https://x.test/second" },
          { url: "https://x.test/third" },
        ]}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByText(/^\//).textContent)).toEqual([
      "/third",
      "/second",
      "/first",
    ]);
  });

  it("does not mutate the pages array it is handed", () => {
    // The list is reversed for display. Reversing in place would scramble the
    // caller's accumulated order on every render.
    const pages = [{ url: "https://x.test/a" }, { url: "https://x.test/b" }];
    render(<Crawling host="x.test" progress={progress()} pages={pages} />);
    expect(pages.map((p) => p.url)).toEqual(["https://x.test/a", "https://x.test/b"]);
  });

  it("shows the path and query, not the whole url", () => {
    render(
      <Crawling
        host="x.test"
        progress={progress()}
        pages={[{ url: "https://x.test/docs?page=2" }]}
      />,
    );
    expect(screen.getByText("/docs?page=2")).toBeInTheDocument();
  });

  it("falls back to the raw string for an unparseable url", () => {
    render(<Crawling host="x.test" progress={progress()} pages={[{ url: "not a url" }]} />);
    expect(screen.getByText("not a url")).toBeInTheDocument();
  });

  it("renders no list at all before any page has landed", () => {
    render(<Crawling host="x.test" progress={progress()} pages={[]} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows a page's element count when the crawler reported one", () => {
    render(
      <Crawling
        host="x.test"
        progress={progress()}
        pages={[{ url: "https://x.test/a", elements: 1042 }]}
      />,
    );
    expect(screen.getByText("1,042")).toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("has no violations while crawling", async () => {
    const { container } = render(<Crawling host="picocss.com" progress={progress()} />);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("has no violations before the first progress arrives", async () => {
    const { container } = render(<Crawling host="x.test" progress={null} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
