import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';

export interface ILinkItem {
  id: string;
  /** Canvas/CSS pixel coordinates */
  points: { x: number; y: number }[];
  uri?: string;
  destPageIndex?: number;
}

export interface ILinkLayerProps {
  pageIndex: number;
  pdfCanvas: HTMLCanvasElement | null;
  containerEl: HTMLElement | null;
  links: ILinkItem[];
  onOpenExternal?: (uri: string) => void;
  onGoToPage?: (pageIndex: number) => void;
  onCreateLink?: (args: {
    pageIndex: number;
    canvasRect: { left: number; top: number; width: number; height: number };
    uri: string;
  }) => void;
}

interface ILayerMetrics {
  top: number;
  left: number;
  cssWidth: number;
  cssHeight: number;
}

function clampFinite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

function pointsToRect(points: { x: number; y: number }[]): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  return {
    left: minX,
    top: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export const LinkLayer: React.FC<ILinkLayerProps> = ({
  pageIndex,
  pdfCanvas,
  containerEl,
  links,
  onOpenExternal,
  onGoToPage,
  onCreateLink,
}) => {
  const { selectedTool } = useAnnotation();
  const [metrics, setMetrics] = useState<ILayerMetrics | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isCreateArmed, setIsCreateArmed] = useState(false);

  const updateMetrics = useCallback(() => {
    if (!pdfCanvas || !containerEl) return;
    const rect = pdfCanvas.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const top = rect.top - containerRect.top;
    const left = rect.left - containerRect.left;
    setMetrics({
      top: clampFinite(top, 0),
      left: clampFinite(left, 0),
      cssWidth: clampFinite(rect.width, 0),
      cssHeight: clampFinite(rect.height, 0),
    });
  }, [containerEl, pdfCanvas]);

  if (metrics === null && pdfCanvas && containerEl) {
    const rect = pdfCanvas.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    setMetrics({
      top: clampFinite(rect.top - containerRect.top, 0),
      left: clampFinite(rect.left - containerRect.left, 0),
      cssWidth: clampFinite(rect.width, 0),
      cssHeight: clampFinite(rect.height, 0),
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

  const isDisabled = selectedTool != null;

  const style = useMemo<React.CSSProperties>(() => {
    if (!metrics) return { display: 'none' };
    return {
      position: 'absolute',
      top: metrics.top,
      left: metrics.left,
      width: metrics.cssWidth,
      height: metrics.cssHeight,
      zIndex: 20,
      pointerEvents: 'none',
    };
  }, [metrics]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isDisabled) return;
      if (e.altKey && e.shiftKey) setIsCreateArmed(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // keyup 时 alt/shift 状态可能已经被清掉，所以用“只要有一个松开就取消”
      if (!e.altKey || !e.shiftKey) setIsCreateArmed(false);
    };
    const onBlur = () => setIsCreateArmed(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isDisabled]);

  // Minimal creation flow (optional): Shift+Alt drag to create a rect and prompt URL.
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const getLocalPoint = useCallback((e: React.PointerEvent) => {
    const el = rootRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDisabled) return;
      if (!(e.shiftKey && e.altKey)) return;
      const p = getLocalPoint(e);
      if (!p) return;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setDragStart(p);
      setDragRect({ left: p.x, top: p.y, width: 0, height: 0 });
      e.preventDefault();
      e.stopPropagation();
    },
    [getLocalPoint, isDisabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart) return;
      const p = getLocalPoint(e);
      if (!p) return;
      const left = Math.min(dragStart.x, p.x);
      const top = Math.min(dragStart.y, p.y);
      const width = Math.abs(p.x - dragStart.x);
      const height = Math.abs(p.y - dragStart.y);
      setDragRect({ left, top, width, height });
      e.preventDefault();
    },
    [dragStart, getLocalPoint],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart || !dragRect) return;
      setDragStart(null);

      const rect = dragRect;
      setDragRect(null);

      if (rect.width < 6 || rect.height < 6) return;
      const uri = window.prompt('输入链接 URL（例如 https://example.com）');
      if (!uri) return;
      onCreateLink?.({ pageIndex, canvasRect: rect, uri });
      e.preventDefault();
    },
    [dragRect, dragStart, onCreateLink, pageIndex],
  );

  const selectionStyle = useMemo<React.CSSProperties>(() => {
    if (!dragRect) return { display: 'none' };
    return {
      position: 'absolute',
      left: dragRect.left,
      top: dragRect.top,
      width: dragRect.width,
      height: dragRect.height,
      border: '1px dashed rgba(59, 130, 246, 0.9)',
      background: 'rgba(59, 130, 246, 0.10)',
      pointerEvents: 'none',
    };
  }, [dragRect]);

  const createOverlayStyle = useMemo<React.CSSProperties>(() => {
    return {
      position: 'absolute',
      inset: 0,
      // 只在 Shift+Alt 按下时启用创建链接的拖拽层；否则完全穿透，保证文字可选中
      pointerEvents: !isDisabled && isCreateArmed ? 'auto' : 'none',
      cursor: !isDisabled && isCreateArmed ? 'crosshair' : 'default',
    };
  }, [isCreateArmed, isDisabled]);

  return (
    <div ref={rootRef} style={style}>
      <div
        style={createOverlayStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div style={selectionStyle} />
      </div>

      {links.map((l) => {
        const rect = pointsToRect(l.points);
        if (rect.width <= 0 || rect.height <= 0) return null;
        const title =
          l.uri ??
          (typeof l.destPageIndex === 'number' ? `Go to page ${l.destPageIndex + 1}` : 'Link');
        return (
          <button
            key={l.id}
            type="button"
            title={title}
            style={{
              position: 'absolute',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: l.uri || typeof l.destPageIndex === 'number' ? 'pointer' : 'default',
              pointerEvents: isDisabled ? 'none' : 'auto',
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (l.uri) {
                onOpenExternal?.(l.uri);
                return;
              }
              if (typeof l.destPageIndex === 'number') {
                onGoToPage?.(l.destPageIndex);
              }
            }}
          />
        );
      })}
    </div>
  );
};
