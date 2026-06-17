import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { clampFinite, scalePoints } from '@/utils/shared';

export interface IStickyNoteItem {
  id: string;
  /** Canvas-space (scale=1) polygon of the annotation rect. */
  points: { x: number; y: number }[];
  contents: string;
  author?: string;
}

export interface IStickyNoteLayerProps {
  pdfCanvas: HTMLCanvasElement | null;
  containerEl: HTMLElement | null;
  pageIndex: number;
}

interface ILayerMetrics {
  top: number;
  left: number;
  cssWidth: number;
  cssHeight: number;
}

const FPDF_ANNOTATION_SUBTYPE_TEXT = 1;

/** Minimum clickable size (CSS px) so tiny/degenerate note rects stay hittable. */
const MIN_HIT_SIZE = 16;

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

/**
 * Renders PDF "Text" annotations (sticky notes) as clickable note icons.
 * PDFium's bitmap pass does not draw these (they carry no appearance stream),
 * so this overlay supplies the icon and a click-to-open popup with the note body.
 */
export const StickyNoteLayer: React.FC<IStickyNoteLayerProps> = ({
  pdfCanvas,
  containerEl,
  pageIndex,
}) => {
  const { controller } = usePdfController();
  const { scale } = usePdfState();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Memoize native annotations fetch
  const native = useMemo(
    () => controller.listNativeAnnotations(pageIndex, { scale: 1 }),
    [controller, pageIndex],
  );

  const notes = useMemo(
    () =>
      native
        .filter((a) => a.subtype === FPDF_ANNOTATION_SUBTYPE_TEXT)
        .map(
          (a): IStickyNoteItem => ({
            id: a.id,
            points: a.points,
            contents: a.contents ?? '',
            author: a.author,
          }),
        ),
    [native],
  );

  // Track a version to force recalculation on resize
  const [metricsVersion, setMetricsVersion] = useState(0);

  const metrics = useMemo(() => {
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

  // Close the open popup on outside click / Escape.
  useEffect(() => {
    if (!openId) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpenId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openId]);

  const layerStyle = useMemo<React.CSSProperties>(() => {
    if (!metrics) return { display: 'none' };
    return {
      position: 'absolute',
      top: metrics.top,
      left: metrics.left,
      width: metrics.cssWidth,
      height: metrics.cssHeight,
      zIndex: 25,
      pointerEvents: 'none', // root passes through; children opt back in
    };
  }, [metrics]);

  if (!notes.length) return null;

  return (
    <div ref={rootRef} style={layerStyle} data-slot="sticky-note-layer">
      {notes.map((n) => {
        const scaledPoints = scalePoints(n.points, scale);
        const xs = scaledPoints.map((p) => p.x);
        const ys = scaledPoints.map((p) => p.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        // PDFium already paints the note icon into the page bitmap, so this is
        // just an invisible hit target over the annotation rect. Enforce a
        // minimum size so tiny/degenerate rects stay clickable.
        const width = Math.max(MIN_HIT_SIZE, Math.max(...xs) - left);
        const height = Math.max(MIN_HIT_SIZE, Math.max(...ys) - top);
        const isOpen = openId === n.id;
        const title = n.author ? `Note — ${n.author}` : 'Note';

        return (
          <div key={n.id} className="absolute" style={{ top, left, width, height }}>
            <button
              type="button"
              title={title}
              aria-label={title}
              aria-expanded={isOpen}
              className="absolute inset-0 bg-transparent border-none p-0 cursor-pointer pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                setOpenId((cur) => (cur === n.id ? null : n.id));
              }}
            />

            {isOpen && (
              <div
                role="dialog"
                aria-label={title}
                className="absolute z-10 w-64 max-h-60 overflow-auto rounded-md border border-yellow-400 bg-yellow-50 p-3 text-sm text-neutral-800 shadow-lg pointer-events-auto"
                style={{ top: height + 4, left: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                {n.author && <div className="mb-1 font-semibold text-neutral-900">{n.author}</div>}
                {n.contents ? (
                  <div className="whitespace-pre-wrap break-words">{n.contents}</div>
                ) : (
                  <div className="italic text-neutral-500">(empty note)</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
