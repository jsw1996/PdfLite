import type { CSSProperties } from 'react';
import type { IEditableTextObject, ITextRect } from '@pdfviewer/controller';
import { measureTextWidthAtBaseSize } from './TextMeasurementUtils';

export interface IBaseTextSpan {
  text: string;
  left: number;
  top: number;
  height: number;
  style: CSSProperties;
}

export interface IRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface IScaledTextRun {
  spanIndex: number;
  content: string;
  rect: IRectLike;
  font: ITextRect['font'];
}

export interface IParagraphLine {
  spanIndices: number[];
  rect: IRectLike;
  text: string;
  fontFamily: string;
  fontSizePx: number;
  color: string;
  scaleX: number;
}

export interface IEditableParagraph {
  lines: IParagraphLine[];
  rect: IRectLike;
  text: string;
}

export interface IEditorStyle {
  fontFamily: string;
  fontSizePx: number;
  color: string;
  scaleX: number;
  lineHeightPx: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeFontFamily(fontFamily?: string): string {
  if (!fontFamily) return 'sans-serif';
  // Strip null bytes that PDFium sometimes includes in font names
  const clean = fontFamily.replace(/\0/g, '');
  if (!clean) return 'sans-serif';
  return `"${clean}", sans-serif`;
}

/**
 * Extract a comparable base font name from a CSS fontFamily string.
 * Strips quotes, fallback lists, subset prefixes (e.g. "ABCDEF+"), and
 * normalizes to lowercase for fuzzy matching.
 *
 * Returns '' for generic CSS families (sans-serif, serif, monospace) because
 * these are fallback artifacts: when FPDFPage_GenerateContent corrupts the
 * content stream, FPDFText_GetCharIndexAtPos returns -1 and getPageTextContent
 * defaults fontFamily to '' → normalized to 'sans-serif'. Returning '' lets
 * the paragraph-split check treat them as "unknown / matches anything".
 */
function baseFontName(fontFamily: string): string {
  const first = fontFamily.split(',')[0] ?? '';
  const name = first
    .replace(/["']/g, '')
    .replace(/^[A-Z]{6}\+/, '')
    .trim()
    .toLowerCase();
  if (!name || name === 'sans-serif' || name === 'serif' || name === 'monospace') {
    return '';
  }
  return name;
}

function unionRects(rects: IRectLike[]): IRectLike {
  if (rects.length === 0) return { left: 0, top: 0, width: 0, height: 0 };

  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  for (const rect of rects) {
    minLeft = Math.min(minLeft, rect.left);
    minTop = Math.min(minTop, rect.top);
    maxRight = Math.max(maxRight, rect.left + rect.width);
    maxBottom = Math.max(maxBottom, rect.top + rect.height);
  }

  return {
    left: minLeft,
    top: minTop,
    width: Math.max(0, maxRight - minLeft),
    height: Math.max(0, maxBottom - minTop),
  };
}

function expandRect(rect: IRectLike, padX: number, padY = padX): IRectLike {
  return {
    left: rect.left - padX,
    top: rect.top - padY,
    width: rect.width + padX * 2,
    height: rect.height + padY * 2,
  };
}

function getRectIntersectionArea(a: IRectLike, b: IRectLike): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

function colorToCss(color: { r: number; g: number; b: number; a: number }): string {
  const alpha = Math.max(0, Math.min(1, color.a / 255));
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function startsWithPunctuation(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed) return false;
  return /^[,.;:!?)]/.test(trimmed);
}

function buildLineTextFromRuns(runs: IScaledTextRun[]): string {
  if (runs.length === 0) return '';

  const sortedRuns = [...runs].sort((a, b) => a.rect.left - b.rect.left);
  let text = '';

  for (let i = 0; i < sortedRuns.length; i++) {
    const run = sortedRuns[i];
    if (i > 0) {
      const prev = sortedRuns[i - 1];
      const prevRight = prev.rect.left + prev.rect.width;
      const gap = run.rect.left - prevRight;
      const gapThreshold = Math.max(1, Math.min(prev.rect.height, run.rect.height) * 0.22);

      if (
        gap > gapThreshold &&
        !text.endsWith(' ') &&
        !run.content.startsWith(' ') &&
        !startsWithPunctuation(run.content)
      ) {
        text += ' ';
      }
    }

    text += run.content;
  }

  return text;
}

function pointInsideRect(x: number, y: number, rect: IRectLike): boolean {
  return (
    x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
  );
}

export function convertRectsToBaseSpans(textRects: ITextRect[]): IBaseTextSpan[] {
  const spans: IBaseTextSpan[] = [];

  for (const textRect of textRects) {
    const { content, rect, font } = textRect;
    if (!content.trim()) continue;

    const { left, top, width, height } = rect;

    const probe = content.trim() || 'M';
    const baseTextWidth = measureTextWidthAtBaseSize(probe, font.family);
    const scaleX = baseTextWidth > 0 ? width / (baseTextWidth * height) : 1;

    const style: CSSProperties = {
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

export function buildEditableParagraphsFromTextRects(
  textRects: ITextRect[],
  scale: number,
): IEditableParagraph[] {
  const runs: IScaledTextRun[] = [];
  let spanIndex = 0;
  for (const rect of textRects) {
    if (rect.content.trim().length === 0) continue;
    runs.push({
      spanIndex,
      content: rect.content,
      rect: {
        left: rect.rect.left * scale,
        top: rect.rect.top * scale,
        width: rect.rect.width * scale,
        height: rect.rect.height * scale,
      },
      font: rect.font,
    });
    spanIndex += 1;
  }

  if (runs.length === 0) return [];

  runs.sort((a, b) => {
    const topDiff = a.rect.top - b.rect.top;
    if (Math.abs(topDiff) > 1) return topDiff;
    return a.rect.left - b.rect.left;
  });

  const lineBuckets: { runs: IScaledTextRun[]; centerY: number }[] = [];

  for (const run of runs) {
    const centerY = run.rect.top + run.rect.height / 2;
    let targetIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < lineBuckets.length; i++) {
      const bucket = lineBuckets[i];
      const averageHeight =
        bucket.runs.reduce((sum, item) => sum + item.rect.height, 0) /
        Math.max(1, bucket.runs.length);
      const tolerance = Math.max(2, Math.min(run.rect.height, averageHeight) * 0.55);
      const distance = Math.abs(bucket.centerY - centerY);
      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        targetIndex = i;
      }
    }

    if (targetIndex === -1) {
      lineBuckets.push({ runs: [run], centerY });
      continue;
    }

    const target = lineBuckets[targetIndex];

    // Guard against merging runs from overlapping paragraphs into one line.
    // Within a real text line, runs tile left-to-right with minimal overlap.
    // If the new run overlaps an existing run horizontally by >50% of the
    // smaller width, it must be from a different paragraph whose reflow
    // expanded into this vertical space.
    const hasHorizontalOverlap = target.runs.some((existing) => {
      const overlapLeft = Math.max(existing.rect.left, run.rect.left);
      const overlapRight = Math.min(
        existing.rect.left + existing.rect.width,
        run.rect.left + run.rect.width,
      );
      const overlapWidth = overlapRight - overlapLeft;
      if (overlapWidth <= 0) return false;
      const smallerWidth = Math.min(existing.rect.width, run.rect.width);
      return smallerWidth > 0 && overlapWidth > smallerWidth * 0.5;
    });

    // Guard against merging runs from different columns into one line.
    // Within a real text line, runs are horizontally close (word spacing ≈ 0.25em).
    // If the new run is far from ALL existing runs in the bucket horizontally,
    // it belongs to a different column at the same vertical position.
    const isHorizontallyDistant = target.runs.every((existing) => {
      const gapLeft = run.rect.left - (existing.rect.left + existing.rect.width);
      const gapRight = existing.rect.left - (run.rect.left + run.rect.width);
      const gap = Math.max(gapLeft, gapRight);
      const maxH = Math.max(run.rect.height, existing.rect.height);
      return gap > maxH * 1.5;
    });

    if (hasHorizontalOverlap || isHorizontallyDistant) {
      lineBuckets.push({ runs: [run], centerY });
      continue;
    }

    target.runs.push(run);
    target.centerY =
      target.runs.reduce((sum, item) => sum + (item.rect.top + item.rect.height / 2), 0) /
      target.runs.length;
  }

  const lines: IParagraphLine[] = lineBuckets
    .map((bucket) => {
      const sortedRuns = [...bucket.runs].sort((a, b) => a.rect.left - b.rect.left);
      const rect = unionRects(sortedRuns.map((run) => run.rect));
      const text = buildLineTextFromRuns(sortedRuns);

      const dominantRun =
        sortedRuns.reduce((best, current) => {
          const bestArea = best.rect.width * best.rect.height;
          const currentArea = current.rect.width * current.rect.height;
          return currentArea > bestArea ? current : best;
        }, sortedRuns[0]) ?? sortedRuns[0];

      // Use glyph bounding-box height for rendering (matches visual size on canvas).
      const fontSizePx = Math.max(8, dominantRun.rect.height);
      const probe = text.trim() || 'M';
      const baseTextWidth = measureTextWidthAtBaseSize(probe, dominantRun.font.family);
      const measuredWidth = baseTextWidth * fontSizePx;
      const scaleX = measuredWidth > 0 ? clamp(rect.width / measuredWidth, 0.5, 3) : 1;

      return {
        spanIndices: sortedRuns.map((run) => run.spanIndex),
        rect,
        text,
        fontFamily: normalizeFontFamily(dominantRun.font.family),
        fontSizePx,
        color: colorToCss(dominantRun.font.color),
        scaleX,
      };
    })
    .filter((line) => line.text.trim().length > 0)
    .sort((a, b) => a.rect.top - b.rect.top);

  if (lines.length === 0) return [];

  const paragraphs: IEditableParagraph[] = [];
  let current: IParagraphLine[] = [];

  for (const line of lines) {
    if (current.length === 0) {
      current.push(line);
      continue;
    }

    const previous = current[current.length - 1];
    const verticalGap = line.rect.top - (previous.rect.top + previous.rect.height);
    const threshold = Math.max(previous.rect.height, line.rect.height) * 1.15;

    // If lines significantly overlap vertically, they must be from different
    // paragraphs — one expanded into the other's space during editing.
    // Normal ascender/descender bbox overlap is at most ~30% of line height;
    // anything beyond 35% is a reliable signal of cross-paragraph overlap.
    const overlapTolerance = Math.min(previous.rect.height, line.rect.height) * 0.35;
    const significantOverlap = verticalGap < -overlapTolerance;

    // Split on font change: different base family or significant size difference.
    // After FPDFPage_GenerateContent corruption, GetCharIndexAtPos can return -1,
    // causing font.family to default to '' (→ 'sans-serif') and font.size to
    // default to rect height. baseFontName returns '' for generic fallback names
    // so we skip the family comparison when either side is unknown.
    const lineBase = baseFontName(line.fontFamily);
    const prevBase = baseFontName(previous.fontFamily);
    const fontFamilyChanged = lineBase !== '' && prevBase !== '' && lineBase !== prevBase;
    // Font-size comparison uses rect heights, which are glyph bounding boxes —
    // NOT the actual font em-box size. Within the same font and PDF font size,
    // glyph bbox heights can vary by ~35% depending on which characters are
    // present (e.g. "illum" ≈ 8px vs "dolore" ≈ 11px in the same 11pt font).
    //
    // Use a 50% threshold so only genuinely different sizes split (e.g.
    // 24pt header vs 12pt body = 50%). Moderate size differences (16pt vs 12pt
    // = 25%) are better handled by font-family comparison, since headers
    // typically use a different weight or family.
    const fontSizeChanged =
      Math.abs(line.fontSizePx - previous.fontSizePx) /
        Math.max(line.fontSizePx, previous.fontSizePx) >
      0.5;
    const fontChanged = fontFamilyChanged || fontSizeChanged;

    // Split on left-edge misalignment: lines within the same paragraph are
    // left-aligned (±a few px for glyph bbox variation). A large shift in
    // left edge indicates a different column or paragraph.
    const leftShift = Math.abs(line.rect.left - previous.rect.left);
    const maxLineHeight = Math.max(previous.rect.height, line.rect.height);
    const significantLeftShift = leftShift > maxLineHeight * 2;

    if (verticalGap <= threshold && !fontChanged && !significantOverlap && !significantLeftShift) {
      current.push(line);
      continue;
    }

    paragraphs.push({
      lines: current,
      rect: unionRects(current.map((item) => item.rect)),
      text: current.map((item) => item.text).join('\n'),
    });
    current = [line];
  }

  if (current.length > 0) {
    paragraphs.push({
      lines: current,
      rect: unionRects(current.map((item) => item.rect)),
      text: current.map((item) => item.text).join('\n'),
    });
  }

  return paragraphs;
}

export function resolveParagraphEditorStyle(paragraph: IEditableParagraph): IEditorStyle {
  const fallbackSize = Math.max(12, paragraph.rect.height / Math.max(1, paragraph.lines.length));
  if (paragraph.lines.length === 0) {
    return {
      fontFamily: normalizeFontFamily(undefined),
      fontSizePx: fallbackSize,
      color: 'rgba(0, 0, 0, 1)',
      scaleX: 1,
      lineHeightPx: fallbackSize * 1.1,
    };
  }

  // Use max fontSizePx across all lines — rect heights vary per glyph (ascenders/descenders),
  // so the tallest line best approximates the actual font em-box size.
  const fontSizePx = Math.max(...paragraph.lines.map((line) => line.fontSizePx));

  // Use the dominant line (largest area) for font family and color
  const dominantLine = paragraph.lines.reduce((best, current) => {
    const bestArea = best.rect.width * best.rect.height;
    const currentArea = current.rect.width * current.rect.height;
    return currentArea > bestArea ? current : best;
  }, paragraph.lines[0]);

  // Recompute scaleX for each line relative to the unified fontSizePx.
  // Each line's original scaleX was: lineRect.width / (baseTextWidth * line.fontSizePx)
  // Adjusting for the unified fontSizePx: scaleX * line.fontSizePx / fontSizePx
  const scaleX = median(
    paragraph.lines.map((line) => (line.scaleX * line.fontSizePx) / fontSizePx),
  );

  const lineTopDiffs: number[] = [];
  for (let i = 1; i < paragraph.lines.length; i++) {
    const diff = paragraph.lines[i].rect.top - paragraph.lines[i - 1].rect.top;
    if (diff > 0) lineTopDiffs.push(diff);
  }
  const lineHeightPxFromPitch = median(lineTopDiffs);
  const lineHeightPx =
    lineHeightPxFromPitch > 0
      ? clamp(lineHeightPxFromPitch, fontSizePx * 0.85, fontSizePx * 3.2)
      : clamp(dominantLine.rect.height, fontSizePx * 0.9, fontSizePx * 2.2);

  return {
    fontFamily: dominantLine.fontFamily,
    fontSizePx,
    color: dominantLine.color,
    scaleX,
    lineHeightPx,
  };
}

export function mapParagraphLinesToObjectGroups(
  paragraph: IEditableParagraph,
  objects: IEditableTextObject[],
): IEditableTextObject[][] {
  const groups = paragraph.lines.map(() => [] as IEditableTextObject[]);
  if (paragraph.lines.length === 0 || objects.length === 0) return groups;

  const avgLineHeight =
    paragraph.lines.reduce((sum, line) => sum + line.rect.height, 0) /
    Math.max(1, paragraph.lines.length);
  const paragraphRect = expandRect(paragraph.rect, avgLineHeight * 0.5, avgLineHeight * 0.4);

  const candidates = objects.filter((object) => {
    if (getRectIntersectionArea(object.rect, paragraphRect) > 0) return true;
    const centerX = object.rect.left + object.rect.width / 2;
    const centerY = object.rect.top + object.rect.height / 2;
    return pointInsideRect(centerX, centerY, paragraphRect);
  });

  for (const object of candidates) {
    const objectCenterX = object.rect.left + object.rect.width / 2;
    const objectCenterY = object.rect.top + object.rect.height / 2;

    let bestLineIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let lineIndex = 0; lineIndex < paragraph.lines.length; lineIndex++) {
      const line = paragraph.lines[lineIndex];
      const lineRect = expandRect(line.rect, avgLineHeight * 0.4, avgLineHeight * 0.25);
      const overlap = getRectIntersectionArea(object.rect, lineRect);
      const lineCenterY = line.rect.top + line.rect.height / 2;
      const verticalDistance = Math.abs(objectCenterY - lineCenterY);
      const maxVerticalDistance = Math.max(
        6,
        Math.max(object.rect.height, line.rect.height) * 1.25,
      );

      if (verticalDistance > maxVerticalDistance && overlap <= 0) {
        continue;
      }

      const horizontalHit =
        objectCenterX >= lineRect.left && objectCenterX <= lineRect.left + lineRect.width;
      const verticalScore = 1 - verticalDistance / Math.max(1, maxVerticalDistance);
      const score = overlap + verticalScore + (horizontalHit ? 0.25 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestLineIndex = lineIndex;
      }
    }

    if (bestLineIndex >= 0) {
      groups[bestLineIndex].push(object);
    }
  }

  for (const group of groups) {
    group.sort((a, b) => a.rect.left - b.rect.left);
  }

  return groups;
}

export function normalizeEditableText(raw: string): string {
  return raw.replace(/\r/g, '').replace(/\u00a0/g, ' ');
}

export function splitLines(text: string): string[] {
  return text.split('\n');
}

export function getCaretPosition(
  text: string,
  caretIndex: number,
): { lines: string[]; lineIndex: number; column: number } {
  const lines = splitLines(text);
  const safeIndex = clamp(caretIndex, 0, text.length);

  let remaining = safeIndex;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineLength = lines[lineIndex].length;
    if (remaining <= lineLength) {
      return { lines, lineIndex, column: remaining };
    }
    remaining -= lineLength + 1;
  }

  const lastLineIndex = Math.max(0, lines.length - 1);
  return { lines, lineIndex: lastLineIndex, column: lines[lastLineIndex].length };
}

export function getCaretIndexForLineColumn(
  lines: string[],
  lineIndex: number,
  column: number,
): number {
  const safeLine = clamp(lineIndex, 0, Math.max(0, lines.length - 1));
  const safeColumn = clamp(column, 0, lines[safeLine]?.length ?? 0);
  let index = 0;
  for (let i = 0; i < safeLine; i++) {
    index += (lines[i]?.length ?? 0) + 1;
  }
  return index + safeColumn;
}

function getVisualLineMetrics(
  paragraph: IEditableParagraph,
  style: IEditorStyle,
  lineIndex: number,
): {
  left: number;
  top: number;
  height: number;
  fontFamily: string;
  fontSizePx: number;
  scaleX: number;
} {
  if (lineIndex < paragraph.lines.length) {
    const line = paragraph.lines[lineIndex];
    return {
      left: line.rect.left,
      top: line.rect.top,
      height: line.rect.height,
      fontFamily: line.fontFamily,
      fontSizePx: line.fontSizePx,
      scaleX: line.scaleX,
    };
  }

  return {
    left: paragraph.rect.left,
    top: paragraph.rect.top + lineIndex * style.lineHeightPx,
    height: style.lineHeightPx,
    fontFamily: style.fontFamily,
    fontSizePx: style.fontSizePx,
    scaleX: style.scaleX,
  };
}

function measurePrefixWidthPx(
  text: string,
  column: number,
  fontFamily: string,
  fontSizePx: number,
  scaleX: number,
): number {
  if (column <= 0) return 0;
  const prefix = text.slice(0, column);
  const baseWidth = measureTextWidthAtBaseSize(prefix, fontFamily);
  return baseWidth * fontSizePx * scaleX;
}

export function getCaretRect(
  paragraph: IEditableParagraph,
  style: IEditorStyle,
  text: string,
  caretIndex: number,
): { left: number; top: number; height: number } {
  const { lines, lineIndex, column } = getCaretPosition(text, caretIndex);
  const lineText = lines[lineIndex] ?? '';
  const metrics = getVisualLineMetrics(paragraph, style, lineIndex);
  const xOffset = measurePrefixWidthPx(
    lineText,
    column,
    metrics.fontFamily,
    metrics.fontSizePx,
    metrics.scaleX,
  );

  return {
    left: metrics.left + xOffset,
    top: metrics.top,
    height: Math.max(8, metrics.height),
  };
}

export function getCaretIndexFromPoint(
  paragraph: IEditableParagraph,
  style: IEditorStyle,
  text: string,
  x: number,
  y: number,
): number {
  const lines = splitLines(text);
  const visualLineCount = Math.max(1, lines.length, paragraph.lines.length);
  let bestLineIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < visualLineCount; i++) {
    const metrics = getVisualLineMetrics(paragraph, style, i);
    const centerY = metrics.top + metrics.height / 2;
    const distance = Math.abs(y - centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLineIndex = i;
    }
  }

