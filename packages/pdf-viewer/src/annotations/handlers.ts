/**
 * Annotation handlers provide type-specific logic for rendering, committing, and normalizing annotations.
 * This pattern allows for easy extension when adding new annotation types.
 */

import type { PdfController } from '@pdfviewer/controller';
import type {
  IAnnotation,
  IDrawAnnotation,
  IHighlightAnnotation,
  ITextAnnotation,
  ISignatureAnnotation,
  IRect,
} from './types';
import { TEXT_ANNOTATION_DEFAULTS } from './constants';

/**
 * Canvas metrics for coordinate transformations
 */
export interface ICanvasMetrics {
  top: number;
  left: number;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * Optional context passed through to commit handlers.
 */
export interface ICommitContext {
  /**
   * Handle from PdfController.loadEmbeddedFont(), used so added text containing
   * non-Latin (e.g. CJK) glyphs embeds a real font instead of base-14 Helvetica.
   */
  embeddedFontPtr?: number;
}

/**
 * Handler interface for annotation operations
 */
export interface IAnnotationHandler<T extends IAnnotation> {
  /** Render the annotation to a canvas context */
  render(ctx: CanvasRenderingContext2D, annotation: T): void;
  /** Commit the annotation to PDFium */
  commit(controller: PdfController, annotation: T, ctx?: ICommitContext): void;
  /** Normalize coordinates when scale changes (scale-independent storage) */
  normalize(annotation: T, scale: number): T;
  /** Denormalize coordinates for rendering at current scale */
  denormalize(annotation: T, scale: number): T;
}

// =============================================================================
// Draw Annotation Handler
// =============================================================================

function renderDrawAnnotation(ctx: CanvasRenderingContext2D, annotation: IDrawAnnotation): void {
  const { points, color, strokeWidth } = annotation;
  if (points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Parse a CSS `rgb()`/`rgba()` string into 0-255 channel values. */
function parseRgbColor(color: string): { r: number; g: number; b: number; a: number } | undefined {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(
    color,
  );
  if (!m) return undefined;
  return {
    r: Math.round(Number(m[1])),
    g: Math.round(Number(m[2])),
    b: Math.round(Number(m[3])),
    a: m[4] !== undefined ? Math.round(Number(m[4]) * 255) : 255,
  };
}

function commitDrawAnnotation(controller: PdfController, annotation: IDrawAnnotation): void {
  // Draw annotations are committed as INK annotations
  // Points are already normalized to scale=1 (page coordinates)
  // We need at least 2 points for a valid ink stroke
  if (annotation.points.length < 2) return;

  // Points were already smoothed at stroke-finish (see useInk), so the saved
  // ink matches what's shown on the canvas. Re-smoothing here would over-round
  // the stroke, so we commit the stored points as-is.
  //
  // Pass the annotation's own color and stroke width through. Without these,
  // addInkHighlight falls back to the highlighter defaults (yellow, width 14),
  // which made downloaded strokes far thicker than the on-screen preview.
  controller.addInkHighlight(annotation.pageIndex, {
    scale: 1,
    canvasPoints: annotation.points,
    color: parseRgbColor(annotation.color),
    borderWidth: annotation.strokeWidth,
  });
}

function normalizeDrawAnnotation(annotation: IDrawAnnotation, scale: number): IDrawAnnotation {
  return {
    ...annotation,
    points: annotation.points.map((p) => ({ x: p.x / scale, y: p.y / scale })),
    strokeWidth: annotation.strokeWidth / scale,
  };
}

function denormalizeDrawAnnotation(annotation: IDrawAnnotation, scale: number): IDrawAnnotation {
  return {
    ...annotation,
    points: annotation.points.map((p) => ({ x: p.x * scale, y: p.y * scale })),
    strokeWidth: annotation.strokeWidth * scale,
  };
}

export const drawHandler: IAnnotationHandler<IDrawAnnotation> = {
  render: renderDrawAnnotation,
  commit: commitDrawAnnotation,
  normalize: normalizeDrawAnnotation,
  denormalize: denormalizeDrawAnnotation,
};

// =============================================================================
// Highlight Annotation Handler
// =============================================================================

function renderHighlightAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: IHighlightAnnotation,
): void {
  const { rects, color } = annotation;

  ctx.save();
  ctx.globalAlpha = 1; // Let CSS mix-blend-mode handle transparency
  ctx.fillStyle = color;

  for (const rect of rects) {
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  }
  ctx.restore();
}

function commitHighlightAnnotation(
  controller: PdfController,
  annotation: IHighlightAnnotation,
): void {
  const rgb = parseRgbColor(annotation.color);
  // Commit each rect as a separate highlight annotation
  for (const rect of annotation.rects) {
    controller.addHighlightAnnotation(annotation.pageIndex, {
      scale: 1,
      canvasRect: rect,
      color: rgb ? { r: rgb.r, g: rgb.g, b: rgb.b } : undefined,
    });
  }
}

function normalizeHighlightAnnotation(
  annotation: IHighlightAnnotation,
  scale: number,
): IHighlightAnnotation {
  return {
    ...annotation,
    rects: annotation.rects.map((r) => ({
      left: r.left / scale,
      top: r.top / scale,
      width: r.width / scale,
      height: r.height / scale,
    })),
  };
}

function denormalizeHighlightAnnotation(
  annotation: IHighlightAnnotation,
  scale: number,
): IHighlightAnnotation {
  return {
    ...annotation,
    rects: annotation.rects.map((r) => ({
      left: r.left * scale,
      top: r.top * scale,
      width: r.width * scale,
      height: r.height * scale,
    })),
  };
}

export const highlightHandler: IAnnotationHandler<IHighlightAnnotation> = {
  render: renderHighlightAnnotation,
  commit: commitHighlightAnnotation,
  normalize: normalizeHighlightAnnotation,
  denormalize: denormalizeHighlightAnnotation,
};

// =============================================================================
// Text Annotation Handler
// =============================================================================

// Text annotations are rendered as DOM elements (TextBox), not on canvas
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function renderTextAnnotation(_ctx: CanvasRenderingContext2D, _annotation: ITextAnnotation): void {
  // No-op: Text annotations are rendered as React components
}

/**
 * Split text into visual lines based on available width, matching the
 * word-break: break-all behavior used in the TextBox textarea.
 */
function wrapTextToLines(text: string, fontSize: number, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [text];
  ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    let currentLine = '';
    for (const char of paragraph) {
      const testLine = currentLine + char;
      if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [''];
}

/** Parse a CSS rgb()/hex color string into 0-255 RGB components. */
function cssColorToRgb255(color: string): { r: number; g: number; b: number } | null {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

function commitTextAnnotation(
  controller: PdfController,
  annotation: ITextAnnotation,
  ctx?: ICommitContext,
): void {
  const { position, content, fontSize, dimensions } = annotation;

  // Skip empty boxes — nothing to flatten into the page.
  if (!content.trim()) return;

  // Use dimensions if available, otherwise estimate based on content
  const width =
    dimensions?.width ??
    Math.max(content.length * fontSize * 0.6, TEXT_ANNOTATION_DEFAULTS.MIN_WIDTH);
  const height = dimensions?.height ?? fontSize * 1.5;

  // Wrap text into visual lines matching the textarea's word-break: break-all
  const lines = wrapTextToLines(content, fontSize, width);

  controller.addTextAnnotation(annotation.pageIndex, {
    scale: 1,
    canvasRect: {
      left: position.x,
      top: position.y,
      width,
      height,
    },
    lines,
    fontSize,
    fontColor: cssColorToRgb255(annotation.fontColor) ?? TEXT_ANNOTATION_DEFAULTS.FONT_COLOR_RGB,
    bold: annotation.fontWeight === 'bold',
    italic: annotation.fontStyle === 'italic',
    embeddedFontPtr: ctx?.embeddedFontPtr,
  });
}

function normalizeTextAnnotation(annotation: ITextAnnotation, scale: number): ITextAnnotation {
  return {
    ...annotation,
    position: {
      x: annotation.position.x / scale,
      y: annotation.position.y / scale,
    },
    fontSize: annotation.fontSize / scale,
    dimensions: annotation.dimensions
      ? {
          width: annotation.dimensions.width / scale,
          height: annotation.dimensions.height / scale,
        }
      : undefined,
  };
}

function denormalizeTextAnnotation(annotation: ITextAnnotation, scale: number): ITextAnnotation {
  return {
    ...annotation,
    position: {
      x: annotation.position.x * scale,
      y: annotation.position.y * scale,
    },
    fontSize: annotation.fontSize * scale,
    dimensions: annotation.dimensions
      ? {
          width: annotation.dimensions.width * scale,
          height: annotation.dimensions.height * scale,
        }
      : undefined,
  };
}

export const textHandler: IAnnotationHandler<ITextAnnotation> = {
  render: renderTextAnnotation,
  commit: commitTextAnnotation,
  normalize: normalizeTextAnnotation,
  denormalize: denormalizeTextAnnotation,
};

// =============================================================================
// Signature Annotation Handler
// =============================================================================

// Signature annotations are rendered as DOM elements (SignatureBox), not on canvas
function renderSignatureAnnotation(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: CanvasRenderingContext2D,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _annotation: ISignatureAnnotation,
): void {
  // No-op: Signature annotations are rendered as React components
}

function commitSignatureAnnotation(
  controller: PdfController,
  annotation: ISignatureAnnotation,
): void {
  controller.addImageObject(annotation.pageIndex, {
    scale: 1,
    canvasRect: {
      left: annotation.position.x,
      top: annotation.position.y,
      width: annotation.width,
      height: annotation.height,
    },
    imageRgbaBytes: annotation.imageRgbaBytes,
    imageWidthPx: annotation.imageWidthPx,
    imageHeightPx: annotation.imageHeightPx,
  });
}

function normalizeSignatureAnnotation(
  annotation: ISignatureAnnotation,
  scale: number,
): ISignatureAnnotation {
  return {
    ...annotation,
    position: {
      x: annotation.position.x / scale,
      y: annotation.position.y / scale,
    },
    width: annotation.width / scale,
    height: annotation.height / scale,
  };
}

function denormalizeSignatureAnnotation(
  annotation: ISignatureAnnotation,
  scale: number,
): ISignatureAnnotation {
  return {
    ...annotation,
    position: {
      x: annotation.position.x * scale,
      y: annotation.position.y * scale,
    },
    width: annotation.width * scale,
    height: annotation.height * scale,
  };
}

export const signatureHandler: IAnnotationHandler<ISignatureAnnotation> = {
  render: renderSignatureAnnotation,
  commit: commitSignatureAnnotation,
  normalize: normalizeSignatureAnnotation,
  denormalize: denormalizeSignatureAnnotation,
};

// =============================================================================
// Handler Registry
// =============================================================================

/**
 * Get the appropriate handler for an annotation type
 */
export function getHandler(type: 'draw'): IAnnotationHandler<IDrawAnnotation>;
export function getHandler(type: 'highlight'): IAnnotationHandler<IHighlightAnnotation>;
export function getHandler(type: 'text'): IAnnotationHandler<ITextAnnotation>;
export function getHandler(type: 'signature'): IAnnotationHandler<ISignatureAnnotation>;
export function getHandler(type: IAnnotation['type']): IAnnotationHandler<IAnnotation>;
export function getHandler(type: IAnnotation['type']): IAnnotationHandler<IAnnotation> {
  switch (type) {
    case 'draw':
      return drawHandler as IAnnotationHandler<IAnnotation>;
    case 'highlight':
      return highlightHandler as IAnnotationHandler<IAnnotation>;
    case 'text':
      return textHandler as IAnnotationHandler<IAnnotation>;
    case 'signature':
      return signatureHandler as IAnnotationHandler<IAnnotation>;
  }
}

/**
 * Normalize any annotation based on its type
 */
export function normalizeAnnotation(annotation: IAnnotation, scale: number): IAnnotation {
  return getHandler(annotation.type).normalize(annotation, scale);
}

/**
 * Denormalize any annotation based on its type
 */
export function denormalizeAnnotation(annotation: IAnnotation, scale: number): IAnnotation {
  return getHandler(annotation.type).denormalize(annotation, scale);
}

/**
 * Render any annotation based on its type
 */
export function renderAnnotation(ctx: CanvasRenderingContext2D, annotation: IAnnotation): void {
  getHandler(annotation.type).render(ctx, annotation);
}

/**
 * Commit any annotation based on its type
 */
export function commitAnnotation(
  controller: PdfController,
  annotation: IAnnotation,
  ctx?: ICommitContext,
): void {
  getHandler(annotation.type).commit(controller, annotation, ctx);
}

/**
 * Convert rects to a bounding box (useful for highlight annotations)
 */
export function rectsToBoundingBox(rects: IRect[]): IRect {
  if (rects.length === 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;

  for (const rect of rects) {
    minLeft = Math.min(minLeft, rect.left);
    minTop = Math.min(minTop, rect.top);
    maxRight = Math.max(maxRight, rect.left + rect.width);
    maxBottom = Math.max(maxBottom, rect.top + rect.height);
  }

  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}
