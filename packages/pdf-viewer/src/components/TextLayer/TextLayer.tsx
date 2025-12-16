import React, { useMemo } from 'react';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import type { ITextRect } from '@pdfviewer/controller';
// import { measureTextMetrics } from '../../components/TextLayer/TextMeasurementUtils';
import { measureTextWidth } from '../../components/TextLayer/TextMeasurementUtils';

export interface ITextLayerProps {
  pageIndex: number;
  scale?: number;
}

interface ITextSpan {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontFamily: string;
  scaleX: number;
}

/**
 * Convert ITextRect[] from PDFium into renderable spans with computed transforms.
 * PDFium already groups text into layout-aware rects, so no complex grouping needed.
 */
function convertRectsToSpans(textRects: ITextRect[], scale: number): ITextSpan[] {
  const spans: ITextSpan[] = [];

  for (const textRect of textRects) {
    const { content, rect, font } = textRect;

    // Skip empty or whitespace-only rects
    if (!content.trim()) {
      continue;
    }

    // Scale coordinates
    const left = rect.left * scale;
    const top = rect.top * scale;
    const width = rect.width * scale;
    const height = rect.height * scale;

    // Measure text at 1px to compute scale factors
    const probe = content.trim() || 'M';
    const measuredTextWidth = measureTextWidth(probe, `${height}px`, font.family);

    const scaleX = width / measuredTextWidth;

    spans.push({
      text: content,
      left,
      top: top,
      width,
      height,
      fontFamily: font.family,
      scaleX,
    });
  }

  return spans;
}

/**
 * TextLayer component renders invisible but selectable text over the PDF canvas.
 * This enables text selection, copy/paste, and search functionality.
 */
export const TextLayer: React.FC<ITextLayerProps> = ({ pageIndex, scale = 1.5 }) => {
  const { controller, isInitialized } = usePdfController();

  const textContent = useMemo(() => {
    if (!isInitialized) return null;
    try {
      return controller.getPageTextContent(pageIndex);
    } catch (error) {
      console.warn('Failed to load text content for page', pageIndex, error);
      return null;
    }
  }, [controller, isInitialized, pageIndex]);

  const textSpans = useMemo(() => {
    if (!textContent) return [];
    return convertRectsToSpans(textContent.textRects, scale);
  }, [textContent, scale]);

  if (!textContent) {
    return null;
  }

  return (
    <div
      className="text-layer absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        width: `${textContent.pageWidth * scale}px`,
        height: `${textContent.pageHeight * scale}px`,
      }}
    >
      {textSpans.map((span, index) => (
        <span
          key={index}
          className="absolute whitespace-pre text-transparent select-text origin-top-left pointer-events-auto selection:bg-[rgba(0,0,255,0.3)] selection:text-transparent"
          style={{
            left: `${span.left}px`,
            top: `${span.top}px`,
            height: `${span.height}px`,
            fontSize: `${span.height}px`,
            fontFamily: span.fontFamily ? `"${span.fontFamily}", sans-serif` : 'sans-serif',
            transform: `scaleX(${span.scaleX})`,
            cursor: 'text',
            lineHeight: 1,
          }}
        >
          {span.text}
        </span>
      ))}
    </div>
  );
};