  const lineText = lines[bestLineIndex] ?? '';
  const metrics = getVisualLineMetrics(paragraph, style, bestLineIndex);
  let bestColumn = 0;
  let bestXDistance = Number.POSITIVE_INFINITY;

  for (let column = 0; column <= lineText.length; column++) {
    const offset = measurePrefixWidthPx(
      lineText,
      column,
      metrics.fontFamily,
      metrics.fontSizePx,
      metrics.scaleX,
    );
    const caretX = metrics.left + offset;
    const distance = Math.abs(x - caretX);
    if (distance < bestXDistance) {
      bestXDistance = distance;
      bestColumn = column;
    }
  }

  return getCaretIndexForLineColumn(lines, bestLineIndex, bestColumn);
}

// ─── Word-wrap helpers ──────────────────────────────────────────────────────

export interface IRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parse a CSS rgba()/rgb() color string into {r, g, b, a} with 0-255 integer values.
 * Returns black as fallback for unparseable strings.
 */
export function parseCssRgba(cssColor: string): IRgba {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(cssColor);
  if (!match) return { r: 0, g: 0, b: 0, a: 255 };
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] !== undefined ? Math.round(parseFloat(match[4]) * 255) : 255,
  };
}

function isCjkCodePoint(code: number): boolean {
  return (
    (code >= 0x3000 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x20000 && code <= 0x2fa1f)
  );
}

