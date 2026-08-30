/**
 * The scalar token tabs: radius, shadow, gradient, border, contrast, opacity,
 * z-index, blur, breakpoints and motion.
 *
 * Each is the same shape — an inventory table of one token type, with a
 * specimen, the value, its element tags and a usage count — so they are grouped
 * rather than given a file each. Every one takes only its own slice of the
 * audit and derives whatever it needs from that, which is what lets them sit
 * outside the screen component: none of them reads or writes screen state.
 *
 * The four tabs that hand-rolled their own chip markup now use `TagsCell` like
 * the rest, so the overflow cap applies everywhere instead of in six tables out
 * of ten.
 */

import type { SiteAudit } from "../../../lib/api.js";
import {
  BORDER_NEAR_DUPLICATE_PX,
  RADIUS_NEAR_DUPLICATE_PX,
  deviceClass,
  nearDuplicates,
  zIndexRanks,
  type DisplayUnit,
} from "../auditModel.js";
import { Badge } from "../../../components/Badge/Badge.js";
import { LengthValue, Table, TagsCell, ZIndexLadder } from "../parts/tables.js";
import styles from "./scalar.module.css";
import shared from "../shared.module.css";

export function RadiusSection({ radius, unit }: { radius: SiteAudit["radius"]; unit: DisplayUnit }) {
  const nearDup = nearDuplicates(radius.map((r) => r.value), RADIUS_NEAR_DUPLICATE_PX);
  return (
    <Table head={["Preview", "Value", "Tags", "Uses"]}>
      {radius.map((v) => (
        <tr key={v.value}>
          <td className={styles.chipPreviewCell}>
            <span className={styles.radiusChip} style={{ borderRadius: `${v.value}px` }} />
          </td>
          <td className={shared.valueCell}>
            <LengthValue px={v.value} unit={unit}>
              {nearDup.has(v.value) && (
                <span className={shared.offScaleDot} title="Near-duplicate of another radius" />
              )}
            </LengthValue>
          </td>
          <TagsCell tags={v.tags} />
          <td className={shared.usageCell}>{v.count.toLocaleString()}×</td>
        </tr>
      ))}
    </Table>
  );
}

export function ShadowSection({ shadow }: { shadow: SiteAudit["shadow"] }) {
  return (
    <Table head={["Preview", "Value", "Tags", "Uses"]}>
      {shadow.map((sh, i) => (
        <tr key={i}>
          <td className={styles.chipPreviewCell}>
            <span className={styles.shadowChip} style={{ boxShadow: sh.value }} />
          </td>
          <td className={`${shared.valueCell} ${shared.valueCellWrap}`} title={sh.value}>
            {sh.value}
          </td>
          <TagsCell tags={sh.tags} />
          <td className={shared.usageCell}>{sh.count.toLocaleString()}×</td>
        </tr>
      ))}
    </Table>
  );
}

export function GradientSection({ gradients }: { gradients: NonNullable<SiteAudit["gradients"]> }) {
  return (
    <Table head={["Preview", "Value", "Tags", "Uses"]}>
      {gradients.map((g, i) => (
        <tr key={i}>
          <td className={styles.chipPreviewCell}>
            <span className={styles.gradientSwatch} style={{ backgroundImage: g.value }} />
          </td>
          <td className={`${shared.valueCell} ${shared.valueCellWrap}`} title={g.value}>
            {g.value}
          </td>
          <TagsCell tags={g.tags} />
          <td className={shared.usageCell}>{g.count.toLocaleString()}×</td>
        </tr>
      ))}
    </Table>
  );
}

export function BorderSection({
  borders,
  unit,
}: {
  borders: NonNullable<SiteAudit["borders"]>;
  unit: DisplayUnit;
}) {
  const nearDup = nearDuplicates(borders.map((b) => b.value), BORDER_NEAR_DUPLICATE_PX);
  return (
    <Table head={["Preview", "Value", "Sides", "Tags", "Uses"]}>
      {borders.map((b) => (
        <tr key={b.value}>
          <td className={styles.chipPreviewCell}>
            <span className={styles.borderChip} style={{ borderWidth: `${b.value}px` }} />
          </td>
          <td className={shared.valueCell}>
            <LengthValue px={b.value} unit={unit}>
              {nearDup.has(b.value) && (
                <span className={shared.offScaleDot} title="Near-duplicate of another width" />
              )}
            </LengthValue>
          </td>
          <TagsCell tags={b.sides.map((s) => ({ tag: s.side, count: s.count }))} />
          <TagsCell tags={b.tags} />
          <td className={shared.usageCell}>{b.count.toLocaleString()}×</td>
        </tr>
      ))}
    </Table>
  );
}

