import React, { useCallback, useEffect, useMemo, type RefObject } from 'react';
import { AnnotationType, type IAnnotation, type IPoint } from '../types/annotation';
import { TextBox } from '../components/AnnotationLayer/TextBox';
const DEFAULT_HIGHLIGHT_COLOR = 'rgb(248, 196, 72)';

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

function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: IPoint[],
  type: AnnotationType,
  color: string,
  w: number,
) {
  if (points.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = w;

  if (type === AnnotationType.HIGHLIGHT) {
    // 透明度固定为 1，交给 CSS mix-blend-mode 去实现"高亮不遮字"
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
}

function drawPolygon(ctx: CanvasRenderingContext2D, points: IPoint[], fill: string) {
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
}

export function useRenderAnnotation({
  highlightCanvasRef,
  drawCanvasRef,
  metrics,
  annotations,
  selectedTool,
  currentPath,
}: IUseRenderAnnotationOptions): { textAnnotations: React.ReactElement[] } {
  // Derive text annotations from annotations using useMemo instead of useState
  const textAnnotations = useMemo(() => {
    return annotations
      .filter((a) => a.type === AnnotationType.TEXT)
      .map((a) => React.createElement(TextBox, { value: a.textContent ?? '', pos: a.points[0] }));
  }, [annotations]);

  const redraw = useCallback(() => {
    const hc = highlightCanvasRef.current;
    const dc = drawCanvasRef.current;
    if (!hc || !dc || !metrics) return;
    const hctx = hc.getContext('2d');
    const dctx = dc.getContext('2d');
    if (!hctx || !dctx) return;
    // 清理（用单位矩阵清理物理像素）
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.clearRect(0, 0, hc.width, hc.height);
    dctx.clearRect(0, 0, dc.width, dc.height);

    // 让绘制 API 接收"逻辑坐标"，内部统一映射到物理像素
    const sx = metrics.cssWidth > 0 ? metrics.pixelWidth / metrics.cssWidth : 1;
    const sy = metrics.cssHeight > 0 ? metrics.pixelHeight / metrics.cssHeight : 1;
    hctx.setTransform(sx, 0, 0, sy, 0, 0);
    dctx.setTransform(sx, 0, 0, sy, 0, 0);

    for (const a of annotations) {
      if (a.type === AnnotationType.HIGHLIGHT) {
        // polygon 目前只用于原生 highlight quadpoints，画在高亮层
        drawPolygon(hctx, a.points, a.color);
      } else if (a.type === AnnotationType.DRAW) {
        drawStroke(dctx, a.points, a.type, a.color, a.strokeWidth);
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
  }, [annotations, currentPath, highlightCanvasRef, drawCanvasRef, metrics, selectedTool]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return { textAnnotations };
}