/**
 * Split text into breakable tokens for word-wrapping.
 * - Each CJK character becomes its own token (breakable at character boundaries).
 * - Latin text is split on word boundaries (each token includes trailing whitespace).
 */
function tokenizeForWrapping(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const code = text.codePointAt(i)!;
    if (isCjkCodePoint(code)) {
      const charLen = code > 0xffff ? 2 : 1;
      tokens.push(text.slice(i, i + charLen));
      i += charLen;
    } else {
      // Accumulate Latin/other run until next CJK character
      let j = i;
      while (j < text.length) {
        const c = text.codePointAt(j)!;
        if (isCjkCodePoint(c)) break;
        j += c > 0xffff ? 2 : 1;
      }
      // Split this Latin run on whitespace boundaries (keep trailing whitespace with each word)
      const run = text.slice(i, j);
      const words = run.split(/(?<=\s)/);
      for (const w of words) {
        if (w) tokens.push(w);
      }
      i = j;
    }
  }
  return tokens;
}

/**
 * Word-wraps a single hard line (no \n) into multiple lines fitting within maxWidthPx.
 * Uses canvas text measurement via measureTextWidthAtBaseSize.
 *
 * @param text - A single line of text (caller splits on \n first)
 * @param maxWidthPx - Maximum line width in pixels (effective content width before scaleX)
 * @param fontFamily - CSS font-family string
 * @param fontSizePx - Font size in pixels
 * @returns Array of wrapped line strings
 */
