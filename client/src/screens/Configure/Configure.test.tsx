import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Configure } from "./Configure";
import { discoverPages } from "../../lib/api.js";

vi.mock("../../lib/api.js", () => ({ discoverPages: vi.fn() }));

const discover = vi.mocked(discoverPages);

const page = (path: string, title = path) => ({
  url: `https://x.test${path}`,
  path,
  title,
});

/** `count` discovered pages: "/", "/p1", "/p2" … */
const discovery = (count: number) => ({
  host: "x.test",
  rootUrl: "https://x.test",
  pages: [
    page("/", "Home"),
    ...Array.from({ length: count - 1 }, (_, i) => page(`/p${i + 1}`, `Page ${i + 1}`)),
  ],
});

/** Type a URL, submit, and land on the page picker. */
async function reachPicker(count = 3) {
  discover.mockResolvedValue(discovery(count) as never);
  const onSubmit = vi.fn();
  render(<Configure onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText("URL"), "x.test");
  await userEvent.click(screen.getByRole("button", { name: "Find pages" }));
  await screen.findByRole("group", { name: "Pages to audit" });
  return onSubmit;
}

const rows = () => within(screen.getByRole("group", { name: "Pages to audit" })).getAllByRole("button");

beforeEach(() => {
  discover.mockResolvedValue(discovery(3) as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the url step", () => {
  it("cannot be submitted empty", () => {
    render(<Configure />);
    expect(screen.getByRole("button", { name: "Find pages" })).toBeDisabled();
  });

  it("discovers the typed site", async () => {
    render(<Configure />);
    await userEvent.type(screen.getByLabelText("URL"), "x.test");
    await userEvent.click(screen.getByRole("button", { name: "Find pages" }));

    await waitFor(() => expect(discover).toHaveBeenCalledWith("x.test"));
  });

  it("shows the server's message and stays put when discovery fails", async () => {
    discover.mockRejectedValue(new Error("That host did not resolve."));
    render(<Configure />);
    await userEvent.type(screen.getByLabelText("URL"), "nope.test");
    await userEvent.click(screen.getByRole("button", { name: "Find pages" }));

    expect(await screen.findByText("That host did not resolve.")).toBeInTheDocument();
    // Back on the url step, with the typed value intact, so it can be corrected.
    expect(screen.getByLabelText("URL")).toHaveValue("nope.test");
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    discover.mockRejectedValue("boom");
    render(<Configure />);
    await userEvent.type(screen.getByLabelText("URL"), "x.test");
    await userEvent.click(screen.getByRole("button", { name: "Find pages" }));

    expect(await screen.findByText("Could not reach the site.")).toBeInTheDocument();
  });
});

describe("selecting pages", () => {
  it("preselects the homepage, as the most representative page", async () => {
    await reachPicker(3);
    expect(rows()[0]).toHaveAttribute("aria-pressed", "true");
    expect(rows()[1]).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
  });

  it("toggles a page on and back off", async () => {
    await reachPicker(3);

    await userEvent.click(rows()[1]!);
    expect(rows()[1]).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(rows()[1]!);
    expect(rows()[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("selects all, capped at the crawl ceiling", async () => {
    await reachPicker(14);
    await userEvent.click(screen.getByRole("button", { name: /Select all/ }));

    // The backend visits at most 10 pages, so the button says so rather than
    // selecting 14 and silently dropping four.
    expect(screen.getByText(/10 selected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all (first 10)" })).toBeInTheDocument();
  });

  it("does not advertise a cap when the site is under it", async () => {
    await reachPicker(4);
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();
  });

  it("clears the selection and disables the run button", async () => {
    await reachPicker(3);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run audit/ })).toBeDisabled();
  });

  it("refuses an eleventh page and disables the unselected rows", async () => {
    await reachPicker(14);
    await userEvent.click(screen.getByRole("button", { name: /Select all/ }));
    await userEvent.click(screen.getByRole("button", { name: /Show \d+ more/ }));

    const unselected = rows().filter((r) => r.getAttribute("aria-pressed") === "false");
    expect(unselected[0]).toBeDisabled();
    expect(screen.getByText(/10 max/)).toBeInTheDocument();
  });

  it("pluralises the run button", async () => {
    await reachPicker(3);
    expect(screen.getByRole("button", { name: "Run audit · 1 page" })).toBeInTheDocument();

    await userEvent.click(rows()[1]!);
    expect(screen.getByRole("button", { name: "Run audit · 2 pages" })).toBeInTheDocument();
  });

  it("submits the resolved url and the chosen page urls, not their paths", async () => {
    const onSubmit = await reachPicker(3);
    await userEvent.click(rows()[1]!);
    await userEvent.click(screen.getByRole("button", { name: /Run audit/ }));

    expect(onSubmit).toHaveBeenCalledWith("https://x.test", [
      "https://x.test/",
      "https://x.test/p1",
    ]);
  });
});

describe("finding a page in a long list", () => {
  it("caps the list and offers the rest", async () => {
    await reachPicker(14);
    expect(rows()).toHaveLength(10);

    await userEvent.click(screen.getByRole("button", { name: "Show 4 more" }));
    expect(rows()).toHaveLength(14);
  });

  it("offers no search box for a short list", async () => {
    await reachPicker(4);
    expect(screen.queryByLabelText("Search pages")).not.toBeInTheDocument();
  });

  it("filters on title and path, showing every match", async () => {
    await reachPicker(14);
    await userEvent.type(screen.getByLabelText("Search pages"), "p12");

    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]!).getByText("/p12")).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    await reachPicker(14);
    await userEvent.type(screen.getByLabelText("Search pages"), "zzz");

    expect(screen.getByText(/No pages match/)).toBeInTheDocument();
  });
});

describe("adding a page discovery missed", () => {
  const addField = () => screen.getByLabelText("Add a page by path");

  it("adds a path and selects it", async () => {
    await reachPicker(3);
    await userEvent.type(addField(), "/pricing{Enter}");

    // An added page has no title, so the component shows its path as both.
    expect(screen.getAllByText("/pricing").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 selected/)).toBeInTheDocument();
  });

  it("accepts a bare slug and normalises it to a path", async () => {
    await reachPicker(3);
    await userEvent.type(addField(), "pricing{Enter}");

    expect(screen.getAllByText("/pricing").length).toBeGreaterThan(0);
  });

  it("rejects a full url, because the origin is already fixed", async () => {
    await reachPicker(3);
    await userEvent.type(addField(), "https://other.test/about{Enter}");

    expect(
      screen.getByText("Enter just the path, like /pricing, without the origin."),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
  });

  it("rejects a bare domain, which would otherwise read as a path segment", async () => {
    await reachPicker(3);
    await userEvent.type(addField(), "example.com/about{Enter}");

    expect(
      screen.getByText("Enter just the path, like /pricing, without the origin."),
    ).toBeInTheDocument();
  });

  it("rejects a protocol-relative url", async () => {
    await reachPicker(3);
    await userEvent.type(addField(), "//example.com/about{Enter}");

    expect(
      screen.getByText("Enter just the path, like /pricing, without the origin."),
    ).toBeInTheDocument();
  });

  it("ignores an empty submission", async () => {
    await reachPicker(3);
    await userEvent.type(addField(), "   {Enter}");

    expect(screen.queryByText(/Enter just the path/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
  });

  it("selects an already-listed page rather than duplicating it", async () => {
    await reachPicker(3);
    const before = rows().length;

    await userEvent.type(addField(), "/p1{Enter}");

    expect(rows()).toHaveLength(before);
    expect(screen.getByText(/2 selected/)).toBeInTheDocument();
  });

  it("closes off adding once the ceiling is reached", async () => {
    await reachPicker(14);
    await userEvent.click(screen.getByRole("button", { name: /Select all/ }));

    await userEvent.type(addField(), "/late{Enter}");

    // At the limit the Add control is disabled, which also blocks the form's
    // implicit submission on Enter. The page is not added at all: you have to
    // free a slot first. addPage() still carries its own ceiling guard, so the
    // rule holds even if the button is ever re-enabled.
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.queryByText("/late")).not.toBeInTheDocument();
    expect(screen.getByText(/10 selected/)).toBeInTheDocument();
  });
});

/**
 * Demo mode.
 *
 * `startCrawl` discards the page list when DEMO_MODE is on, because there is no
 * crawler behind it: the build replays one captured audit whole. The picker has
 * to say so. A control that accepts input and changes nothing is the failure
 * this repo exists to report on other people's sites.
 *
 * Its own module rather than a describe block, because DEMO_MODE is read at
 * module load and the mock has to be in place before Configure is imported.
 */
describe("demo mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("../../demo/index.js", () => ({
      DEMO_MODE: true,
      DEMO_SITE: "picocss.com",
      DEMO_CAPTURED: "August 2026",
    }));
  });

  afterEach(() => {
    vi.doUnmock("../../demo/index.js");
    vi.resetModules();
  });

  /** Re-imports Configure so the mocked DEMO_MODE is the one it read. */
  async function reachDemoPicker(count = 3) {
    const { Configure: Demo } = await import("./Configure");
    discover.mockResolvedValue(discovery(count) as never);
    render(<Demo onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("URL"), "x.test");
    await userEvent.click(screen.getByRole("button", { name: "Find pages" }));
    await screen.findByRole("group", { name: "Pages to audit" });
  }

  it("selects every discovered page, not just the homepage", async () => {
    await reachDemoPicker(3);
    // Outside demo mode this would be "1 selected": the homepage alone.
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();
  });

  it("cannot be deselected, because the audit already ran", async () => {
    await reachDemoPicker(3);
    for (const row of rows()) expect(row).toBeDisabled();

    await userEvent.click(rows()[1]!, { pointerEventsCheck: 0 });
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Select all/ })).toBeDisabled();
  });

  it("says why the picker is fixed", async () => {
    await reachDemoPicker(3);
    expect(screen.getByText(/nothing left to choose/i)).toBeInTheDocument();
  });
});
