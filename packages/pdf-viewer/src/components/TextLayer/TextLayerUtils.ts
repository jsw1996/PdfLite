import type { CSSProperties } from 'react';
import type { ITextRect } from '@pdfviewer/controller';
import { measureTextWidthAtBaseSize } from './TextMeasurementUtils';

export interface IBaseTextSpan {
  text: string;
  left: number;
  top: number;
  height: number;
  style: CSSProperties;
}

function normalizeFontFamily(fontFamily?: string): string {
  if (!fontFamily) return 'sans-serif';
  const clean = fontFamily.replace(/\0/g, '');
  if (!clean) return 'sans-serif';
  return `"${clean}", sans-serif`;
}

export function convertRectsToBaseSpans(textRects: ITextRect[]): IBaseTextSpan[] {
  const spans: IBaseTextSpan[] = [];

  for (const textRect of textRects) {
    const { content, rect, font } = textRect;
    if (!content.trim()) continue;

    const { left, top, width, height } = rect;
    const orientation = textRect.orientation ?? 0;
    const isQuarterTurn = orientation === 90 || orientation === 270;
    const runLength = isQuarterTurn ? height : width;
    const fontSizePx = isQuarterTurn ? width : height;

    const probe = content.trim() || 'M';
    const baseTextWidth = measureTextWidthAtBaseSize(probe, font.family);
    const scaleX = baseTextWidth > 0 ? runLength / (baseTextWidth * fontSizePx) : 1;

    let spanLeft = left;
    let spanTop = top;
    let transform = `scaleX(${scaleX})`;

    if (orientation === 90) {
      spanTop = top + height;
      transform = `rotate(-90deg) scaleX(${scaleX})`;
    } else if (orientation === 180) {
      spanLeft = left + width;
      spanTop = top + height;
      transform = `rotate(180deg) scaleX(${scaleX})`;
    } else if (orientation === 270) {
      spanLeft = left + width;
      transform = `rotate(90deg) scaleX(${scaleX})`;
    }

    const style: CSSProperties = {
      left: `${spanLeft}px`,
      top: `${spanTop}px`,
      height: `${fontSizePx}px`,
      fontSize: `${fontSizePx}px`,
      fontFamily: normalizeFontFamily(font.family),
      transform,
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
