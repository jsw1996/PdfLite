/**
 * Centralized constants for annotation styling and behavior
 */

/**
 * Default colors for annotations
 */
export const ANNOTATION_COLORS = {
  HIGHLIGHT: 'rgb(248, 196, 72)',
  DRAW: 'rgb(0, 0, 0)',
  TEXT: 'rgb(0, 0, 0)',
} as const;

/**
 * Default stroke widths
 */
export const ANNOTATION_STROKE_WIDTH = {
  DRAW: 2,
  HIGHLIGHT: 14,
} as const;

/**
 * Text annotation defaults
 */
export const TEXT_ANNOTATION_DEFAULTS = {
  FONT_SIZE: 16,
  FONT_COLOR: 'rgb(0, 0, 0)',
  /** RGB values for PDFium commit */
  FONT_COLOR_RGB: { r: 0, g: 0, b: 0 },
  FONT_WEIGHT: 'normal',
  FONT_STYLE: 'normal',
  MIN_WIDTH: 50,
  /** Bounds for the font-size control (in points / logical px at scale=1) */
  MIN_FONT_SIZE: 6,
  MAX_FONT_SIZE: 96,
} as const;

/**
 * Preset swatches shown in the text styling toolbar.
 */
export const TEXT_COLOR_PRESETS = [
  'rgb(0, 0, 0)',
  'rgb(224, 49, 49)',
  'rgb(240, 140, 0)',
  'rgb(47, 158, 68)',
  'rgb(25, 113, 194)',
  'rgb(156, 54, 181)',
] as const;

/**
 * Timing constants
 */
export const ANNOTATION_TIMING = {
  /** Delay to wait before applying highlight, to allow for double/triple-click detection */
  MULTI_CLICK_DELAY_MS: 300,
} as const;