export function wordWrapText(
  text: string,
  maxWidthPx: number,
  fontFamily: string,
  fontSizePx: number,
): string[] {
  if (!text) return [''];

  // Short-circuit: if the entire text fits, return as-is
  const fullWidth = measureTextWidthAtBaseSize(text, fontFamily) * fontSizePx;
  if (fullWidth <= maxWidthPx) return [text];

  const tokens = tokenizeForWrapping(text);
  const lines: string[] = [];
  let currentLine = '';

  for (const token of tokens) {
    const testLine = currentLine + token;
    const testWidth = measureTextWidthAtBaseSize(testLine, fontFamily) * fontSizePx;

    if (testWidth <= maxWidthPx || currentLine.length === 0) {
      // Fits, or we must accept at least one token per line
      currentLine = testLine;
    } else {
      // Push current line and start new one
      lines.push(currentLine);
      currentLine = token.trimStart();
    }

    // If a single token still overflows after starting a new line, force-break it
    if (currentLine.length > 0) {
      const currentWidth = measureTextWidthAtBaseSize(currentLine, fontFamily) * fontSizePx;
      if (currentWidth > maxWidthPx && currentLine.length > 1) {
        // Force-break character by character
        let broken = '';
        for (let ci = 0; ci < currentLine.length; ci++) {
          const charLen = (currentLine.codePointAt(ci) ?? 0) > 0xffff ? 2 : 1;
          const nextChar = currentLine.slice(ci, ci + charLen);
          const nextWidth = measureTextWidthAtBaseSize(broken + nextChar, fontFamily) * fontSizePx;
          if (nextWidth > maxWidthPx && broken.length > 0) {
            lines.push(broken);
            broken = nextChar;
          } else {
            broken += nextChar;
          }
          if (charLen === 2) ci++; // skip surrogate pair
        }
        currentLine = broken;
      }
    }
  }

  if (currentLine) lines.push(currentLine);
  if (lines.length === 0) lines.push('');

  return lines;
}

