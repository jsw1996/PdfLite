/**
 * Color string helpers shared by annotation styling toolbars.
 */

/** Normalize any CSS rgb()/hex string to a compact `r,g,b` key for comparison. */
export function colorKey(color: string): string {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (m) return `${+m[1]},${+m[2]},${+m[3]}`;
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  return color;
}

/** Convert a CSS rgb() string to a `#rrggbb` hex string (defaults to black). */
export function rgbStringToHex(color: string): string {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (!m) return '#000000';
  const toHex = (v: string) => Math.min(255, +v).toString(16).padStart(2, '0');
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

/** Convert a `#rrggbb` hex string to a CSS `rgb(r, g, b)` string. */
export function hexToRgbString(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
