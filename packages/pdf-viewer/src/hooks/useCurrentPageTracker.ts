import { useCallback, useEffect, useRef } from 'react';

export interface IUseCurrentPageTrackerOptions {
  /** Total number of pages */
  pageCount: number;
  /** Callback when current page changes */
  onPageChange: (page: number) => void;
  /** Root element for intersection observer (default: viewport) */
  root?: Element | null;
  /** Root margin for intersection observer */
  rootMargin?: string;
  /** Threshold for intersection (0.5 = 50% visible) */
  threshold?: number;
}

/**
 * Hook that tracks which PDF page is currently visible in the viewport
 * using Intersection Observer. Updates currentPage as user scrolls.
 * Only pages with visibility >= 50% are considered as current page.
 */
export const useCurrentPageTracker = ({
  pageCount,
  onPageChange,
  root = null,
  rootMargin = '0px',
  threshold = 0.7,
}: IUseCurrentPageTrackerOptions) => {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pageElementsRef = useRef<Map<number, Element>>(new Map());
  const lastDetectedPageRef = useRef<number | null>(null);
  // Latest visibility ratio per observed page; the current page is the one with
  // the highest ratio (ties broken by lowest index), which is far more accurate
  // near page boundaries than "lowest intersecting index".
  const ratiosRef = useRef<Map<number, number>>(new Map());
  // Use ref for callback to avoid recreating observer when callback changes
  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  useEffect(() => {
    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const ratios = ratiosRef.current;

    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Update the visibility ratio for each changed page.
        for (const entry of entries) {
          const pageIndex = parseInt(entry.target.getAttribute('data-page-index') ?? '0', 10);
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            ratios.set(pageIndex, entry.intersectionRatio);
          } else {
            ratios.delete(pageIndex);
          }
        }

        // Pick the most-visible page (highest ratio; lowest index on tie).
        let bestPage: number | null = null;
        let bestRatio = 0;
        ratios.forEach((ratio, idx) => {
          if (ratio > bestRatio || (ratio === bestRatio && bestPage !== null && idx < bestPage)) {
            bestRatio = ratio;
            bestPage = idx;
          }
        });

        if (bestPage !== null && lastDetectedPageRef.current !== bestPage) {
          lastDetectedPageRef.current = bestPage;
          onPageChangeRef.current(bestPage);
        }
      },
      {
        root,
        rootMargin,
        // Multiple thresholds give smooth ratio updates as pages scroll through,
        // so the most-visible computation has the resolution it needs.
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
      },
    );

    // Observe all page elements
    pageElementsRef.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [pageCount, root, rootMargin, threshold]); // Removed onPageChange from deps

  // Memoize registerPageElement to prevent re-renders of child components
  const registerPageElement = useCallback((pageIndex: number, element: Element | null) => {
    if (element) {
      element.setAttribute('data-page-index', pageIndex.toString());
      pageElementsRef.current.set(pageIndex, element);
      observerRef.current?.observe(element);
    } else {
      const existing = pageElementsRef.current.get(pageIndex);
      if (existing) {
        observerRef.current?.unobserve(existing);
        pageElementsRef.current.delete(pageIndex);
      }
      // Drop its stale visibility ratio so an unmounted page can't win selection.
      ratiosRef.current.delete(pageIndex);
    }
  }, []);

  return { registerPageElement };
};
