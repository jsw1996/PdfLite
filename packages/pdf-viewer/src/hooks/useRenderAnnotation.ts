import React, { useCallback, useEffect, useMemo, type RefObject } from 'react';
import {
  type IAnnotation,
  type IPoint,
  type AnnotationType,
  isDrawAnnotation,
  isHighlightAnnotation,
  isSignatureAnnotation,
  renderAnnotation,
  drawAnnotationBounds,
  DRAW_TOOL_DEFAULTS,
} from '../annotations';
import { SignatureBox } from '../components/AnnotationLayer/SignatureBox';

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
  /** Live in-progress stroke (ref); read at draw time so it doesn't drive re-renders. */
  currentPathRef: RefObject<IPoint[]>;
  /** Stroke color for the draw tool live preview (CSS color string) */
  drawColor?: string;
  /** Stroke width for the draw tool live preview (logical px at scale=1) */
  drawStrokeWidth?: number;
  /** Id of the selected draw stroke, to render a selection box around it */
  selectedDrawId?: string | null;
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

/** Draw a dashed selection box around a stroke's bounds. */
function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  bounds: { left: number; top: number; width: number; height: number },
) {
  const pad = 3;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(162, 0, 255, 0.9)';
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(
    bounds.left - pad,
    bounds.top - pad,
    bounds.width + pad * 2,
    bounds.height + pad * 2,
  );
  ctx.restore();
}

export function useRenderAnnotation({
  highlightCanvasRef,
  drawCanvasRef,
  metrics,
  annotations,
  selectedTool,
  currentPathRef,
  drawColor = DRAW_TOOL_DEFAULTS.COLOR,
  drawStrokeWidth = DRAW_TOOL_DEFAULTS.STROKE_WIDTH,
  selectedDrawId = null,
}: IUseRenderAnnotationOptions): {
  signatureAnnotations: React.ReactElement[];
} {
  // Derive signature annotations from annotations using useMemo
  const signatureAnnotations = useMemo(() => {
    return annotations.filter(isSignatureAnnotation).map((a) =>
      React.createElement(SignatureBox, {
        key: a.id,
        id: a.id,
        position: a.position,
        imageDataUrl: a.imageDataUrl,
        width: a.width,
        height: a.height,
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
      // Native annotations are already painted into the page bitmap by PDFium
      // (the FPDF_ANNOT render flag). Re-drawing them on the overlay would
      // double-render them — visibly thickening/darkening ink strokes and
      // highlights, with edge fringing where the overlay's straight polyline
      // diverges from PDFium's appearance. The overlay canvases exist only for
      // uncommitted (source === 'overlay') annotations.
      if (annotation.source === 'native') continue;
      if (isHighlightAnnotation(annotation)) {
        renderAnnotation(hctx, annotation);
      } else if (isDrawAnnotation(annotation)) {
        renderAnnotation(dctx, annotation);
      }
    }

    // Outline the selected draw stroke (if it lives on this page).
    if (selectedDrawId) {
      const selected = annotations.find((a) => a.id === selectedDrawId);
      if (selected && isDrawAnnotation(selected)) {
        drawSelectionBox(dctx, drawAnnotationBounds(selected));
      }
    }

    // Draw current path preview (live drawing). Read the live ref so a redraw
    // triggered for other reasons (annotation/metrics change) re-paints the
    // in-progress stroke; per-segment drawing during a stroke is handled in useInk.
    const currentPath = currentPathRef.current;
    if (selectedTool && currentPath.length > 0) {
      if (selectedTool === 'draw') {
        // Match the live preview to the active draw style so the stroke does
        // not change appearance when it's committed to a stored draw annotation.
        drawStrokePreview(dctx, currentPath, drawColor, drawStrokeWidth);
      }
    }
  }, [
    annotations,
    currentPathRef,
    highlightCanvasRef,
    drawCanvasRef,
    metrics,
    selectedTool,
    drawColor,
    drawStrokeWidth,
    selectedDrawId,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return { signatureAnnotations };
}