// ─── ContentEditable helpers ────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Builds the initial innerHTML for the contentEditable editor.
 * Each paragraph line becomes a styled `<div>` with per-line font, size, color, and scaleX.
 */
export function buildEditorHtml(paragraph: IEditableParagraph, lineHeightPx: number): string {
  return paragraph.lines
    .map((line) => {
      const width = (paragraph.rect.width / line.scaleX) * 1.03;
      const styleParts = [
        `font-family:${line.fontFamily}`,
        `font-size:${line.fontSizePx}px`,
        `line-height:${lineHeightPx}px`,
        `color:${line.color}`,
        `transform:scaleX(${line.scaleX})`,
        `transform-origin:0 0`,
        `width:${width}px`,
        `white-space:pre-wrap`,
        `word-break:break-word`,
      ].join(';');
      // Escape double quotes in style values (e.g. font-family names)
      const safeStyle = styleParts.replace(/"/g, '&quot;');
      return `<div style="${safeStyle}">${escapeHtml(line.text)}</div>`;
    })
    .join('');
}

/**
 * Extracts plain text from a contentEditable editor element.
 * Uses innerText which respects block boundaries and <br> elements.
 */
export function extractTextFromEditor(editor: HTMLElement): string {
  return editor.innerText;
}

/**
 * Sets the cursor position in a contentEditable editor by character index.
 * Walks through child divs (one per line) to find the correct text node and offset.
 */
export function setCursorInEditor(editor: HTMLElement, charIndex: number): void {
  const sel = window.getSelection();
  if (!sel) return;

  let remaining = charIndex;

  for (const child of editor.childNodes) {
    const textNode = child.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      // Empty div — counts as 0 chars + 1 newline
      if (remaining <= 0) {
        const range = document.createRange();
        range.setStart(child, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      remaining -= 1;
      continue;
    }

    const len = textNode.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(textNode, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }

    remaining -= len + 1; // +1 for implicit newline between lines
  }

  // Fallback: cursor at end
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
