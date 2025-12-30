import { useCallback, useState } from 'react';
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
  currentPath: IPoint[];
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
  const [currentPath, setCurrentPath] = useState<IPoint[]>([]);

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

  const finish = useCallback(() => {
    if (!isDrawing || !selectedTool || currentPath.length === 0) {
      setIsDrawing(false);
      setCurrentPath([]);
      return;
    }

    // Only handle DRAW tool - highlight is now text-selection based
    if (selectedTool === 'draw') {
      const annotation: IDrawAnnotation = {
        id: generateAnnotationId('draw'),
        type: 'draw',
        source: 'overlay',
        pageIndex,
        points: currentPath,
        color: ANNOTATION_COLORS.DRAW,
        strokeWidth: ANNOTATION_STROKE_WIDTH.DRAW,
        createdAt: Date.now(),
      };
      onAddAnnotation(annotation);
    }

    setIsDrawing(false);
    setCurrentPath([]);
  }, [currentPath, isDrawing, onAddAnnotation, pageIndex, selectedTool]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!selectedTool || selectedTool !== 'draw') return;
      const p = getPoint(e);
      if (!p) return;
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
      setIsDrawing(true);
      setCurrentPath([p]);
    },
    [getPoint, selectedTool],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !selectedTool) return;
      const p = getPoint(e);
      if (!p) return;
      setCurrentPath((prev) => [...prev, p]);
    },
    [getPoint, isDrawing, selectedTool],
  );

  const onPointerUp = useCallback(() => finish(), [finish]);
  const onPointerCancel = useCallback(() => finish(), [finish]);

  return {
    isDrawing,
    currentPath,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
