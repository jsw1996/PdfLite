import React, { useCallback, useEffect, useMemo, type RefObject } from 'react';
import {
  type IAnnotation,
  type IPoint,
  type AnnotationType,
  isDrawAnnotation,
  isHighlightAnnotation,
  isTextAnnotation,
  renderAnnotation,
  ANNOTATION_COLORS,
  ANNOTATION_STROKE_WIDTH,
} from '../annotations';
import { TextBox } from '../components/AnnotationLayer/TextBox';

interface ICanvasMetrics {
  top: number;
  left: number;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface IUseRenderAnnotationOptions {
  highlightCanvasRef: RefObject<HTMLCanvasElement | null>;
  drawCanvasRef: RefObject<HTMLCanvasElement | null>;
  metrics: ICanvasMetrics | null;
  annotations: IAnnotation[];
  selectedTool: AnnotationType | null;
  currentPath: IPoint[];
}

/**
 * Draw a stroke path (for live drawing preview)
 */
function drawStrokePreview(
  ctx: CanvasRenderingContext2D,
  points: IPoint[],
  color: string,
  strokeWidth: number,
) {
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

export function useRenderAnnotation({
  highlightCanvasRef,
  drawCanvasRef,
  metrics,
  annotations,
  selectedTool,
  currentPath,
}: IUseRenderAnnotationOptions): { textAnnotations: React.ReactElement[] } {
  // Derive text annotations from annotations using useMemo
  const textAnnotations = useMemo(() => {
    return annotations.filter(isTextAnnotation).map((a) =>
      React.createElement(TextBox, {
        key: a.id,
        id: a.id,
        content: a.content,
        position: a.position,
        fontSize: a.fontSize,
        fontColor: a.fontColor,
      }),
    );
  }, [annotations]);

  const redraw = useCallback(() => {
    const hc = highlightCanvasRef.current;
    const dc = drawCanvasRef.current;
    if (!hc || !dc || !metrics) return;
    const hctx = hc.getContext('2d');
    const dctx = dc.getContext('2d');
    if (!hctx || !dctx) return;

    // Clear canvases (use identity matrix for physical pixels)
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.clearRect(0, 0, hc.width, hc.height);
    dctx.clearRect(0, 0, dc.width, dc.height);

    // Scale transform: logical coordinates -> physical pixels
    const sx = metrics.cssWidth > 0 ? metrics.pixelWidth / metrics.cssWidth : 1;
    const sy = metrics.cssHeight > 0 ? metrics.pixelHeight / metrics.cssHeight : 1;
    hctx.setTransform(sx, 0, 0, sy, 0, 0);
    dctx.setTransform(sx, 0, 0, sy, 0, 0);

    // Render annotations using handlers
    for (const annotation of annotations) {
      if (isHighlightAnnotation(annotation)) {
        renderAnnotation(hctx, annotation);
      } else if (isDrawAnnotation(annotation)) {
        renderAnnotation(dctx, annotation);
      }
      // Text annotations are rendered as React components, not on canvas
    }

    // Draw current path preview (live drawing)
    if (selectedTool && currentPath.length > 0) {
      const color = ANNOTATION_COLORS.HIGHLIGHT;
      if (selectedTool === 'draw') {
        const strokeWidth = ANNOTATION_STROKE_WIDTH.DRAW;
        drawStrokePreview(dctx, currentPath, color, strokeWidth);
      }
    }
  }, [annotations, currentPath, highlightCanvasRef, drawCanvasRef, metrics, selectedTool]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return { textAnnotations };
}
