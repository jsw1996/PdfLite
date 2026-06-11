import { useCallback, useRef, useState } from 'react';
import {
  type IAnnotation,
  type IDrawAnnotation,
  type IPoint,
  type AnnotationType,
  generateAnnotationId,
  ANNOTATION_COLORS,
  ANNOTATION_STROKE_WIDTH,
} from '../annotations';

interface ICanvasMetrics {
  top: number;
  left: number;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface IUseInkOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  metrics: ICanvasMetrics | null;
  selectedTool: AnnotationType | null;
  pageIndex: number;
  onAddAnnotation: (annotation: IAnnotation) => void;
  onCommitHighlight?: (args: { pageIndex: number; canvasPoints: IPoint[] }) => void;
}

export interface IUseInkResult {
  isDrawing: boolean;
  /**
   * Live in-progress stroke, held in a ref so per-pointermove updates do NOT
   * trigger React re-renders / full-layer redraws. The render hook reads this
   * for previewing when it redraws for other reasons (annotation/metrics change).
   */
  currentPathRef: React.RefObject<IPoint[]>;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}

export function useInk({
  canvasRef,
  metrics,
  selectedTool,
  pageIndex,
  onAddAnnotation,
}: IUseInkOptions): IUseInkResult {
  const [isDrawing, setIsDrawing] = useState(false);
  // Path is kept in a ref (not state): a dense stroke fires many pointermove
  // events, and updating state on each would re-render AnnotationLayer and
  // redraw every committed annotation (O(n^2)). Instead we draw each new segment
  // incrementally to the canvas and only touch React state on stroke start/end.
  const currentPathRef = useRef<IPoint[]>([]);

  const getPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): IPoint | null => {
      const c = canvasRef.current;
      if (!c || !metrics) return null;
      const rect = c.getBoundingClientRect();
      // Return CSS pixel coordinates (logical coordinates)
      // Actual rendering maps these to physical pixels via ctx.setTransform
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return { x, y };
    },
    [canvasRef, metrics],
  );

  // Draw a single new segment onto the draw canvas using the same logical->physical
  // transform and stroke style the render hook's preview uses, so an incremental
  // draw and a full redraw look identical.
  const drawSegment = useCallback(
    (from: IPoint, to: IPoint) => {
      const c = canvasRef.current;
      if (!c || !metrics) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const sx = metrics.cssWidth > 0 ? metrics.pixelWidth / metrics.cssWidth : 1;
      const sy = metrics.cssHeight > 0 ? metrics.pixelHeight / metrics.cssHeight : 1;
      ctx.save();
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ANNOTATION_COLORS.HIGHLIGHT;
      ctx.lineWidth = ANNOTATION_STROKE_WIDTH.DRAW;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    },
    [canvasRef, metrics],
  );

  const finish = useCallback(() => {
    const path = currentPathRef.current;
    if (!isDrawing || !selectedTool || path.length === 0) {
      setIsDrawing(false);
      currentPathRef.current = [];
      return;
    }

    // Only handle DRAW tool - highlight is now text-selection based
    if (selectedTool === 'draw') {
      const annotation: IDrawAnnotation = {
        id: generateAnnotationId('draw'),
        type: 'draw',
        source: 'overlay',
        pageIndex,
        points: [...path],
        color: ANNOTATION_COLORS.DRAW,
        strokeWidth: ANNOTATION_STROKE_WIDTH.DRAW,
        createdAt: Date.now(),
      };
      onAddAnnotation(annotation);
    }

    setIsDrawing(false);
    currentPathRef.current = [];
  }, [isDrawing, onAddAnnotation, pageIndex, selectedTool]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!selectedTool || selectedTool !== 'draw') return;
      const p = getPoint(e);
      if (!p) return;
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
      setIsDrawing(true);
      currentPathRef.current = [p];
    },
    [getPoint, selectedTool],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !selectedTool) return;
      const p = getPoint(e);
      if (!p) return;
      const path = currentPathRef.current;
      const prev = path[path.length - 1];
      path.push(p);
      if (prev) drawSegment(prev, p);
    },
    [drawSegment, getPoint, isDrawing, selectedTool],
  );

  const onPointerUp = useCallback(() => finish(), [finish]);
  const onPointerCancel = useCallback(() => finish(), [finish]);

  return {
    isDrawing,
    currentPathRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
