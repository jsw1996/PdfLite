import { useLayoutEffect, useRef, useCallback } from 'react';
import type { ListRange, VirtuosoHandle } from 'react-virtuoso';

/**
 * Hook that preserves scroll position when zoom (scale) changes using Virtuoso's API.
 *
 * Instead of manipulating scrollTop directly (which fights Virtuoso's virtualization),
 * this hook tracks the visible page range and uses scrollToIndex to anchor the center
 * page when zoom changes. This provides a more natural "zoom stays where I'm looking"
 * experience.
 */
export const usePreserveScrollOnZoom = (
  virtuosoRef: React.RefObject<VirtuosoHandle | null>,
  scale: number,
) => {
  const prevScaleRef = useRef<number>(scale);
  const abortRef = useRef<AbortController | null>(null);
  const lastRangeRef = useRef<ListRange | null>(null);

  // Track whether we're in the middle of a zoom restoration
  const isRestoringRef = useRef<boolean>(false);

  // Callback to pass to Virtuoso's rangeChanged prop
  const onRangeChanged = useCallback((range: ListRange) => {
    // Don't update range while we're restoring scroll position
    if (isRestoringRef.current) return;
    lastRangeRef.current = range;
  }, []);

  useLayoutEffect(() => {
    // Skip if scale hasn't changed
    if (scale === prevScaleRef.current) return;
    prevScaleRef.current = scale;

    // Abort any pending restoration from previous zoom
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    const range = lastRangeRef.current;
    if (!range) return;

    // Calculate center index from the visible range
    // This is the page the user is most likely looking at
    const anchorIndex = Math.round((range.startIndex + range.endIndex) / 2);

    isRestoringRef.current = true;

    const snapToCenter = () => {
      if (abortController.signal.aborted) return;
      virtuosoRef.current?.scrollToIndex({
        index: anchorIndex,
        align: 'center',
        behavior: 'auto',
      });
    };

    // Execute immediately
    snapToCenter();

    // Call again across multiple frames to ride out Virtuoso's re-measurement
    // as it recalculates item heights at the new scale
    requestAnimationFrame(() => {
      snapToCenter();
      requestAnimationFrame(() => {
        snapToCenter();
        requestAnimationFrame(() => {
          // Final snap and allow range tracking again
          snapToCenter();
          if (!abortController.signal.aborted) {
            isRestoringRef.current = false;
          }
        });
      });
    });

    return () => {
      abortController.abort();
      isRestoringRef.current = false;
    };
  }, [scale, virtuosoRef]);

  return { onRangeChanged };
};
