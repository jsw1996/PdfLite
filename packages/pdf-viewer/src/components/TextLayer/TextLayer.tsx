import React, { useMemo, useDeferredValue } from 'react';
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

/**
 * TextLayer component renders invisible but selectable text over the PDF canvas.
 * This enables text selection, copy/paste, and search functionality.
 *
 * Performance optimizations:
 * 1. Base spans computed once at scale=1 and cached (scale-independent)
 * 2. Text width measurements cached at 1px base size
 * 3. CSS transform used for scaling (no re-render of spans on zoom)
 */
export const TextLayer: React.FC<ITextLayerProps> = ({ pageIndex, scale = 1.5 }) => {
  const { controller, isInitialized } = usePdfController();

  // Defer scale updates for spans to avoid blocking main thread during zoom
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

  if (!textContent) {
    return null;
  }

  return (
    <div
      className="text-layer absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        width: `${textContent.pageWidth * deferredScale}px`,
        height: `${textContent.pageHeight * deferredScale}px`,
      }}
    >
      {/* Inner wrapper applies CSS transform for scaling - only this transform changes on zoom */}
      <div
        style={{
          transform: `scale(${deferredScale})`,
          transformOrigin: '0 0',
        }}
      >
        {baseSpans.map((span, index) => (
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
