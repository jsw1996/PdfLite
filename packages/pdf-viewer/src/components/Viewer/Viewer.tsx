import React, { useEffect } from 'react';
import { ViewerPage } from './ViewerPage';
import { useLazyPageLoader } from '../../hooks/useLazyPageLoader';
import { useCurrentPageTracker } from '../../hooks/useCurrentPageTracker';
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
  const { loadedPages, sentinelRef, hasMorePages } = useLazyPageLoader({
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

  const divRef = React.useRef<HTMLDivElement | null>(null);

  // Handle Ctrl + Mouse Wheel for zooming
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const newScale = e.deltaY < 0 ? scale * 1.1 : scale / 1.1;
        setScale(newScale);
      }
    };
    divRef.current?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      divRef.current?.removeEventListener('wheel', onWheel);
    };
  }, [scale, setScale]);

  return (
    <div className="h-full relative">
      {/* Scrollable content */}
      <div className="h-full" ref={divRef}>
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
      </div>
      {/* Floating page control bar - fixed to viewport bottom, centered on container */}
      <div className="fixed bottom-6 z-50 pointer-events-none flex justify-center w-[stretch]">
        <div className="pointer-events-auto margin">
          <PageControlBar />
        </div>
      </div>
    </div>
  );
};
