import { faTableColumns, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState, type ReactNode } from "react";
import { Text } from "../components/Text/Text.js";
import { Foundation } from "../foundation/Foundation.js";
import type { AuditReport, ColourInventory, ReviewItem, SiteAudit } from "../lib/api.js";
import type { TypeInventory } from "../lib/typeScale.js";
import { Audit } from "../screens/Audit/Audit.js";
import { Checkpoint } from "../screens/Checkpoint/Checkpoint.js";
import { Configure } from "../screens/Configure/Configure.js";
import { Crawling } from "../screens/Crawling/Crawling.js";
import { ColourProposal } from "../screens/Proposals/ColourProposal.js";
import { ProposalsHub } from "../screens/Proposals/ProposalsHub.js";
import { TypeScaleProposal } from "../screens/Proposals/TypeScaleProposal.js";
import { Report } from "../screens/Report/Report.js";
import { Failed, Thinking } from "../screens/Status/Status.js";
import { ProductShell } from "../shell/ProductShell.js";
import styles from "./DevHarness.module.css";

interface HarnessState {
  id: string;
  label: string;
  render: (key: number) => ReactNode;
}

// ── Fixtures for the screens that normally receive live data ─────────────────
const MOCK_REVIEW: ReviewItem[] = [
  { id: "grey-cluster", summary: "Four near-identical greys, each used once on the pricing page." },
  { id: "blue-cta", summary: "Two blues within ΔE 3 split across the primary and secondary CTAs." },
];

const MOCK_REPORT: AuditReport = {
  healthScore: 72,
  summary:
    "The palette is mostly disciplined, but a cluster of greys and two accent blues show drift. Contrast passes AA across the board except for one muted caption style.",
  findings: [
    {
      severity: "high",
      area: "contrast",
      description: "Caption text (#9aa0a6 on #ffffff) fails WCAG AA at 3.1:1.",
      recommendation: "Darken captions to at least #6b7178 to reach 4.5:1.",
    },
    {
      severity: "medium",
      area: "colour",
      description: "Four greys within ΔE 4 are used interchangeably for borders.",
      recommendation: "Consolidate to a single neutral-200 border token.",
    },
    {
      severity: "low",
      area: "typography",
      description: "Two body sizes (15px and 16px) appear on the same page.",
      recommendation: "Pick one base size and map the other to a scale step.",
    },
  ],
  consolidationOpportunities: [
    "Merge the four border greys into one token.",
    "Unify the two CTA blues on a single primary.",
  ],
};

// A site with an ad-hoc type ramp (note 15px — off most scales) on base 16.
const MOCK_TYPE: TypeInventory = {
  baseSizePx: 16,
  primaryFamily: "Inter",
  sizes: [
    { px: 12, count: 40 },
    { px: 14, count: 120 },
    { px: 15, count: 22 },
    { px: 16, count: 380 },
    { px: 20, count: 64 },
    { px: 24, count: 30 },
    { px: 32, count: 12 },
    { px: 48, count: 5 },
  ],
};

// A palette with near-duplicate clusters to consolidate.
const MOCK_COLOUR: ColourInventory = {
  clusterCount: 4,
  distinctColours: 11,
  clusters: [
    { representative: "#1f2933", members: ["#1f2933", "#212a35", "#1d2630"], size: 3, totalUsage: 420, pages: ["/", "/about"] },
    { representative: "#ffffff", members: ["#ffffff", "#fefefe"], size: 2, totalUsage: 300, pages: ["/", "/about", "/pricing"] },
    { representative: "#6b7280", members: ["#6b7280", "#6d7280", "#697079", "#6b7178"], size: 4, totalUsage: 65, pages: ["/", "/pricing"] },
    { representative: "#3b82f6", members: ["#3b82f6", "#3a80f5"], size: 2, totalUsage: 88, pages: ["/"] },
  ],
};

