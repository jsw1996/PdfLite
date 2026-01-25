import { CACHE_CONFIG } from '@/utils/config';

let context: CanvasRenderingContext2D | null = null;

// Use a Map for LRU-like behavior (Map maintains insertion order)
const widthCache = new Map<string, number>();

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
 * Uses LRU-like cache eviction to prevent memory spikes.
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
  if (cached !== undefined) {
    // Move to end for LRU behavior (delete and re-add)
    widthCache.delete(cacheKey);
    widthCache.set(cacheKey, cached);
    return cached;
  }

  context.font = font;
  const width = context.measureText(text).width;

  // LRU eviction: remove oldest entries (first in map) when exceeding limit
  if (widthCache.size >= CACHE_CONFIG.MAX_CACHE_ENTRIES) {
    // Remove oldest 10% of entries to avoid frequent evictions
    const entriesToRemove = Math.ceil(CACHE_CONFIG.MAX_CACHE_ENTRIES * 0.1);
    const keys = widthCache.keys();
    for (let i = 0; i < entriesToRemove; i++) {
      const key = keys.next().value;
      if (key) widthCache.delete(key);
    }
  }

  widthCache.set(cacheKey, width);

  return width;
}
