import React, { useEffect } from 'react';
import throttle from 'lodash.throttle';
import { ViewerPage } from './ViewerPage';
import { useLazyPageLoader } from '../../hooks/useLazyPageLoader';
import { useCurrentPageTracker } from '../../hooks/useCurrentPageTracker';
import { usePreserveScrollOnZoom } from '../../hooks/usePreserveScrollOnZoom';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { PageControlBar } from '../PageControlBar/PageControlBar';
import { usePdfState } from '@/providers/PdfStateContextProvider';
export interface IViewerProps {
  /** Total number of pages in the PDF document */
  pageCount: number;
  /** Number of pages to render initially (default: 10) */
  initialPageLoad?: number;
  /** Number of additional pages to load when scrolling (default: 10) */
  pageLoadIncrement?: number;
}

/**
 * Viewer component that renders PDF pages with lazy loading for performance.
 *
 * Instead of rendering all pages at once, it initially renders only a subset
 * of pages and loads more as the user scrolls down. This significantly improves
 * performance for large PDF documents.
 */
export const Viewer: React.FC<IViewerProps> = ({
  pageCount,
  initialPageLoad = 10,
  pageLoadIncrement = 10,
}) => {
  const { loadedPages, sentinelRef, hasMorePages, ensurePageLoaded } = useLazyPageLoader({
    pageCount,
    initialPageLoad,
    pageLoadIncrement,
  });
  const { goToPage } = usePdfController();
  const { registerPageElement } = useCurrentPageTracker({
    pageCount: loadedPages,
    onPageChange: (page) => goToPage(page, { scrollIntoView: false, scrollIntoPreview: true }),
    rootMargin: '0px',
    threshold: 0.7,
  });

  const { scale, setScale } = usePdfState();

  // Preserve scroll position when zooming
  usePreserveScrollOnZoom(scale);

  // Keep scale in a ref so wheel handler doesn't rebind every render
  const scaleRef = React.useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const minScale = 0.25;
  const maxScale = 2.5;
  const wheelStep = 0.25;
  const wheelThrottleMs = 60;

  const divRef = React.useRef<HTMLDivElement | null>(null);

  // Handle Ctrl + Mouse Wheel for zooming
  useEffect(() => {
    const applyWheelZoom = throttle(
      (delta: number) => {
        const next = Math.min(maxScale, Math.max(minScale, scaleRef.current + delta));
        if (next !== scaleRef.current) {
          setScale(next);
        }
      },
      wheelThrottleMs,
      { leading: true, trailing: true },
    );

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      applyWheelZoom(e.deltaY < 0 ? wheelStep : -wheelStep);
    };
    const el = divRef.current;
    el?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el?.removeEventListener('wheel', onWheel);
      applyWheelZoom.cancel();
    };
  }, [setScale]);

  return (
    <div className="h-full relative" ref={divRef}>
      {/* Render only the loaded pages */}
      {Array.from({ length: loadedPages }, (_, index) => (
        <ViewerPage key={index} pageIndex={index} registerPageElement={registerPageElement} />
      ))}
      {/* Sentinel element - when this becomes visible, load more pages */}
      {hasMorePages && (
        <div ref={sentinelRef} className="h-10 flex items-center justify-center text-gray-500">
          Loading more pages...
        </div>
      )}
      {/* Floating page control bar - fixed to viewport bottom, centered on container */}
      <div className="fixed bottom-6 z-50 pointer-events-none flex justify-center w-[stretch]">
        <div className="pointer-events-auto margin">
          <PageControlBar
            pageCount={pageCount}
            onJumpToPage={(target) => {
              ensurePageLoaded(target);
              // Wait for React to render the target page before scrolling to it
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  goToPage(target, { scrollIntoView: true, scrollIntoPreview: true });
                });
              });
            }}
          />
        </div>
      </div>
    </div>
  );
};
