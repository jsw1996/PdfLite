import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { clampFinite, scalePoints, isValidExternalUri } from '@/utils/shared';

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

const FPDF_ANNOTATION_SUBTYPE_LINK = 2;

/**
 * Compute layer metrics from refs. Returns null if refs are not ready.
 */
function computeMetrics(
  pdfCanvas: HTMLCanvasElement | null,
  containerEl: HTMLElement | null,
): ILayerMetrics | null {
  if (!pdfCanvas || !containerEl) return null;

  const rect = pdfCanvas.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  const top = rect.top - containerRect.top;
  const left = rect.left - containerRect.left;

  return {
    top: clampFinite(top, 0),
    left: clampFinite(left, 0),
    cssWidth: clampFinite(rect.width, 0),
    cssHeight: clampFinite(rect.height, 0),
  };
}

export const LinkLayer: React.FC<ILinkLayerProps> = ({
  pdfCanvas,
  containerEl,
  onOpenExternal,
  onGoToPage,
  pageIndex,
}) => {
  const { controller } = usePdfController();
  const { scale } = usePdfState();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Memoize native annotations fetch
  const native = useMemo(
    () => controller.listNativeAnnotations(pageIndex, { scale: 1 }),
    [controller, pageIndex],
  );

  // Memoize links extraction
  const links = useMemo(
    () =>
      native
        .filter((a) => a.subtype === FPDF_ANNOTATION_SUBTYPE_LINK)
        .map(
          (a): ILinkItem => ({
            id: a.id,
            points: a.points,
            uri: a.uri,
            destPageIndex: a.destPageIndex,
          }),
        ),
    [native],
  );

  // Track a version to force recalculation on resize
  const [metricsVersion, setMetricsVersion] = useState(0);

  // Compute metrics as derived state (will re-run when metricsVersion changes)
  const metrics = useMemo(() => {
    // metricsVersion is used to trigger recalculation
    void metricsVersion;
    return computeMetrics(pdfCanvas, containerEl);
  }, [pdfCanvas, containerEl, metricsVersion]);

  const updateMetrics = useCallback(() => {
    setMetricsVersion((v) => v + 1);
  }, []);

  // Watch for resize events to update metrics
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

  const handleLinkClick = useCallback(
    (e: React.MouseEvent, link: ILinkItem) => {
      e.preventDefault();
      e.stopPropagation();

      if (link.uri) {
        // Validate URI before opening
        if (isValidExternalUri(link.uri)) {
          onOpenExternal?.(link.uri);
        } else {
          console.warn('Blocked potentially unsafe URI:', link.uri);
        }
        return;
      }
      if (typeof link.destPageIndex === 'number') {
        onGoToPage?.(link.destPageIndex);
      }
    },
    [onOpenExternal, onGoToPage],
  );

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
            aria-label={title}
            // tailwind classname with variables in style
            className="absolute bg-transparent border-none p-0 cursor-pointer pointer-events-auto"
            style={{
              top,
              left,
              width,
              height,
            }}
            onClick={(e) => handleLinkClick(e, l)}
          />
        );
      })}
    </div>
  );
};