export function ContrastSection({ contrast }: { contrast: NonNullable<SiteAudit["contrast"]> }) {
  return (
    <Table head={["Sample", "Pair", "Ratio", "WCAG", "Tags", "Uses"]}>
      {contrast.map((c) => (
        <tr key={`${c.foreground}|${c.background}`}>
          <td className={styles.chipPreviewCell}>
            <span
              className={styles.contrastSample}
              style={{ background: c.background, color: c.foreground }}
            >
              Aa
            </span>
          </td>
          <td className={shared.valueCell}>
            <span className={styles.contrastPair}>
              {c.foreground}
              <span className={styles.contrastOn}>on</span>
              {c.background}
            </span>
          </td>
          <td className={shared.valueCell}>{c.ratio.toFixed(2)}:1</td>
          <td>
            <Badge variant={c.passAA ? "neutral" : "danger"}>
              {c.passAAA ? "AAA" : c.passAA ? "AA" : c.passAALarge ? "AA large only" : "Fails AA"}
            </Badge>
          </td>
          <TagsCell tags={c.sampleTags} />
          <td className={shared.usageCell}>{c.count.toLocaleString()}×</td>
        </tr>
      ))}
    </Table>
  );
}

export function OpacitySection({ opacity }: { opacity: NonNullable<SiteAudit["opacity"]> }) {
  return (
    <Table head={["Preview", "Value", "Tags", "Uses"]}>
      {opacity.map((o) => (
        <tr key={o.value}>
          <td className={styles.chipPreviewCell}>
            <span className={styles.checker}>
              <span className={styles.opacityFill} style={{ opacity: o.value }} />
            </span>
          </td>
          <td className={shared.valueCell}>{o.value.toFixed(2)}</td>
          <TagsCell tags={o.tags} />
          <td className={shared.usageCell}>{o.count.toLocaleString()}×</td>
        </tr>
      ))}
    </Table>
  );
}

export function ZIndexSection({ zIndex }: { zIndex: NonNullable<SiteAudit["zIndex"]> }) {
  const rank = zIndexRanks(zIndex.map((z) => z.value));
  return (
    <Table head={["Layer", "Value", "Tags", "Uses"]}>
      {zIndex.map((z) => (
        <tr key={z.value}>
          <td className={styles.chipPreviewCell}>
            <ZIndexLadder rank={rank.map.get(z.value) ?? 0} total={rank.total} />
          </td>
          <td className={shared.valueCell}>{z.value}</td>
          <TagsCell tags={z.tags} />
          <td className={shared.usageCell}>{z.count.toLocaleString()}×</td>
        </tr>
      ))}
    </Table>
  );
}

export function BlurSection({ blur }: { blur: NonNullable<SiteAudit["blur"]> }) {
  return (
    <Table head={["Preview", "Value", "Tags", "Uses"]}>
      {blur.map((b) => (
        <tr key={b.value}>
          <td className={styles.chipPreviewCell}>
            <span className={styles.blurStage}>
              <span
                className={styles.blurGlass}
                style={{ backdropFilter: `blur(${b.value}px)`, WebkitBackdropFilter: `blur(${b.value}px)` }}
              />
            </span>
          </td>
          <td className={shared.valueCell}>{b.value}px</td>
          <TagsCell tags={b.tags} />
          <td className={shared.usageCell}>{b.count.toLocaleString()}×</td>
        </tr>
      ))}
    </Table>
  );
}

export function BreakpointSection({
  breakpoints,
}: {
  breakpoints: NonNullable<SiteAudit["breakpoints"]>;
}) {
  const max = breakpoints.reduce((m, v) => Math.max(m, v.value), 1);
  return (
    <Table head={["Preview", "Value", "Device", "Query", "Uses"]}>
      {breakpoints.map((bp) => (
        <tr key={bp.value}>
          <td className={shared.spacingPreviewCell}>
            <span className={styles.bpScreen} style={{ width: `${Math.max((bp.value / max) * 100, 10)}%` }} />
          </td>
          <td className={shared.valueCell}>{bp.value}px</td>
          <td className={shared.valueCell}>
            <span className={shared.tagChip}>{deviceClass(bp.value)}</span>
          </td>
          <TagsCell tags={bp.types.map((t) => ({ tag: `${t.type}-width`, count: t.count }))} />
          <td className={shared.usageCell}>{bp.count.toLocaleString()}×</td>
        </tr>
      ))}
    </Table>
  );
}

export function MotionSection({ motion }: { motion: NonNullable<SiteAudit["motion"]> }) {
  return (
    <>
      <Table head={["Preview", "Duration", "Tags", "Uses"]} className={styles.motionTable}>
        {motion.durations.map((d) => (
          <tr key={d.value}>
            <td className={styles.specimenCell}>
              <span className={styles.motionTrack} style={{ ["--dur" as string]: `${d.value}ms` }}>
                <span className={styles.motionDot} />
              </span>
            </td>
            <td className={shared.valueCell}>{d.value}ms</td>
            <TagsCell tags={d.tags} />
            <td className={shared.usageCell}>{d.count.toLocaleString()}×</td>
          </tr>
        ))}
      </Table>

      <Table head={["Preview", "Easing", "Tags", "Uses"]} className={styles.motionTable}>
        {motion.easings.map((e) => (
          <tr key={e.value}>
            <td className={styles.specimenCell}>
              <span className={styles.motionTrack} style={{ ["--ease" as string]: e.value }}>
                <span className={styles.easingDot} />
              </span>
            </td>
            <td className={`${shared.valueCell} ${shared.valueCellWrap}`}>{e.value}</td>
            <TagsCell tags={e.tags} />
            <td className={shared.usageCell}>{e.count.toLocaleString()}×</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
