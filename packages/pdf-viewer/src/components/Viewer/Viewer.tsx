import React from 'react';
import { CanvasLayer } from '../CanvasLayer/CanvasLayer';
import { useLazyPageLoader } from '../../hooks/useLazyPageLoader';

export interface IViewerProps {
  /** Total number of pages in the PDF document */
  pageCount: number;
  /** Scale factor for rendering pages (default: 1.5) */
  scale?: number;
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
  scale = 1.5,
  initialPageLoad = 10,
  pageLoadIncrement = 10,
}) => {
  const { loadedPages, sentinelRef, hasMorePages } = useLazyPageLoader({
    pageCount,
    initialPageLoad,
    pageLoadIncrement,
  });

  return (
    <>
      {/* Render only the loaded pages */}
      {Array.from({ length: loadedPages }, (_, index) => (
        <CanvasLayer key={index} pageIndex={index} scale={scale} />
      ))}

      {/* Sentinel element - when this becomes visible, load more pages */}
      {hasMorePages && (
        <div ref={sentinelRef} className="h-10 flex items-center justify-center text-gray-500">
          Loading more pages...
        </div>
      )}
    </>
  );
};
