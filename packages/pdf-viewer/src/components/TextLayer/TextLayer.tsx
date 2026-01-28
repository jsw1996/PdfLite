import React, { useMemo, useRef, useState, useEffect, useCallback, useDeferredValue } from 'react';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import type { ITextRect } from '@pdfviewer/controller';
import { measureTextWidthAtBaseSize } from '../../components/TextLayer/TextMeasurementUtils';

export interface ITextLayerProps {
  pageIndex: number;
  scale?: number;
}

interface IBaseTextSpan {
  text: string;
  left: number;
  top: number;
  height: number;
  /** Pre-computed style object - created once, reused on every render */
  style: React.CSSProperties;
}

/**
 * Normalize font family string once during span creation.
 */
function normalizeFontFamily(fontFamily?: string): string {
  if (!fontFamily) return 'sans-serif';
  return `"${fontFamily}", sans-serif`;
}

/**
 * Convert ITextRect[] from PDFium into renderable spans at base scale (scale=1).
 * Style objects are pre-computed once here and reused on every render.
 * The container applies CSS transform for scaling, so spans stay at base scale.
 */
function convertRectsToBaseSpans(textRects: ITextRect[]): IBaseTextSpan[] {
  const spans: IBaseTextSpan[] = [];

  for (const textRect of textRects) {
    const { content, rect, font } = textRect;

    // Skip empty or whitespace-only rects
    if (!content.trim()) {
      continue;
    }

    // Store coordinates at base scale (scale=1)
    const left = rect.left;
    const top = rect.top;
    const width = rect.width;
    const height = rect.height;

    // Measure text at base size (1px) - this is now scale-independent and cached efficiently
    const probe = content.trim() || 'M';
    const baseTextWidth = measureTextWidthAtBaseSize(probe, font.family);

    // scaleX ratio is scale-independent (based on proportions at base scale)
    const scaleX = baseTextWidth > 0 ? width / (baseTextWidth * height) : 1;

    // Pre-compute style object ONCE - this object is reused on every render
    const style: React.CSSProperties = {
      left: `${left}px`,
      top: `${top}px`,
      height: `${height}px`,
      fontSize: `${height}px`,
      fontFamily: normalizeFontFamily(font.family),
      transform: `scaleX(${scaleX})`,
      cursor: 'text',
      lineHeight: 1,
    };

    spans.push({
      text: content,
      left,
      top,
      height,
      style,
    });
  }

  return spans;
}

// Viewport buffer for virtualization (render spans slightly outside visible area)
const VIEWPORT_BUFFER = 100;

/**
 * TextLayer component renders invisible but selectable text over the PDF canvas.
 * This enables text selection, copy/paste, and search functionality.
 *
 * Performance optimizations:
 * 1. Base spans computed once at scale=1 and cached (scale-independent)
 * 2. Virtualization: only renders spans within the visible viewport
 * 3. Text width measurements cached at 1px base size
 */
export const TextLayer: React.FC<ITextLayerProps> = ({ pageIndex, scale = 1.5 }) => {
  const { controller, isInitialized } = usePdfController();
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ top: 0, bottom: Infinity });

  // Defer scale updates for spans to avoid blocking main thread during zoom
  // Container uses immediate scale (for layout), spans use deferred scale (non-blocking)
  const deferredScale = useDeferredValue(scale);

  // Get text content from controller
  const textContent = useMemo(() => {
    if (!isInitialized) return null;
    try {
      return controller.getPageTextContent(pageIndex);
    } catch (error) {
      console.warn('Failed to load text content for page', pageIndex, error);
      return null;
    }
  }, [controller, isInitialized, pageIndex]);

  // Compute base spans ONCE when text content changes (scale-independent)
  const baseSpans = useMemo(() => {
    if (!textContent) return [];
    return convertRectsToBaseSpans(textContent.textRects);
  }, [textContent]);

  // Update visible range when scrolling or resizing
  const updateVisibleRange = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const parent = container.closest('[data-slot="viewer-page"]') ?? container.parentElement;
    if (!parent) return;

    // Batch reads: get both rects in the same synchronous block to minimize reflows
    const rect = container.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();

    // Calculate visible area in container's coordinate space
    const visibleTop = Math.max(0, (parentRect.top - rect.top - VIEWPORT_BUFFER) / scale);
    const visibleBottom = (parentRect.bottom - rect.top + VIEWPORT_BUFFER) / scale;

    setVisibleRange((prev) => {
      // Only update if values actually changed to avoid unnecessary re-renders
      if (prev.top === visibleTop && prev.bottom === visibleBottom) {
        return prev;
      }
      return { top: visibleTop, bottom: visibleBottom };
    });
  }, [scale]);

  // Set up scroll and resize listeners for virtualization
  useEffect(() => {
    const scrollContainer = containerRef.current?.closest('[data-slot="viewer-scroll-container"]');
    // If no scroll container found, visibleRange stays at initial value (shows all)
    if (!scrollContainer) return;

    // Throttled scroll handler
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateVisibleRange();
          ticking = false;
        });
        ticking = true;
      }
    };

    // Initial calculation via RAF to avoid sync setState
    requestAnimationFrame(updateVisibleRange);

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateVisibleRange);

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateVisibleRange);
    };
  }, [updateVisibleRange]);

  // Filter to only visible spans (virtualization)
  const visibleSpans = useMemo(() => {
    return baseSpans.filter((span) => {
      const spanBottom = span.top + span.height;
      return spanBottom >= visibleRange.top && span.top <= visibleRange.bottom;
    });
  }, [baseSpans, visibleRange]);

  if (!textContent) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="text-layer absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        width: `${textContent.pageWidth * scale}px`,
        height: `${textContent.pageHeight * scale}px`,
      }}
    >
      {/* Inner wrapper applies CSS transform for scaling - only this transform changes on zoom */}
      <div
        style={{
          transform: `scale(${deferredScale})`,
          transformOrigin: '0 0',
        }}
      >
        {visibleSpans.map((span, index) => (
          <span
            key={`${span.left}-${span.top}-${index}`}
            className="absolute whitespace-pre text-transparent select-text origin-top-left pointer-events-auto selection:bg-[rgba(0,0,255,0.3)] selection:text-transparent"
            style={span.style}
          >
            {span.text}
          </span>
        ))}
      </div>
    </div>
  );
};
