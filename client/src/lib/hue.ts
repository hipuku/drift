/**
 * How colourful a hex is, 0–1, as the plain RGB spread.
 *
 * HSL saturation is the wrong tool for telling a neutral from a hue: it
 * inflates at extreme lightness, so a near-black with a faint cast (#1E2029)
 * computes to 0.155 and reads as "blue" when every human sees a dark grey.
 * The raw spread doesn't have that failure mode.
 */
export function colourfulness(hex: string): number {
  const h = hex.replace(/^#/, "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return 0;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

export interface Hsl {
  /** Degrees [0,360); -1 for achromatic. */
  h: number;
  /** Saturation [0,1]. */
  s: number;
  /** Lightness [0,1]. */
  l: number;
}

/** HSL of a hex colour. Used to tell neutrals from hues and rank by lightness. */
export function hslOf(hex: string): Hsl {
  const h = hex.replace(/^#/, "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { h: -1, s: 0, l: 0 };

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: -1, s: 0, l };

  const s = d / (1 - Math.abs(2 * l - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return { h: hue < 0 ? hue + 360 : hue, s, l };
}

/**
 * Hue of a hex colour, in degrees [0, 360), for perceptual ordering of a
 * palette. Greys (no chroma) return -1 so they sort ahead of the hues as the
 * neutral run. Accepts #rgb / #rrggbb (with or without leading #); anything
 * unparseable sorts as grey.
 */
export function hueOf(hex: string): number {
  const h = hex.replace(/^#/, "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return -1;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return -1; // grey

  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}