// A messy site: many near-blacks, two blues, ad-hoc type + spacing.
const MOCK_SITE_AUDIT: SiteAudit = {
  rootUrl: "https://example.com",
  summary: {
    pages: 3,
    distinctColours: 10,
    colourFamilies: 2,
    colourNearDuplicates: 5,
    fontFamilies: 2,
    typeSizes: 6,
    fontWeights: 3,
    spacings: 11,
    radii: 4,
    shadows: 2,
    borders: 4,
    opacities: 5,
    zIndices: 6,
    blurs: 3,
    breakpoints: 4,
    gradients: 3,
    motions: 7,
  },
  colourFamilies: [
    {
      name: "Neutral",
      count: 900,
      swatches: [
        {
          hex: "#ffffff", count: 300, roles: { text: 0, background: 300, border: 0 },
          pages: ["/", "/about", "/pricing"], lightness: 100,
          elements: [
            { tag: "div", role: "background", count: 190 },
            { tag: "body", role: "background", count: 70 },
            { tag: "section", role: "background", count: 40 },
          ],
        },
        {
          hex: "#f5f5f5", count: 60, roles: { text: 0, background: 60, border: 0 }, pages: ["/"],
          lightness: 96, nearest: { hex: "#ffffff", deltaE: 2.7 },
        },
        { hex: "#6b7280", count: 80, roles: { text: 80, background: 0, border: 0 }, pages: ["/"], lightness: 47 },
        {
          hex: "#32302f", count: 200, roles: { text: 200, background: 0, border: 0 },
          pages: ["/", "/about"], lightness: 19, nearest: { hex: "#222222", deltaE: 3.1 },
          elements: [
            { tag: "div", role: "text", count: 120 },
            { tag: "p", role: "text", count: 40 },
            { tag: "a", role: "text", count: 25 },
            { tag: "div", role: "background", count: 15 },
          ],
        },
        {
          hex: "#222222", count: 140, roles: { text: 140, background: 0, border: 0 }, pages: ["/"],
          lightness: 13, nearest: { hex: "#1a1a1a", deltaE: 1.4 },
          related: [{ hex: "#1a1a1a", deltaE: 1.4, opacityVariant: false }],
        },
        {
          hex: "#1a1a1a", count: 120, roles: { text: 120, background: 0, border: 0 }, pages: ["/"],
          lightness: 10, nearest: { hex: "#111111", deltaE: 1.3 },
          related: [
            { hex: "#111111", deltaE: 1.3, opacityVariant: false },
            { hex: "#222222", deltaE: 1.4, opacityVariant: false },
          ],
        },
        {
          hex: "#111111", count: 100, roles: { text: 100, background: 0, border: 0 }, pages: ["/"],
          lightness: 7, nearest: { hex: "#1a1a1a", deltaE: 1.3 },
          related: [{ hex: "#1a1a1a", deltaE: 1.3, opacityVariant: false }],
        },
      ],
    },
    {
      name: "Blue",
      count: 114,
      swatches: [
        {
          hex: "#3b82f6", count: 60, roles: { text: 20, background: 40, border: 0 }, pages: ["/"],
          lightness: 60, nearest: { hex: "#2563eb", deltaE: 8.4 },
          related: [{ hex: "#3b82f680", deltaE: 0, opacityVariant: true }],
          elements: [
            { tag: "button", role: "background", count: 24 },
            { tag: "a", role: "text", count: 20 },
            { tag: "a", role: "background", count: 10 },
            { tag: "div", role: "border", count: 6 },
          ],
        },
        {
          hex: "#2563eb", count: 36, roles: { text: 36, background: 0, border: 0 }, pages: ["/"],
          lightness: 53, nearest: { hex: "#3b82f6", deltaE: 8.4 },
        },
        {
          hex: "#3b82f680", count: 18, roles: { text: 0, background: 18, border: 0 }, pages: ["/"],
          lightness: 60, nearest: { hex: "#3b82f6", deltaE: 0 },
          related: [{ hex: "#3b82f6", deltaE: 0, opacityVariant: true }],
          elements: [{ tag: "div", role: "background", count: 18 }],
        },
      ],
    },
  ],
  typography: {
    families: [
      { family: "Inter", count: 820 },
      { family: "Georgia", count: 40 },
    ],
    roles: [
      { tag: "h1", px: 40, weight: 700, count: 3 },
      { tag: "h2", px: 28, weight: 600, count: 9 },
      { tag: "h3", px: 22, weight: 600, count: 14 },
      { tag: "p", px: 16, weight: 400, count: 220 },
      { tag: "a", px: 16, weight: 500, count: 60 },
      { tag: "small", px: 13, weight: 400, count: 18 },
    ],
    sizes: [
      { px: 13, count: 18, weights: [400], tags: [{ tag: "small", count: 18 }] },
      { px: 15, count: 22, weights: [400], tags: [{ tag: "div", count: 22 }] },
      { px: 16, count: 280, weights: [400, 500], tags: [{ tag: "p", count: 220 }, { tag: "a", count: 60 }] },
      { px: 22, count: 14, weights: [600], tags: [{ tag: "h3", count: 14 }] },
      { px: 28, count: 9, weights: [600], tags: [{ tag: "h2", count: 9 }] },
      { px: 40, count: 3, weights: [700], tags: [{ tag: "h1", count: 3 }] },
    ],
    weights: [400, 500, 700],
    lineHeights: [1.2, 1.4, 1.5, 1.6],
    letterSpacings: [],
  },
  spacing: [
    { value: 4, count: 40, properties: [{ property: "padding", count: 30 }, { property: "gap", count: 10 }], tags: [{ tag: "div", count: 28 }, { tag: "li", count: 12 }] },
    { value: 6, count: 12, properties: [{ property: "margin", count: 12 }], tags: [{ tag: "p", count: 12 }] },
    { value: 8, count: 80, properties: [{ property: "padding", count: 60 }, { property: "margin", count: 20 }], tags: [{ tag: "div", count: 50 }, { tag: "section", count: 30 }] },
    { value: 10, count: 9, properties: [{ property: "padding", count: 9 }], tags: [{ tag: "span", count: 9 }] },
    { value: 12, count: 50, properties: [{ property: "padding", count: 30 }, { property: "gap", count: 20 }], tags: [{ tag: "div", count: 30 }, { tag: "ul", count: 20 }] },
    { value: 14, count: 6, properties: [{ property: "margin", count: 6 }], tags: [{ tag: "h2", count: 6 }] },
    { value: 16, count: 120, properties: [{ property: "padding", count: 90 }, { property: "margin", count: 30 }], tags: [{ tag: "div", count: 70 }, { tag: "article", count: 50 }] },
    { value: 20, count: 18, properties: [{ property: "gap", count: 18 }], tags: [{ tag: "div", count: 18 }] },
    { value: 24, count: 60, properties: [{ property: "padding", count: 40 }, { property: "margin", count: 20 }], tags: [{ tag: "section", count: 40 }, { tag: "div", count: 20 }] },
    { value: 32, count: 30, properties: [{ property: "padding", count: 30 }], tags: [{ tag: "main", count: 30 }] },
    { value: 40, count: 8, properties: [{ property: "margin", count: 8 }], tags: [{ tag: "header", count: 8 }] },
    { value: 200, count: 4, properties: [{ property: "margin", count: 4 }], tags: [{ tag: "section", count: 4 }] },
    { value: 1004, count: 2, properties: [{ property: "margin", count: 2 }], tags: [{ tag: "div", count: 2 }] },
  ],
  radius: [
    { value: 4, count: 60, tags: [{ tag: "button", count: 40 }, { tag: "input", count: 20 }] },
    { value: 5, count: 12, tags: [{ tag: "div", count: 12 }] },
    { value: 8, count: 40, tags: [{ tag: "div", count: 30 }, { tag: "img", count: 10 }] },
    { value: 12, count: 8, tags: [{ tag: "section", count: 8 }] },
  ],
  shadow: [
    { value: "0 1px 2px rgba(0,0,0,0.08)", count: 30, tags: [{ tag: "div", count: 20 }, { tag: "button", count: 10 }] },
    { value: "0 4px 12px rgba(0,0,0,0.12)", count: 10, tags: [{ tag: "div", count: 10 }] },
  ],
  borders: [
    { value: 1, count: 180, sides: [{ side: "bottom", count: 120 }, { side: "top", count: 60 }], tags: [{ tag: "div", count: 140 }, { tag: "li", count: 40 }] },
    { value: 1.5, count: 12, sides: [{ side: "left", count: 12 }], tags: [{ tag: "blockquote", count: 12 }] },
    { value: 3, count: 24, sides: [{ side: "bottom", count: 20 }, { side: "left", count: 4 }], tags: [{ tag: "button", count: 24 }] },
    { value: 4, count: 6, sides: [{ side: "left", count: 6 }], tags: [{ tag: "aside", count: 6 }] },
  ],
  opacity: [
    { value: 0.9, count: 14, tags: [{ tag: "img", count: 14 }] },
    { value: 0.6, count: 30, tags: [{ tag: "div", count: 20 }, { tag: "span", count: 10 }] },
    { value: 0.5, count: 22, tags: [{ tag: "button", count: 22 }] },
    { value: 0.08, count: 40, tags: [{ tag: "div", count: 40 }] },
  ],
  zIndex: [
    { value: 1, count: 40, tags: [{ tag: "div", count: 40 }] },
    { value: 10, count: 18, tags: [{ tag: "header", count: 18 }] },
    { value: 50, count: 9, tags: [{ tag: "nav", count: 9 }] },
    { value: 100, count: 6, tags: [{ tag: "div", count: 6 }] },
    { value: 999, count: 12, tags: [{ tag: "div", count: 12 }] },
    { value: 9999, count: 3, tags: [{ tag: "div", count: 3 }] },
  ],
  blur: [
    { value: 4, count: 8, tags: [{ tag: "div", count: 8 }] },
    { value: 12, count: 20, tags: [{ tag: "header", count: 14 }, { tag: "div", count: 6 }] },
    { value: 40, count: 4, tags: [{ tag: "aside", count: 4 }] },
  ],
  breakpoints: [
    { value: 480, count: 6 }, { value: 768, count: 14 },
    { value: 1024, count: 18 }, { value: 1280, count: 9 },
  ],
  gradients: [
    { value: "linear-gradient(180deg, #3b82f6, #2563eb)", count: 12, tags: [{ tag: "button", count: 12 }] },
    { value: "linear-gradient(135deg, #6b7280, #111111)", count: 5, tags: [{ tag: "section", count: 5 }] },
    { value: "radial-gradient(circle at 30% 0%, #f5f5f5, #ffffff)", count: 8, tags: [{ tag: "div", count: 8 }] },
  ],
  motion: {
    durations: [
      { value: 100, count: 60, tags: [{ tag: "a", count: 40 }, { tag: "button", count: 20 }] },
      { value: 200, count: 120, tags: [{ tag: "div", count: 80 }, { tag: "a", count: 40 }] },
      { value: 300, count: 40, tags: [{ tag: "button", count: 40 }] },
      { value: 500, count: 8, tags: [{ tag: "div", count: 8 }] },
    ],
    easings: [
      { value: "cubic-bezier(0.4, 0, 0.2, 1)", count: 140, tags: [{ tag: "div", count: 100 }, { tag: "a", count: 40 }] },
      { value: "ease-in-out", count: 30, tags: [{ tag: "button", count: 30 }] },
      { value: "cubic-bezier(0.34, 1.56, 0.64, 1)", count: 6, tags: [{ tag: "div", count: 6 }] },
    ],
  },
};

