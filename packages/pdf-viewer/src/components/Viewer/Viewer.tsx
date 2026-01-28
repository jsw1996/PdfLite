import React, { useCallback, useEffect, useRef } from 'react';
import throttle from 'lodash.throttle';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { ViewerPage } from './ViewerPage';
import { usePreserveScrollOnZoom } from '../../hooks/usePreserveScrollOnZoom';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { PageControlBar } from '../PageControlBar/PageControlBar';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { useUndo } from '../../hooks/useUndo';

export interface IViewerProps {
  /** Total number of pages in the PDF document */
  pageCount: number;
}

/**
 * Viewer component that renders PDF pages with virtualization.
 *
 * Uses react-virtuoso for efficient rendering of large documents.
 * Only renders pages that are in or near the viewport.
 */
export const Viewer: React.FC<IViewerProps> = ({ pageCount }) => {
  const { goToPage, controller, registerScrollToIndex } = usePdfController();
  const { scale, setScale } = usePdfState();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  useUndo();

  // Register scrollToIndex handler with context for goToPage support
  useEffect(() => {
    registerScrollToIndex((index: number) => {
      virtuosoRef.current?.scrollToIndex({
        index,
        align: 'start',
        behavior: 'auto',
      });
    });
  }, [registerScrollToIndex]);

  // Track current page based on what's visible
  const handleRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      // Use the first visible page as the current page
      goToPage(range.startIndex, { scrollIntoView: false, scrollIntoPreview: true });
    },
    [goToPage],
  );

  // Preserve scroll position when zooming
  usePreserveScrollOnZoom(scale);

  // Keep scale in a ref so wheel handler doesn't rebind every render
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const minScale = 0.25;
  const maxScale = 2.5;
  const wheelStep = 0.05;
  const wheelThrottleMs = 0;

  const divRef = useRef<HTMLDivElement | null>(null);

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

  // Render a page item
  const itemContent = useCallback((index: number) => {
    return <ViewerPage pageIndex={index} />;
  }, []);

  // Calculate default item height based on first page dimensions
  const defaultItemHeight = useCallback(
    (index: number) => {
      const dim = controller.getPageDimension(index);
      // Return scaled height + margin (mb-4 = 16px)
      return dim ? dim.height * scale + 16 : 800 * scale + 16;
    },
    [controller, scale],
  );

  return (
    <div className="h-full relative" ref={divRef}>
      <Virtuoso
        ref={virtuosoRef}
        totalCount={pageCount}
        itemContent={itemContent}
        defaultItemHeight={defaultItemHeight(0)}
        overscan={2000}
        rangeChanged={handleRangeChanged}
        className="h-full"
        data-slot="viewer-scroll-container"
      />
      {/* Floating page control bar - fixed to viewport bottom, centered on container */}
      <div className="fixed bottom-6 z-50 pointer-events-none flex justify-center w-[stretch]">
        <div className="pointer-events-auto margin">
          <PageControlBar
            pageCount={pageCount}
            onJumpToPage={(target) => {
              goToPage(target, { scrollIntoView: true, scrollIntoPreview: true });
            }}
          />
        </div>
      </div>
    </div>
  );
};
