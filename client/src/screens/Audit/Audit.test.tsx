import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Audit } from "./Audit";
import auditFixture from "../../demo/audit.json";
import type { SiteAudit } from "../../lib/api.js";

/**
 * Driven by the committed demo fixture: a real picocss.com audit, not a
 * hand-written stub. Anything asserted here is therefore true of output the
 * analysis actually produced, and a change to the payload shape shows up as a
 * failure rather than as a screen that quietly renders nothing.
 */
const audit = auditFixture as unknown as SiteAudit;

const tablist = () => screen.getByRole("tablist", { name: "Audit sections" });
const tabs = () => within(tablist()).getAllByRole("tab");
const tabNamed = (name: string | RegExp) => within(tablist()).getByRole("tab", { name });
const selectedTab = () => tabs().find((t) => t.getAttribute("aria-selected") === "true");

beforeEach(() => {
  // jsdom implements neither, and the export path uses both.
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:stub"),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("header", () => {
  it("titles the report with the audited host", () => {
    render(<Audit audit={audit} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("picocss.com");
  });

  it("says how many pages the numbers cover", () => {
    render(<Audit audit={audit} />);
    expect(screen.getByText(/Everything in use across 2 pages, exactly as shipped\./)).toBeInTheDocument();
  });

  it("offers a way back only when there is somewhere to go", async () => {
    const onBack = vi.fn();
    const { rerender } = render(<Audit audit={audit} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /New audit/ }));
    expect(onBack).toHaveBeenCalledOnce();

    rerender(<Audit audit={audit} />);
    expect(screen.queryByRole("button", { name: /New audit/ })).not.toBeInTheDocument();
  });
});

