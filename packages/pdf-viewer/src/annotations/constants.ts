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
  FONT_SIZE: 12,
  FONT_COLOR: 'rgb(0, 0, 0)',
  /** RGB values for PDFium commit */
  FONT_COLOR_RGB: { r: 0, g: 0, b: 0 },
  MIN_WIDTH: 50,
} as const;

/**
 * Timing constants
 */
export const ANNOTATION_TIMING = {
  /** Delay to wait before applying highlight, to allow for double/triple-click detection */
  MULTI_CLICK_DELAY_MS: 300,
} as const;