const STATES: HarnessState[] = [
  { id: "configure", label: "Configure", render: (key) => <Configure key={key} /> },
  {
    id: "audit",
    label: "Audit",
    render: () => <Audit audit={MOCK_SITE_AUDIT} onProposals={() => {}} />,
  },
  {
    id: "proposals",
    label: "Proposals · Hub",
    render: () => <ProposalsHub onSelect={() => {}} />,
  },
  {
    id: "type-scale",
    label: "Proposal · Type",
    render: (key) => <TypeScaleProposal key={key} inventory={MOCK_TYPE} />,
  },
  {
    id: "colour",
    label: "Proposal · Colour",
    render: (key) => <ColourProposal key={key} inventory={MOCK_COLOUR} />,
  },
  {
    id: "crawling",
    label: "Crawling",
    render: () => (
      <Crawling
        host="example.com"
        progress={{ pagesCrawled: 2, maxPages: 5, lastUrl: "https://example.com/pricing" }}
      />
    ),
  },
  {
    id: "auditing",
    label: "Auditing",
    render: () => (
      <Thinking
        title="Auditing the design system"
        detail="Clustering colours, checking contrast, and classifying what it finds."
      />
    ),
  },
  {
    id: "checkpoint",
    label: "Checkpoint",
    render: (key) => (
      <Checkpoint
        key={key}
        question="Are these near-identical colours intentional variants or accidental drift?"
        items={MOCK_REVIEW}
        submitting={false}
        onResolve={(j) => console.log("judgments", j)}
      />
    ),
  },
  {
    id: "report",
    label: "Report",
    render: () => (
      <Report report={MOCK_REPORT} rootUrl="https://example.com" onRestart={() => {}} />
    ),
  },
  {
    id: "error",
    label: "Error",
    render: () => <Failed message="We couldn’t read that site. Check the URL and try again." onRetry={() => {}} />,
  },
  { id: "foundation", label: "Foundation", render: () => <Foundation /> },
];

