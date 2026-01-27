import React, { useEffect } from 'react';
import throttle from 'lodash.throttle';
import { LazyViewerPage } from './LazyViewerPage';
import { useCurrentPageTracker } from '../../hooks/useCurrentPageTracker';
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
 * Viewer component that renders PDF pages.
 *
 * Renders placeholder containers for all pages upfront. The actual content
 * (canvas, text layers) loads on-demand when pages enter the viewport.
 */
export const Viewer: React.FC<IViewerProps> = ({ pageCount }) => {
  const { goToPage } = usePdfController();
  const { registerPageElement } = useCurrentPageTracker({
    pageCount: pageCount,
    onPageChange: (page) => goToPage(page, { scrollIntoView: false, scrollIntoPreview: true }),
    rootMargin: '0px',
    threshold: 0.7,
  });
  useUndo();
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
      {/* Render ALL pages as lazy containers - full content loads on-demand when near viewport */}
      {Array.from({ length: pageCount }, (_, index) => (
        <LazyViewerPage key={index} pageIndex={index} registerPageElement={registerPageElement} />
      ))}
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