describe("tabs", () => {
  it("opens on the overview", () => {
    render(<Audit audit={audit} />);
    expect(selectedTab()).toHaveAccessibleName(/Overview/);
  });

  it("offers a tab per category the site actually uses", () => {
    render(<Audit audit={audit} />);
    // picocss.com exercises every optional category, so all thirteen appear.
    expect(tabs().map((t) => t.textContent?.replace(/\d+$/, "").trim())).toEqual([
      "Overview",
      "Colour",
      "Contrast",
      "Type",
      "Spacing",
      "Radius",
      "Shadow",
      "Border",
      "Opacity",
      "Z-index",
      "Blur",
      "Breakpoints",
      "Gradient",
      "Motion",
    ]);
  });

  it("hides a category the site does not use", () => {
    // A site with no shadows should not get an empty Shadow tab.
    const noShadows = { ...audit, shadow: [] } as SiteAudit;
    render(<Audit audit={noShadows} />);
    expect(within(tablist()).queryByRole("tab", { name: /Shadow/ })).not.toBeInTheDocument();
  });

  it("counts each tab off the summary, not off a hand-kept number", () => {
    render(<Audit audit={audit} />);
    expect(tabNamed(/Colour/)).toHaveTextContent(String(audit.summary.distinctColours));
    expect(tabNamed(/Type/)).toHaveTextContent(String(audit.summary.typeSizes));
    expect(tabNamed(/Spacing/)).toHaveTextContent(String(audit.summary.spacings));
  });

  it("switches panel and selection on click", async () => {
    render(<Audit audit={audit} />);
    await userEvent.click(tabNamed(/Colour/));

    expect(selectedTab()).toHaveAccessibleName(/Colour/);
    expect(tabNamed(/Overview/)).toHaveAttribute("aria-selected", "false");
  });

  it("keeps exactly one tab selected", async () => {
    render(<Audit audit={audit} />);
    for (const name of [/Type/, /Spacing/, /Motion/, /Overview/]) {
      await userEvent.click(tabNamed(name));
      expect(tabs().filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    }
  });
});

describe("the overview diagnosis", () => {
  it("states the drift in prose, with real counts", () => {
    render(<Audit audit={audit} />);
    // The fixture has 1 of 28 failing pairs and 4 of 31 near-duplicate colours.
    expect(
      screen.getByText(/1 of 28 text\/background pairs fail WCAG AA/),
    ).toBeInTheDocument();
    expect(screen.getByText(/4 of 31 colours are near-duplicates/)).toBeInTheDocument();
  });

  it("sends a verdict card to its own tab", async () => {
    render(<Audit audit={audit} />);
    // The overview cards are the entry point to each category; a card that
    // does not navigate is a dead end.
    const card = screen.getAllByRole("button", { name: /Colours/ })[0]!;
    await userEvent.click(card);

    expect(selectedTab()).toHaveAccessibleName(/Colour/);
  });
});

describe("export", () => {
  /** Capture the anchor the export path builds, without navigating jsdom. */
  function captureDownload() {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    return {
      click,
      anchor: () => click.mock.instances[0] as HTMLAnchorElement | undefined,
    };
  }

  it("downloads a json file named for the host and the day", async () => {
    const { anchor } = captureDownload();
    render(<Audit audit={audit} />);

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(anchor()?.download).toMatch(/^drift-audit-picocss\.com-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("leads the payload with the diagnosis, not with raw counts", async () => {
    captureDownload();
    let captured: unknown;
    vi.mocked(URL.createObjectURL).mockImplementation((blob: Blob | MediaSource) => {
      captured = blob;
      return "blob:stub";
    });

    render(<Audit audit={audit} />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    const text = await (captured as Blob).text();
    const payload = JSON.parse(text) as Record<string, unknown>;
    // The export's audience is machines: a CI check, a diff, a model reading it.
    // Leading with health and findings means the consumer does not have to
    // re-derive the judgement drift already made.
    const keys = Object.keys(payload);
    // An envelope first ($schema, tool, version, site, generatedAt), then the
    // judgement, and only then the raw material.
    expect(keys.slice(5, 9)).toEqual(["health", "findings", "verdicts", "rules"]);
    expect(keys.indexOf("health")).toBeLessThan(keys.indexOf("summary"));
    expect(keys.indexOf("rules")).toBeLessThan(keys.indexOf("inventory"));
  });

  it("states what the numbers were measured against", async () => {
    captureDownload();
    let captured: unknown;
    vi.mocked(URL.createObjectURL).mockImplementation((blob: Blob | MediaSource) => {
      captured = blob;
      return "blob:stub";
    });

    render(<Audit audit={audit} />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    const payload = JSON.parse(await (captured as Blob).text()) as {
      rules: { colour: { indistinguishableDeltaE: number; metric: string } };
    };
    // Anchoring the numbers to their reference is what makes the export
    // assertable in CI rather than just a dump.
    expect(payload.rules.colour).toMatchObject({
      indistinguishableDeltaE: 2,
      metric: "CIEDE2000",
    });
  });

  /**
   * Both the type scale and the spacing grid are selectable so a reader can test
   * a hypothesis, and the diagnosis is pinned to the automatic fit so exploring
   * one never rewrites it. The export has to hold the same line: its counts come
   * from the server's summary, so evidence taken from the live selection ships a
   * finding that contradicts its own count.
   */
  it("exports the evidence the diagnosis was made from, not the reader's hypothesis", async () => {
    captureDownload();
    let captured: unknown;
    vi.mocked(URL.createObjectURL).mockImplementation((blob: Blob | MediaSource) => {
      captured = blob;
      return "blob:stub";
    });

    render(<Audit audit={audit} />);
    await userEvent.click(tabNamed(/Spacing/));
    // The fixture detects a 4px grid. Ask for 8px — a strictly harsher reference
    // that more values miss — then export.
    await userEvent.click(screen.getByRole("tab", { name: /8px grid/ }));
    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    const payload = JSON.parse(await (captured as Blob).text()) as {
      findings: { id: string; count: number; evidence: { px: number }[] }[];
    };
    const finding = payload.findings.find((f) => f.id === "spacing-off-grid")!;

    // The count comes from the summary and is measured against 4px. Evidence
    // measured against 8px would list more values than the count claims.
    expect(finding.evidence).toHaveLength(finding.count);
    expect(finding.evidence.map((e) => e.px)).not.toContain(20);
  });

  it("records a failing-contrast finding when there is one", async () => {
    captureDownload();
    let captured: unknown;
    vi.mocked(URL.createObjectURL).mockImplementation((blob: Blob | MediaSource) => {
      captured = blob;
      return "blob:stub";
    });

    render(<Audit audit={audit} />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    const payload = JSON.parse(await (captured as Blob).text()) as {
      findings: { id: string; severity: string }[];
    };
    const contrast = payload.findings.find((f) => f.id === "contrast-fails-aa");
    expect(contrast).toBeDefined();
    expect(contrast!.severity).toBe("review");
  });
});

describe("the colour detail rail", () => {
  it("opens on a swatch and closes again", async () => {
    render(<Audit audit={audit} />);
    await userEvent.click(tabNamed(/Colour/));

    expect(screen.queryByRole("button", { name: "Close detail" })).not.toBeInTheDocument();

    const swatches = screen
      .getAllByRole("button")
      .filter((b) => b.id.startsWith("swatch-"));
    expect(swatches.length).toBeGreaterThan(0);
    await userEvent.click(swatches[0]!);

    const close = screen.getByRole("button", { name: "Close detail" });
    await userEvent.click(close);
    expect(screen.queryByRole("button", { name: "Close detail" })).not.toBeInTheDocument();
  });
});

describe("resilience to a thinner payload", () => {
  it("renders a summary with every optional count missing", () => {
    // The optional fields are the newer analyses; an older server omits them.
    // The required ones (pages, distinctColours, fontFamilies, …) are part of
    // the contract and are covered by the contract test on the service side.
    const thin = {
      rootUrl: "https://x.test",
      summary: {
        pages: 1,
        distinctColours: 3,
        colourFamilies: 1,
        colourNearDuplicates: 0,
        fontFamilies: 1,
        typeSizes: 2,
        fontWeights: 1,
        spacings: 2,
        radii: 0,
        shadows: 0,
      },
      typography: { families: [], roles: [], sizes: [], weights: [], lineHeights: [], letterSpacings: [] },
      colourFamilies: [],
      spacing: [],
      radius: [],
      shadow: [],
    } as unknown as SiteAudit;

    render(<Audit audit={thin} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("x.test");
    expect(screen.queryAllByText(/NaN/)).toHaveLength(0);
    expect(screen.queryAllByText(/undefined/)).toHaveLength(0);
    // With no drift signal at all, the diagnosis says so rather than blanking.
    expect(screen.getByText(/Nothing's drifting/)).toBeInTheDocument();
  });
});
