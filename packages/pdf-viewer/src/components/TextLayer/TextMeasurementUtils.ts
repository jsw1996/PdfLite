let context: CanvasRenderingContext2D | null = null;

const MAX_CACHE_ENTRIES = 5000;
const widthCache = new Map<string, number>();
const metricsCache = new Map<string, { width: number; ascent: number; descent: number }>();

function normalizeFontFamily(fontFamily?: string): string {
  const family = (fontFamily ?? '').trim();
  if (!family) return 'sans-serif';
  // If user already provides fallbacks, keep it.
  if (family.includes(',')) return family;
  // Quote to handle spaces (e.g. Times New Roman)
  return `"${family}", sans-serif`;
}

/**
 * Measures the width of a given text string with the provided font.
 * Typically used with `fontSize = "1px"` and then scaled up.
 */
export function measureTextWidth(text: string, fontSize: string, fontFamily?: string): number {
  // SSR / non-DOM environments
  if (typeof document === 'undefined') return 0;

  if (!context) {
    const canvas = document.createElement('canvas');
    context = canvas.getContext('2d');
  }
  if (!context) return 0;

  const font = `${fontSize} ${normalizeFontFamily(fontFamily)}`;
  const cacheKey = `${font}\n${text}`;
  const cached = widthCache.get(cacheKey);
  if (cached !== undefined) return cached;

  context.font = font;
  const width = context.measureText(text).width;

  widthCache.set(cacheKey, width);
  if (widthCache.size > MAX_CACHE_ENTRIES) {
    widthCache.clear();
  }

  return width;
}

/**
 * Measures text width and vertical metrics.
 * When used with `fontSize = "1px"`, ascent/descent are also in px-at-1px scale.
 */
export function measureTextMetrics(
  text: string,
  fontSize: string,
  fontFamily?: string,
): { width: number; ascent: number; descent: number } {
  if (typeof document === 'undefined') {
    return { width: 0, ascent: 0, descent: 0 };
  }

  if (!context) {
    const canvas = document.createElement('canvas');
    context = canvas.getContext('2d');
  }
  if (!context) {
    return { width: 0, ascent: 0, descent: 0 };
  }

  const font = `${fontSize} ${normalizeFontFamily(fontFamily)}`;
  const cacheKey = `${font}\n${text}`;
  const cached = metricsCache.get(cacheKey);
  if (cached) return cached;

  context.font = font;
  const m = context.measureText(text);
  const width = m.width;

  const maybeBBox = m as TextMetrics & {
    actualBoundingBoxAscent?: number;
    actualBoundingBoxDescent?: number;
  };
  const ascent =
    typeof maybeBBox.actualBoundingBoxAscent === 'number' ? maybeBBox.actualBoundingBoxAscent : 0;
  const descent =
    typeof maybeBBox.actualBoundingBoxDescent === 'number' ? maybeBBox.actualBoundingBoxDescent : 0;
  const out: { width: number; ascent: number; descent: number } = { width, ascent, descent };

  metricsCache.set(cacheKey, out);
  widthCache.set(cacheKey, width);

  if (metricsCache.size > MAX_CACHE_ENTRIES || widthCache.size > MAX_CACHE_ENTRIES) {
    metricsCache.clear();
    widthCache.clear();
  }

  return out;
}
