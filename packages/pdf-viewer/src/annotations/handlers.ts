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
 * Handler interface for annotation operations
 */
export interface IAnnotationHandler<T extends IAnnotation> {
  /** Render the annotation to a canvas context */
  render(ctx: CanvasRenderingContext2D, annotation: T): void;
  /** Commit the annotation to PDFium */
  commit(controller: PdfController, annotation: T): void;
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

function commitDrawAnnotation(controller: PdfController, annotation: IDrawAnnotation): void {
  // Draw annotations are committed as INK annotations
  // Points are already normalized to scale=1 (page coordinates)
  // We need at least 2 points for a valid ink stroke
  if (annotation.points.length < 2) return;

  controller.addInkHighlight(annotation.pageIndex, {
    scale: 1,
    canvasPoints: annotation.points,
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
  // Commit each rect as a separate highlight annotation
  for (const rect of annotation.rects) {
    controller.addHighlightAnnotation(annotation.pageIndex, {
      scale: 1,
      canvasRect: rect,
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

function commitTextAnnotation(controller: PdfController, annotation: ITextAnnotation): void {
  const { position, content, fontSize, dimensions } = annotation;

  // Use dimensions if available, otherwise estimate based on content
  const width =
    dimensions?.width ??
    Math.max(content.length * fontSize * 0.6, TEXT_ANNOTATION_DEFAULTS.MIN_WIDTH);
  const height = dimensions?.height ?? fontSize * 1.5;

  controller.addTextAnnotation(annotation.pageIndex, {
    scale: 1,
    canvasRect: {
      left: position.x,
      top: position.y,
      width,
      height,
    },
    text: content,
    fontSize,
    fontColor: TEXT_ANNOTATION_DEFAULTS.FONT_COLOR_RGB,
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
export function commitAnnotation(controller: PdfController, annotation: IAnnotation): void {
  getHandler(annotation.type).commit(controller, annotation);
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
