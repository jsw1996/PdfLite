import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { AnnotationType, type IPoint, type IAnnotation } from '../../types/annotation';

export interface IAnnotationLayerProps {
  pageIndex: number;
  /** PDF 主画布，用于对齐位置/尺寸 */
  pdfCanvas: HTMLCanvasElement | null;
  onCommitHighlight?: (args: { pageIndex: number; canvasPoints: IPoint[] }) => void;
}

interface ICanvasMetrics {
  top: number;
  left: number;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}

function clampFinite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

const DEFAULT_HIGHLIGHT_COLOR = 'rgb(248, 196, 72)';

export const AnnotationLayer: React.FC<IAnnotationLayerProps> = ({
  pageIndex,
  pdfCanvas,
  onCommitHighlight,
}) => {
  const { selectedTool, addAnnotation, getAnnotationsForPage } = useAnnotation();
  const annotations = getAnnotationsForPage(pageIndex);

  const highlightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [metrics, setMetrics] = useState<ICanvasMetrics | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<IPoint[]>([]);

  const updateMetrics = useCallback(() => {
    if (!pdfCanvas) return;
    const rect = pdfCanvas.getBoundingClientRect();
    // offsetTop/Left 相对于最近的 position: relative 祖先（我们会在 ViewerPage 上加 relative）
    const top = pdfCanvas.offsetTop;
    const left = pdfCanvas.offsetLeft;

    setMetrics({
      top: clampFinite(top, 0),
      left: clampFinite(left, 0),
      cssWidth: clampFinite(rect.width, 0),
      cssHeight: clampFinite(rect.height, 0),
      pixelWidth: pdfCanvas.width,
      pixelHeight: pdfCanvas.height,
    });
  }, [pdfCanvas]);

  // 首次渲染时直接计算一次（避免 useEffect 中同步 setState 的 lint 报错）
  if (metrics === null && pdfCanvas) {
    const rect = pdfCanvas.getBoundingClientRect();
    setMetrics({
      top: clampFinite(pdfCanvas.offsetTop, 0),
      left: clampFinite(pdfCanvas.offsetLeft, 0),
      cssWidth: clampFinite(rect.width, 0),
      cssHeight: clampFinite(rect.height, 0),
      pixelWidth: pdfCanvas.width,
      pixelHeight: pdfCanvas.height,
    });
  }

  useEffect(() => {
    if (!pdfCanvas) return;
    const ro = new ResizeObserver(() => updateMetrics());
    ro.observe(pdfCanvas);
    window.addEventListener('resize', updateMetrics);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [pdfCanvas, updateMetrics]);

  const canInteract = selectedTool != null;

  const style = useMemo<React.CSSProperties>(() => {
    if (!metrics) return { display: 'none' };
    return {
      position: 'absolute',
      top: metrics.top,
      left: metrics.left,
      width: metrics.cssWidth,
      height: metrics.cssHeight,
      zIndex: 10,
      // pointerEvents 由具体 canvas 控制
    };
  }, [metrics]);

  const highlightCanvasStyle = useMemo<React.CSSProperties>(() => {
    return {
      ...style,
      // 关键：让高亮与底下 PDF 画面混合（不需要透明度也不会盖住文字）
      mixBlendMode: 'multiply',
      pointerEvents: canInteract && selectedTool === AnnotationType.HIGHLIGHT ? 'auto' : 'none',
    };
  }, [canInteract, selectedTool, style]);

  const drawCanvasStyle = useMemo<React.CSSProperties>(() => {
    return {
      ...style,
      mixBlendMode: 'normal',
      pointerEvents: canInteract && selectedTool === AnnotationType.DRAW ? 'auto' : 'none',
    };
  }, [canInteract, selectedTool, style]);

  const getPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): IPoint | null => {
      const c =
        selectedTool === AnnotationType.HIGHLIGHT
          ? highlightCanvasRef.current
          : drawCanvasRef.current;
      if (!c || !metrics) return null;
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const sx = c.width / rect.width;
      const sy = c.height / rect.height;
      return { x: x * sx, y: y * sy };
    },
    [metrics, selectedTool],
  );

  const drawStroke = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      points: IPoint[],
      type: AnnotationType,
      color: string,
      w: number,
    ) => {
      if (points.length === 0) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = w;

      if (type === AnnotationType.HIGHLIGHT) {
        // 透明度固定为 1，交给 CSS mix-blend-mode 去实现“高亮不遮字”
        ctx.globalAlpha = 1;
      }

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
      ctx.restore();
    },
    [],
  );

  const drawPolygon = useCallback(
    (ctx: CanvasRenderingContext2D, points: IPoint[], fill: string) => {
      if (points.length < 3) return;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    [],
  );

  const redraw = useCallback(() => {
    const hc = highlightCanvasRef.current;
    const dc = drawCanvasRef.current;
    if (!hc || !dc || !metrics) return;
    const hctx = hc.getContext('2d');
    const dctx = dc.getContext('2d');
    if (!hctx || !dctx) return;
    hctx.clearRect(0, 0, hc.width, hc.height);
    dctx.clearRect(0, 0, dc.width, dc.height);

    for (const a of annotations) {
      if (a.shape === 'polygon') {
        // polygon 目前只用于原生 highlight quadpoints，画在高亮层
        drawPolygon(hctx, a.points, a.color);
      } else {
        if (a.type === AnnotationType.HIGHLIGHT) {
          drawStroke(hctx, a.points, a.type, a.color, a.strokeWidth);
        } else {
          drawStroke(dctx, a.points, a.type, a.color, a.strokeWidth);
        }
      }
    }

    if (selectedTool && currentPath.length) {
      // 默认颜色：黄色
      const color = DEFAULT_HIGHLIGHT_COLOR;
      const strokeWidth = selectedTool === AnnotationType.HIGHLIGHT ? 14 : 2;
      if (selectedTool === AnnotationType.HIGHLIGHT) {
        drawStroke(hctx, currentPath, selectedTool, color, strokeWidth);
      } else {
        drawStroke(dctx, currentPath, selectedTool, color, strokeWidth);
      }
    }
  }, [annotations, currentPath, drawPolygon, drawStroke, metrics, selectedTool]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canInteract || !selectedTool) return;
      const p = getPoint(e);
      if (!p) return;
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
      setIsDrawing(true);
      setCurrentPath([p]);
    },
    [canInteract, getPoint, selectedTool],
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
    addAnnotation(pageIndex, ann);
    if (selectedTool === AnnotationType.HIGHLIGHT) {
      onCommitHighlight?.({ pageIndex, canvasPoints: currentPath });
    }
    setIsDrawing(false);
    setCurrentPath([]);
  }, [addAnnotation, currentPath, isDrawing, onCommitHighlight, pageIndex, selectedTool]);

  const onPointerUp = useCallback(() => finish(), [finish]);
  const onPointerCancel = useCallback(() => finish(), [finish]);

  if (!metrics) return null;

  return (
    <>
      <canvas
        ref={highlightCanvasRef}
        width={metrics.pixelWidth}
        height={metrics.pixelHeight}
        style={highlightCanvasStyle}
        className="annotation-layer annotation-layer-highlight"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <canvas
        ref={drawCanvasRef}
        width={metrics.pixelWidth}
        height={metrics.pixelHeight}
        style={drawCanvasStyle}
        className="annotation-layer annotation-layer-draw"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </>
  );
};
