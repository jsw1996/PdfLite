import type { CSSProperties } from 'react';
import type { IEditableTextObject, ITextRect, StandardFontFamily } from '@pdfviewer/controller';
import type {
  EditFontFamily,
  IParagraphFormatOverride,
} from '../../providers/AnnotationContextProvider';
import { measureTextWidthAtBaseSize } from './TextMeasurementUtils';

// Lazy singleton: `Intl.Segmenter` is widely available (Chrome 87+, Safari 14.1+,
// Node 16+). Falls back to codepoint splitting if missing.
let graphemeSegmenter: Intl.Segmenter | null | undefined;
function splitGraphemes(text: string): string[] {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  }
  if (graphemeSegmenter) {
    const out: string[] = [];
    for (const { segment } of graphemeSegmenter.segment(text)) out.push(segment);
    return out;
  }
  return Array.from(text);
}

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
      spanLeft = left + width;
      transform = `rotate(90deg) scaleX(${scaleX})`;
    } else if (orientation === 180) {
      spanLeft = left + width;
      spanTop = top + height;
      transform = `rotate(180deg) scaleX(${scaleX})`;
    } else if (orientation === 270) {
      spanTop = top + height;
      transform = `rotate(-90deg) scaleX(${scaleX})`;
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

  // ─── Group lines into paragraphs (column-aware) ───
  // Lines are walked top-to-bottom, but each line is attached to the closest
  // *continuable* open paragraph whose column it overlaps — rather than only to
  // the immediately-preceding line in global vertical order. This is essential
  // for multi-column layouts: the columns' lines interleave when sorted by
  // vertical position, and a single-stream pass would treat every line as a new
  // column/paragraph (firing the left-shift guard on each one). Keeping one
  // open "stream" per column lets each paragraph accumulate its own lines. For
  // single-column documents there is exactly one open paragraph at a time, so
  // this reduces to the original consecutive-line behavior.
  interface IOpenParagraph {
    lines: IParagraphLine[];
    left: number;
    right: number;
  }

  const finalizeParagraph = (paragraph: IOpenParagraph): IEditableParagraph => ({
    lines: paragraph.lines,
    rect: unionRects(paragraph.lines.map((item) => item.rect)),
    text: paragraph.lines.map((item) => item.text).join('\n'),
  });

  // Whether `line` can extend `paragraph` (same column, normal spacing, same font).
  const canContinue = (paragraph: IOpenParagraph, line: IParagraphLine): boolean => {
    const previous = paragraph.lines[paragraph.lines.length - 1];

    // Same column: the line must horizontally overlap the paragraph's running
    // x-span by more than half the narrower width. Two-column lines that sit at
    // the same height never overlap, so they stay in separate paragraphs.
    const lineRight = line.rect.left + line.rect.width;
    const overlap = Math.min(paragraph.right, lineRight) - Math.max(paragraph.left, line.rect.left);
    const minWidth = Math.min(paragraph.right - paragraph.left, line.rect.width);
    if (minWidth <= 0 || overlap <= minWidth * 0.5) return false;

    const verticalGap = line.rect.top - (previous.rect.top + previous.rect.height);
    const threshold = Math.max(previous.rect.height, line.rect.height) * 1.15;

    // Significant vertical overlap signals different paragraphs (one expanded
    // into the other's space during editing). Normal ascender/descender bbox
    // overlap is ≤ ~30% of line height; beyond 35% is a reliable split signal.
    const overlapTolerance = Math.min(previous.rect.height, line.rect.height) * 0.35;
    const significantOverlap = verticalGap < -overlapTolerance;

    // Split on font change: different base family or significant size difference.
    // baseFontName returns '' for generic/corrupted families, so a missing
    // family on either side skips the family comparison.
    const lineBase = baseFontName(line.fontFamily);
    const prevBase = baseFontName(previous.fontFamily);
    const fontFamilyChanged = lineBase !== '' && prevBase !== '' && lineBase !== prevBase;
    // Size comparison uses glyph bbox heights, which vary ~35% by characters
    // present; a 50% threshold only splits genuinely different sizes (e.g. a
    // 24pt header vs 12pt body). Moderate differences are caught by family.
    const fontSizeChanged =
      Math.abs(line.fontSizePx - previous.fontSizePx) /
        Math.max(line.fontSizePx, previous.fontSizePx) >
      0.5;
    const fontChanged = fontFamilyChanged || fontSizeChanged;

    // Split on left-edge misalignment within the same column (e.g. a hanging
    // indent or a new aligned block). Column jumps are already excluded above.
    const leftShift = Math.abs(line.rect.left - previous.rect.left);
    const maxLineHeight = Math.max(previous.rect.height, line.rect.height);
    const significantLeftShift = leftShift > maxLineHeight * 2;

    return verticalGap <= threshold && !fontChanged && !significantOverlap && !significantLeftShift;
  };

  const paragraphs: IEditableParagraph[] = [];
  const open: IOpenParagraph[] = [];

  for (const line of lines) {
    // Close paragraphs the current line is now far below — lines are top-sorted,
    // so nothing further down can continue them. The 4× margin is well beyond
    // the 1.15× merge threshold, so this never drops a still-continuable line.
    for (let i = open.length - 1; i >= 0; i--) {
      const last = open[i].lines[open[i].lines.length - 1];
      if (line.rect.top - (last.rect.top + last.rect.height) > last.rect.height * 4) {
        paragraphs.push(finalizeParagraph(open[i]));
        open.splice(i, 1);
      }
    }

    // Attach to the closest continuable open paragraph (smallest vertical gap).
    let best: IOpenParagraph | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const paragraph of open) {
      if (!canContinue(paragraph, line)) continue;
      const last = paragraph.lines[paragraph.lines.length - 1];
      const gap = Math.abs(line.rect.top - (last.rect.top + last.rect.height));
      if (gap < bestGap) {
        bestGap = gap;
        best = paragraph;
      }
    }

    if (best) {
      best.lines.push(line);
      best.left = Math.min(best.left, line.rect.left);
      best.right = Math.max(best.right, line.rect.left + line.rect.width);
    } else {
      open.push({ lines: [line], left: line.rect.left, right: line.rect.left + line.rect.width });
    }
  }

  for (const paragraph of open) paragraphs.push(finalizeParagraph(paragraph));

  // Stable reading-ish order: top-to-bottom, then left-to-right between columns.
  paragraphs.sort((a, b) => {
    const topDiff = a.rect.top - b.rect.top;
    if (Math.abs(topDiff) > 4) return topDiff;
    return a.rect.left - b.rect.left;
  });

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

    // Track the width of currentLine so the overflow check below reuses it
    // instead of re-measuring the same string every iteration.
    let currentWidth: number;
    if (testWidth <= maxWidthPx || currentLine.length === 0) {
      // Fits, or we must accept at least one token per line
      currentLine = testLine;
      currentWidth = testWidth;
    } else {
      // Push current line and start new one
      lines.push(currentLine);
      currentLine = token.trimStart();
      currentWidth = measureTextWidthAtBaseSize(currentLine, fontFamily) * fontSizePx;
    }

    // If a single token still overflows after starting a new line, force-break it
    if (currentLine.length > 0) {
      if (currentWidth > maxWidthPx && currentLine.length > 1) {
        // Force-break grapheme by grapheme so we don't split surrogate pairs or
        // ZWJ clusters (emoji families, flags, skin-tone modifiers, etc.).
        const graphemes = splitGraphemes(currentLine);
        let broken = '';
        for (const g of graphemes) {
          const nextWidth = measureTextWidthAtBaseSize(broken + g, fontFamily) * fontSizePx;
          if (nextWidth > maxWidthPx && broken.length > 0) {
            lines.push(broken);
            broken = g;
          } else {
            broken += g;
          }
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
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A run is a logical paragraph within an editable block: the consecutive visual
 * lines that were soft-wrapped from the same paragraph, merged into one flowing
 * string. A new run begins where the source indents a line (a new paragraph) or
 * leaves a vertical gap. Rendering one editor `<div>` per run (instead of one
 * per visual line) lets the contentEditable reflow text naturally as the user
 * types, instead of trapping each original line in its own fixed-width block.
 */
export interface IParagraphRun {
  /** Representative line (the run's first) — supplies font, size, color, indent. */
  firstLine: IParagraphLine;
  /** The run's visual lines joined by spaces (one flowing paragraph). */
  text: string;
  /** First-line indent relative to the paragraph's left edge, in px. */
  indent: number;
}

// Hyphen-minus, soft hyphen, and the Unicode hyphen — a trailing one marks a word
// broken across the line break, so the two halves join with no separator
// ("Col-"+"laboration" → "Col-laboration") instead of a stray space.
const TRAILING_HYPHEN = /[-­‐]$/;

/** Join soft-wrapped line texts into one flowing string (hyphen-aware). */
export function joinSoftWrappedLines(lineTexts: string[]): string {
  let text = '';
  for (let i = 0; i < lineTexts.length; i++) {
    if (i === 0) text = lineTexts[i];
    else text += (TRAILING_HYPHEN.test(lineTexts[i - 1]) ? '' : ' ') + lineTexts[i];
  }
  return text;
}

function makeParagraphRun(lines: IParagraphLine[], paragraphLeft: number): IParagraphRun {
  return {
    firstLine: lines[0],
    text: joinSoftWrappedLines(lines.map((l) => l.text)),
    indent: Math.max(0, lines[0].rect.left - paragraphLeft),
  };
}

/** A line that ends with sentence-final punctuation (optionally a closing quote/bracket). */
const SENTENCE_END = /[.!?…]['")\]”’]*\s*$/;

/**
 * Group an editable paragraph's visual line *indices* into runs (logical
 * paragraphs). Soft-wrapped lines of one paragraph are merged; a new run starts
 * at a real break. A break is detected when:
 *  - the line is indented (a new paragraph), or follows a clear vertical gap; or
 *  - the previous line ENDED EARLY — its next word would have fit on it, so it
 *    was a complete line, not a wrap (a list item, a line of verse, a heading); or
 *  - in a block whose lines mostly DON'T reach the right margin (distinct short
 *    lines, e.g. each sentence on its own line), the previous line ends a sentence.
 *
 * The sentence-end rule is gated on the "mostly short" classification so it can't
 * fragment a normal wrapped paragraph at a mid-paragraph sentence boundary
 * (common in justified text, where every line reaches the margin).
 */
export function groupParagraphLineIndices(paragraph: IEditableParagraph): number[][] {
  const lines = paragraph.lines;
  if (lines.length === 0) return [];
  const fontSizePx = Math.max(1, ...lines.map((l) => l.fontSizePx));
  const indentThreshold = fontSizePx * 0.5;

  const lineRight = (l: IParagraphLine) => l.rect.left + l.rect.width;
  const columnRight = Math.max(...lines.map(lineRight));
  const columnLeft = Math.min(...lines.map((l) => l.rect.left));
  const columnWidth = Math.max(1, columnRight - columnLeft);
  // Fraction of non-last lines that reach near the right margin. A wrapped
  // paragraph fills almost every line; a set of distinct short lines does not.
  const fullThreshold = columnWidth * 0.15;
  let fullCount = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (columnRight - lineRight(lines[i]) < fullThreshold) fullCount++;
  }
  const distinctLines = lines.length > 1 && fullCount / (lines.length - 1) < 0.5;

  const groups: number[][] = [[0]];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const line = lines[i];
    const indented = line.rect.left - prev.rect.left > indentThreshold;
    const gap = line.rect.top - prev.rect.top > Math.max(prev.rect.height, fontSizePx) * 1.6;
    // Would the next line's first word have fit on the previous line? If so the
    // previous line ended early (a complete line), not because text wrapped.
    const available = columnRight - lineRight(prev);
    const trimmed = line.text.trim();
    const firstWord = trimmed.split(/\s+/)[0] ?? '';
    const avgCharW = trimmed.length > 0 ? line.rect.width / trimmed.length : fontSizePx * 0.5;
    const endedEarly = available >= (firstWord.length + 1) * avgCharW;
    const sentenceEnd = distinctLines && SENTENCE_END.test(prev.text);
    if (indented || gap || endedEarly || sentenceEnd) groups.push([i]);
    else groups[groups.length - 1].push(i);
  }
  return groups;
}

/** Group a paragraph's visual lines into runs (see {@link groupParagraphLineIndices}). */
export function groupParagraphRuns(paragraph: IEditableParagraph): IParagraphRun[] {
  return groupParagraphLineIndices(paragraph).map((idxs) =>
    makeParagraphRun(
      idxs.map((i) => paragraph.lines[i]),
      paragraph.rect.left,
    ),
  );
}

/**
 * The editor's baseline text for an unedited paragraph: one run per line, runs
 * joined by newlines. Matches the contentEditable's `innerText` when nothing has
 * been typed, so change-detection compares like with like. (Differs from
 * `paragraph.text`, which joins every visual line — including soft wraps — with a
 * newline; the editor now merges soft wraps into a flowing run.)
 */
export function paragraphEditorText(paragraph: IEditableParagraph): string {
  return groupParagraphRuns(paragraph)
    .map((run) => run.text)
    .join('\n');
}

function buildLineDivHtml(
  line: IParagraphLine,
  paragraphLeft: number,
  paragraphWidth: number,
  lineHeightPx: number,
  text: string,
): string {
  // Preserve the paragraph's first-line indent. Each div now holds a whole
  // flowing paragraph, so the indent must apply to the FIRST visual line only —
  // text-indent does exactly that, whereas margin-left would shift every wrapped
  // line. The div keeps the full paragraph width (text-indent automatically
  // narrows just the first line). text-indent is inside the scaleX transform, so
  // it is divided by scaleX to land at the intended visual offset after scaling.
  const indent = Math.max(0, line.rect.left - paragraphLeft);
  const width = (paragraphWidth / line.scaleX) * 1.03;
  const styleParts = [
    `font-family:${line.fontFamily}`,
    `font-size:${line.fontSizePx}px`,
    `line-height:${lineHeightPx}px`,
    `color:${line.color}`,
    `transform:scaleX(${line.scaleX})`,
    `transform-origin:0 0`,
    `text-indent:${indent / line.scaleX}px`,
    `width:${width}px`,
    `white-space:pre-wrap`,
    `word-break:break-word`,
  ].join(';');
  const safeStyle = styleParts.replace(/"/g, '&quot;');
  // Base (unformatted) values are stamped as data attributes so the floating
  // formatting toolbar can re-derive them when applying/removing overrides live
  // (e.g. restoring the original font size after a scale change) without
  // rebuilding the editor's innerHTML and disturbing the caret.
  const dataAttrs = [
    `data-base-fontsize="${line.fontSizePx}"`,
    `data-base-lineheight="${lineHeightPx}"`,
    `data-base-fontfamily="${line.fontFamily.replace(/"/g, '&quot;')}"`,
    `data-base-color="${line.color.replace(/"/g, '&quot;')}"`,
  ].join(' ');
  return `<div style="${safeStyle}" ${dataAttrs}>${escapeHtml(text)}</div>`;
}

/**
 * Builds the initial innerHTML for the contentEditable editor — ONE `<div>` per
 * original visual line, with that line's exact text. This reproduces the source
 * PDF's line breaks exactly when the editor opens (no reflow jump). On the first
 * keystroke the editor is converted in place to the flowing per-paragraph layout
 * (see {@link convertEditorToFlowing}) so typing reflows naturally.
 */
export function buildEditorHtml(paragraph: IEditableParagraph, lineHeightPx: number): string {
  return paragraph.lines
    .map((line) =>
      buildLineDivHtml(line, paragraph.rect.left, paragraph.rect.width, lineHeightPx, line.text),
    )
    .join('');
}

/**
 * Build the flowing (one div per logical paragraph) innerHTML from the editor's
 * CURRENT per-line texts — used to convert an open per-line editor to flowing on
 * the first edit. When the line count still matches the source, soft-wrapped
 * lines are merged by the original run grouping; otherwise (the user already
 * split/merged lines) each current line becomes its own flowing div.
 */
export function buildFlowingEditorHtmlFromLineTexts(
  paragraph: IEditableParagraph,
  lineHeightPx: number,
  lineTexts: string[],
): string {
  if (paragraph.lines.length === 0) return '';
  const div = (line: IParagraphLine, text: string) =>
    buildLineDivHtml(line, paragraph.rect.left, paragraph.rect.width, lineHeightPx, text);

  if (lineTexts.length === paragraph.lines.length) {
    return groupParagraphLineIndices(paragraph)
      .map((idxs) =>
        div(paragraph.lines[idxs[0]], joinSoftWrappedLines(idxs.map((i) => lineTexts[i]))),
      )
      .join('');
  }
  // Structure changed since mount (e.g. Enter pressed first) — keep each current
  // line as its own flowing run rather than risk a wrong merge.
  return lineTexts
    .map((t, i) => div(paragraph.lines[Math.min(i, paragraph.lines.length - 1)], t))
    .join('');
}

/**
 * Convert an open per-line editor to the flowing per-paragraph layout in place,
 * preserving the caret. A sentinel character is inserted at the caret, carried
 * through the rebuild, then located and removed — so the caret lands exactly
 * where it was regardless of how lines merge.
 */
export function convertEditorToFlowing(
  editor: HTMLElement,
  paragraph: IEditableParagraph,
  lineHeightPx: number,
): void {
  const MARKER = String.fromCharCode(0xe000); // PUA sentinel, removed after rebuild
  const selection = window.getSelection();
  let markerInserted = false;
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (editor.contains(range.startContainer)) {
      range.collapse(true);
      range.insertNode(document.createTextNode(MARKER));
      markerInserted = true;
    }
  }

  const lineTexts = Array.from(editor.children).map((c) => c.textContent ?? '');
  if (lineTexts.length === 0) lineTexts.push(editor.textContent ?? '');
  editor.innerHTML = buildFlowingEditorHtmlFromLineTexts(paragraph, lineHeightPx, lineTexts);

  if (!markerInserted || !selection) return;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue ?? '';
    const at = value.indexOf(MARKER);
    if (at >= 0) {
      node.nodeValue = value.slice(0, at) + value.slice(at + MARKER.length);
      const caret = document.createRange();
      caret.setStart(node, at);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      return;
    }
    node = walker.nextNode();
  }
}

/**
 * Rebuilds editor innerHTML from saved plain text using the paragraph's per-run
 * styles. Used to restore editor state across virtualized unmount without
 * trusting the prior HTML. Each saved line (separated by `\n`) is one run.
 */
export function buildEditorHtmlFromText(
  paragraph: IEditableParagraph,
  lineHeightPx: number,
  savedText: string,
): string {
  if (paragraph.lines.length === 0) return '';
  const runs = groupParagraphRuns(paragraph);
  const fallbackLine = paragraph.lines[0];
  return savedText
    .split('\n')
    .map((segText, i) => {
      const styleLine = runs[Math.min(i, runs.length - 1)]?.firstLine ?? fallbackLine;
      return buildLineDivHtml(
        styleLine,
        paragraph.rect.left,
        paragraph.rect.width,
        lineHeightPx,
        segText,
      );
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

// ─── Formatting overrides (Edit Text mode) ──────────────────────────────────

/** CSS font-family stack for a selectable family. Empty string = keep original. */
export function mapEditFontFamily(family: EditFontFamily | undefined): string {
  switch (family) {
    case 'sans':
      return 'Helvetica, Arial, sans-serif';
    case 'serif':
      return '"Times New Roman", Times, serif';
    case 'mono':
      return '"Courier New", Courier, monospace';
    default:
      return '';
  }
}

/** Map a UI font-family choice to a standard PDF font for the commit (reflow). */
export function mapStandardFontFamily(
  family: EditFontFamily | undefined,
): StandardFontFamily | undefined {
  switch (family) {
    case 'sans':
      return 'Helvetica';
    case 'serif':
      return 'Times-Roman';
    case 'mono':
      return 'Courier';
    default:
      return undefined;
  }
}

/** True when an override carries no effective change from the original style. */
export function isFormatOverrideEmpty(o: IParagraphFormatOverride | undefined): boolean {
  if (!o) return true;
  const scaleIsOne = !o.fontScale || o.fontScale === 1;
  const alignDefault = !o.align || o.align === 'left';
  const familyDefault = !o.fontFamily || o.fontFamily === 'original';
  return scaleIsOne && !o.bold && !o.italic && !o.color && alignDefault && familyDefault;
}

/**
 * Apply a paragraph formatting override to a live contentEditable editor by
 * mutating each per-line `<div>`'s inline styles. Reads the stamped
 * `data-base-*` attributes so values fall back to the originals when a field is
 * cleared. Mutating styles (rather than rebuilding innerHTML) keeps the caret
 * and any active selection intact while the user clicks toolbar controls.
 */
export function applyFormatOverrideToEditor(
  editor: HTMLElement,
  override: IParagraphFormatOverride | undefined,
): void {
  const scale = override?.fontScale && override.fontScale > 0 ? override.fontScale : 1;
  const familyCss =
    override?.fontFamily && override.fontFamily !== 'original'
      ? mapEditFontFamily(override.fontFamily)
      : null;

  for (const node of Array.from(editor.children)) {
    const div = node as HTMLElement;
    const baseFontSize = parseFloat(div.dataset.baseFontsize ?? '');
    const baseLineHeight = parseFloat(div.dataset.baseLineheight ?? '');
    if (!Number.isNaN(baseFontSize)) div.style.fontSize = `${baseFontSize * scale}px`;
    if (!Number.isNaN(baseLineHeight)) div.style.lineHeight = `${baseLineHeight * scale}px`;
    div.style.color = override?.color ?? div.dataset.baseColor ?? '';
    div.style.fontWeight = override?.bold ? '700' : 'normal';
    div.style.fontStyle = override?.italic ? 'italic' : 'normal';
    div.style.textAlign = override?.align ?? 'left';
    div.style.fontFamily = familyCss ?? div.dataset.baseFontfamily ?? '';
  }
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
