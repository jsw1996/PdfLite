import { useCallback, useState } from 'react';
import { AnnotationType, type IAnnotation, type IPoint } from '../types/annotation';

const DEFAULT_HIGHLIGHT_COLOR = 'rgb(248, 196, 72)';

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
  onCommitHighlight,
}: IUseInkOptions): IUseInkResult {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<IPoint[]>([]);

  const getPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): IPoint | null => {
      const c = canvasRef.current;
      if (!c || !metrics) return null;
      const rect = c.getBoundingClientRect();
      // 返回"CSS 像素坐标"（逻辑坐标），避免 devicePixelRatio 造成的坐标错位
      // 实际绘制时在 redraw 里通过 ctx.setTransform(pixelRatio,...) 映射到物理像素
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

    // 默认颜色：黄色
    const color = DEFAULT_HIGHLIGHT_COLOR;
    const strokeWidth = selectedTool === AnnotationType.HIGHLIGHT ? 14 : 2;
    const ann: IAnnotation = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: selectedTool,
      shape: 'stroke',
      source: 'overlay',
      pageIndex,
      points: currentPath,
      color,
      strokeWidth,
      createdAt: Date.now(),
    };
    onAddAnnotation(ann);
    if (selectedTool === AnnotationType.HIGHLIGHT) {
      onCommitHighlight?.({ pageIndex, canvasPoints: currentPath });
    }
    setIsDrawing(false);
    setCurrentPath([]);
  }, [currentPath, isDrawing, onAddAnnotation, onCommitHighlight, pageIndex, selectedTool]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!selectedTool) return;
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
