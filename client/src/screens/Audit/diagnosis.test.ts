import { describe, expect, it } from "vitest";

import auditFixture from "../../demo/audit.json";
import type { SiteAudit } from "../../lib/api.js";
import { buildExport, buildVerdicts, offScaleSet, typeBasePxOf } from "./diagnosis.js";

const audit = auditFixture as unknown as SiteAudit;

describe("diagnosis", () => {
  it("builds the verdicts the overview shows for the demo capture", () => {
    const byLabel = Object.fromEntries(buildVerdicts(audit).map((v) => [v.label, v]));
    expect(byLabel.Colours).toMatchObject({ n: 29, verdict: "review" });
    expect(byLabel.Contrast).toMatchObject({ n: 21, verdict: "good", chips: ["all pairs pass AA"] });
    expect(byLabel.Type).toMatchObject({ n: 9, verdict: "review" });
    expect(byLabel.Spacing).toMatchObject({ n: 21, verdict: "review", chips: ["14 off a 4px grid"] });
    expect(byLabel.Radius?.verdict).toBe("good");
  });

  // The export's evidence has to agree with the summary's counts, which the
  // server computed against the automatic fit and the 4px grid.
  it("exports evidence that agrees with the summary counts", () => {
    const out = buildExport(audit, new Date("2026-09-26T00:00:00Z"));
    const find = (id: string) =>
      (out.findings as { id: string; count: number; evidence: unknown[] }[]).find((f) => f.id === id);
    expect(find("type-off-scale")?.evidence).toHaveLength(audit.summary.typeOffScale!);
    expect(find("spacing-off-grid")?.evidence).toHaveLength(audit.summary.spacingOffGrid!);
    expect(find("contrast-fails-aa")).toBeUndefined();
    expect(out.generatedAt).toBe("2026-09-26T00:00:00.000Z");
  });

  it("takes the most used size as the scale base, and 16px with none", () => {
    expect(typeBasePxOf([])).toBe(16);
    expect(typeBasePxOf([{ px: 14, count: 2 } as never, { px: 18, count: 9 } as never])).toBe(18);
    expect(offScaleSet([{ px: 16, count: 1 } as never], 16, 1.25).size).toBe(0);
  });
});
