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
 * Draw (pen) tool styling options.
 */
export const DRAW_TOOL_DEFAULTS = {
  /** Default stroke color (CSS color string) */
  COLOR: ANNOTATION_COLORS.DRAW,
  /** Default stroke width in logical px at scale=1 */
  STROKE_WIDTH: ANNOTATION_STROKE_WIDTH.DRAW,
  /** Bounds for the stroke-width control (logical px at scale=1) */
  MIN_STROKE_WIDTH: 1,
  MAX_STROKE_WIDTH: 24,
} as const;

/** Preset swatches shown in the draw styling toolbar. */
export const DRAW_COLOR_PRESETS = [
  'rgb(0, 0, 0)',
  'rgb(224, 49, 49)',
  'rgb(240, 140, 0)',
  'rgb(47, 158, 68)',
  'rgb(25, 113, 194)',
  'rgb(156, 54, 181)',
] as const;

/** Preset stroke widths shown in the draw styling toolbar (logical px at scale=1). */
export const DRAW_STROKE_WIDTH_PRESETS = [1, 2, 4, 8] as const;

/**
 * Highlight tool styling options.
 */
export const HIGHLIGHT_TOOL_DEFAULTS = {
  /** Default highlight color (CSS color string) */
  COLOR: ANNOTATION_COLORS.HIGHLIGHT,
} as const;

/** Preset swatches shown in the highlight styling toolbar. */
export const HIGHLIGHT_COLOR_PRESETS = [
  'rgb(248, 196, 72)',
  'rgb(120, 224, 143)',
  'rgb(120, 191, 248)',
  'rgb(248, 153, 193)',
  'rgb(248, 168, 104)',
  'rgb(193, 153, 248)',
] as const;

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
