import React, { useCallback, useMemo, useRef, useState } from 'react';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { usePdfController } from '@/providers/PdfControllerContextProvider';

export interface ILinkItem {
  id: string;
  points: { x: number; y: number }[];
  uri?: string;
  destPageIndex?: number;
}

export interface ILinkLayerProps {
  pdfCanvas: HTMLCanvasElement | null;
  containerEl: HTMLElement | null;
  onOpenExternal?: (uri: string) => void;
  onGoToPage?: (pageIndex: number) => void;
  pageIndex: number;
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

function scalePoints(
  points: { x: number; y: number }[],
  scale: number,
): { x: number; y: number }[] {
  return points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
}
const FPDF_ANNOTATION_SUBTYPE_LINK = 2;

export const LinkLayer: React.FC<ILinkLayerProps> = ({
  pdfCanvas,
  containerEl,
  onOpenExternal,
  onGoToPage,
  pageIndex,
}) => {
  const { controller } = usePdfController();
  const native = controller.listNativeAnnotations(pageIndex, { scale: 1 });
  const { scale } = usePdfState();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<ILayerMetrics | null>(null);

  const links = native
    .filter((a) => a.subtype === FPDF_ANNOTATION_SUBTYPE_LINK)
    .map(
      (a): ILinkItem => ({
        id: a.id,
        points: a.points,
        uri: a.uri,
        destPageIndex: a.destPageIndex,
      }),
    );

  const updateMetrics = useCallback(() => {
    if (!pdfCanvas || !containerEl) return;

    const rect = pdfCanvas.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    const top = rect.top - containerRect.top;
    const left = rect.left - containerRect.left;

    // 关键：这里用 rect.width/height（已经是“屏幕上的真实 CSS 尺寸”）
    setMetrics({
      top: clampFinite(top, 0),
      left: clampFinite(left, 0),
      cssWidth: clampFinite(rect.width, 0),
      cssHeight: clampFinite(rect.height, 0),
    });
  }, [containerEl, pdfCanvas]);

  if (metrics === null && pdfCanvas && containerEl) {
    updateMetrics();
  }

  const layerStyle = useMemo<React.CSSProperties>(() => {
    if (!metrics) return { display: 'none' };
    return {
      position: 'absolute',
      top: metrics.top,
      left: metrics.left,
      width: metrics.cssWidth,
      height: metrics.cssHeight,
      zIndex: 20,
      pointerEvents: 'none', // 根层穿透，让子元素自己决定
    };
  }, [metrics]);

  return (
    <div ref={rootRef} style={layerStyle} data-slot="link-layer">
      {links.map((l) => {
        const points = l.points;
        const scaledPoints = scalePoints(points, scale);

        // calculate width and height
        const width =
          Math.max(...scaledPoints.map((p) => p.x)) - Math.min(...scaledPoints.map((p) => p.x));
        const height =
          Math.max(...scaledPoints.map((p) => p.y)) - Math.min(...scaledPoints.map((p) => p.y));
        const top = Math.min(...scaledPoints.map((p) => p.y));
        const left = Math.min(...scaledPoints.map((p) => p.x));

        const title =
          l.uri ??
          (typeof l.destPageIndex === 'number' ? `Go to page ${l.destPageIndex + 1}` : 'Link');

        return (
          <button
            key={l.id}
            type="button"
            title={title}
            // tailwind classname with variables in style
            className="absolute bg-transparent border-none p-0 cursor-pointer pointer-events-auto"
            style={{
              top,
              left,
              width,
              height,
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