/**
 * Internal harness — a dev-only drawer for viewing each state in isolation,
 * opened from the top bar. Not mounted in production; the product is just the
 * ProductShell + the active flow.
 */
/** Deep-link support: `?harness=type-scale` opens that state directly. */
function initialStateId(): string {
  if (typeof window === "undefined") return STATES[0]!.id;
  const want = new URLSearchParams(window.location.search).get("harness");
  return STATES.some((s) => s.id === want) ? want! : STATES[0]!.id;
}

export function DevHarness() {
  const [activeId, setActiveId] = useState(initialStateId);
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const current = STATES.find((s) => s.id === activeId) ?? STATES[0]!;

  const opener = (
    <button
      type="button"
      className={styles.opener}
      onClick={() => setOpen(true)}
      aria-label="Open states harness"
      aria-expanded={open}
    >
      <FontAwesomeIcon icon={faTableColumns} />
    </button>
  );

  return (
    <>
      <ProductShell onHome={() => setResetKey((k) => k + 1)} trailing={opener}>
        {current.render(resetKey)}
      </ProductShell>

      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        className={open ? `${styles.drawer} ${styles.drawerOpen}` : styles.drawer}
        aria-hidden={!open}
      >
        <div className={styles.head}>
          <Text role="label-xs" className={styles.title}>
            Internal harness
          </Text>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <Text role="label-xs" as="p" className={styles.group}>
          States
        </Text>
        <ul className={styles.list}>
          {STATES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={s.id === activeId ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                aria-current={s.id === activeId}
                onClick={() => {
                  setActiveId(s.id);
                  setOpen(false);
                }}
              >
                <Text role="label">{s.label}</Text>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
