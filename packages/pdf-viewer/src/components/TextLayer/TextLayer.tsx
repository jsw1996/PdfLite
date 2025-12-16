import React, { useMemo } from 'react';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import type { ITextChar } from '@pdfviewer/controller';
import { measureTextMetrics } from '../../components/TextLayer/TextMeasurementUtils';

export interface ITextLayerProps {
  pageIndex: number;
  scale?: number;
}

interface ITextSpan {
  text: string;
  left: number;
  top: number;
  baseline: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily?: string;
  scaleX: number;
  scaleY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeSpanTransform(span: ITextSpan): void {
  const probe = span.text.trim() ? span.text : 'M';
  const metrics = measureTextMetrics(probe, '1px', span.fontFamily);

  const width1 = metrics.width;
  const height1 = metrics.ascent + metrics.descent;

  // Fall back when TextMetrics doesn't expose bbox ascent/descent.
  const ascent1 = metrics.ascent > 0 ? metrics.ascent : 0.8;
  const descent1 = metrics.descent > 0 ? metrics.descent : 0.2;
  const safeHeight1 = height1 > 0 ? height1 : ascent1 + descent1;

  span.scaleX = width1 > 0 ? clamp(span.width / width1, 0.05, 200) : 1;
  span.scaleY = safeHeight1 > 0 ? clamp(span.height / safeHeight1, 0.05, 200) : 1;

  // Align baselines: baselineY = top + ascent(1px)*scaleY
  span.top = span.baseline - ascent1 * span.scaleY;
}

/**
 * Groups consecutive characters into text spans for efficient rendering.
 * Characters on the same line with similar properties are grouped together.
 */
function groupCharsIntoSpans(chars: ITextChar[], scale: number): ITextSpan[] {
  if (chars.length === 0) return [];

  const spans: ITextSpan[] = [];
  let currentSpan: ITextSpan | null = null;

  for (const char of chars) {
    // Treat hard breaks as span boundaries (PDFium may include \n/\r as text)
    if (char.char === '\n' || char.char === '\r') {
      if (currentSpan) {
        computeSpanTransform(currentSpan);
        spans.push(currentSpan);
        currentSpan = null;
      }
      continue;
    }

    const glyph = char.char === '\t' ? ' ' : char.char;

    const charBaseline = (char.originY ?? char.bottom) * scale;

    // Scale coordinates immediately
    const charLeft = char.left * scale;
    const charTop = char.top * scale;
    const charRight = char.right * scale;
    const charBottom = char.bottom * scale;
    const charWidth = charRight - charLeft;
    const charHeight = charBottom - charTop;
    const charFontSize = charBottom - charTop;

    if (currentSpan) {
      // Heuristic: treat characters as same line when their top positions are close.
      // Keep tolerance tight to avoid merging adjacent lines.
      const verticalTolerance = currentSpan.fontSize * 0.35;
      const sameLine = Math.abs(charBaseline - currentSpan.baseline) < verticalTolerance;

      // Use a real ~25% size tolerance (PDF text boxes vary per glyph)
      const sameFontSize =
        Math.abs(charFontSize - currentSpan.fontSize) < currentSpan.fontSize * 0.25;

      const sameFontFamily = (currentSpan.fontFamily ?? '') === (char.fontFamily ?? '');

      // Check adjacency.
      const expectedLeft = currentSpan.left + currentSpan.width;
      const dist = charLeft - expectedLeft;
      // Allow gap up to 20% of font size. Stricter than before to prevent horizontal drift.
      const isAdjacent = dist < currentSpan.fontSize * 0.9;

      // Check if it's a space. Spaces are naturally allowed to have larger gaps,
      // but we shouldn't group across massive gaps.
      const isSpace = /\s/.test(char.char);
      const isFlowingSpace = isSpace && sameLine && dist < currentSpan.fontSize;

      if (
        (sameLine && sameFontSize && sameFontFamily && isAdjacent) ||
        (sameLine && sameFontFamily && isFlowingSpace)
      ) {
        // Append to current span
        currentSpan.text += glyph;
        // Do NOT update top. Keeping the first char's top ensures baseline stability.
        // currentSpan.top = Math.min(currentSpan.top, charTop);

        // Update width to extend to the right of the new char
        currentSpan.width = charRight - currentSpan.left;
        continue;
      }

      // Finalize current span
      computeSpanTransform(currentSpan);

      spans.push(currentSpan);
      currentSpan = null;
    }

    // Start new span
    currentSpan = {
      text: glyph,
      left: charLeft,
      top: charTop,
      baseline: charBaseline,
      width: charWidth,
      height: charHeight,
      fontSize: charFontSize,
      fontFamily: char.fontFamily,
      scaleX: 1,
      scaleY: 1,
    };
  }

  if (currentSpan) {
    computeSpanTransform(currentSpan);
    spans.push(currentSpan);
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
    return groupCharsIntoSpans(textContent.chars, scale);
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
            fontSize: '1px',
            fontFamily: span.fontFamily ? `"${span.fontFamily}", sans-serif` : 'sans-serif',
            transform: `scale(${span.scaleX}, ${span.scaleY})`,
            lineHeight: 1,
            cursor: 'text',
          }}
        >
          {span.text}
        </span>
      ))}
    </div>
  );
};
