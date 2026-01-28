/**
 * Centralized configuration for the PDF viewer application.
 * Contains all magic numbers and configurable values.
 */

/**
 * Viewer zoom configuration
 */
export const VIEWER_CONFIG = {
  /** Minimum zoom scale */
  MIN_SCALE: 0.25,
  /** Maximum zoom scale */
  MAX_SCALE: 2.5,
  /** Default zoom scale */
  DEFAULT_SCALE: 1.0,
  /** Zoom step when using mouse wheel */
  WHEEL_ZOOM_STEP: 0.25,
  /** Throttle time for wheel zoom (ms) */
  WHEEL_THROTTLE_MS: 60,
} as const;

/**
 * Page loading configuration
 */
export const PAGE_LOAD_CONFIG = {
  /** Number of pages to render initially */
  INITIAL_PAGE_LOAD: 10,
  /** Number of additional pages to load when scrolling */
  PAGE_LOAD_INCREMENT: 10,
} as const;

/**
 * Render configuration
 */
export const RENDER_CONFIG = {
  /** Debounce delay for high-quality rendering (ms) */
  RENDER_DEBOUNCE_MS: 1000,
  /** Preview scale for sidebar thumbnails */
  PREVIEW_SCALE: 0.25,
} as const;

/**
 * Search configuration
 */
export const SEARCH_CONFIG = {
  /** Debounce delay for search input (ms) */
  SEARCH_DEBOUNCE_MS: 300,
  /** Highlight color for search results */
  HIGHLIGHT_COLOR: 'rgba(248, 196, 72, 0.4)',
} as const;

/**
 * Text measurement cache configuration
 */
export const CACHE_CONFIG = {
  /** Maximum entries in the text width cache */
  MAX_CACHE_ENTRIES: 5000,
} as const;

/**
 * Intersection observer configuration for page tracking
 */
export const OBSERVER_CONFIG = {
  /** Root margin for intersection observer */
  ROOT_MARGIN: '0px',
  /** Threshold for considering a page visible */
  VISIBILITY_THRESHOLD: 0.7,
} as const;
