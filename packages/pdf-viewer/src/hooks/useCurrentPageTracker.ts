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

    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the first visible page (lowest page index that's intersecting)
        let minPageIndex = Infinity;

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageIndex = parseInt(entry.target.getAttribute('data-page-index') ?? '0', 10);
            if (pageIndex < minPageIndex) {
              minPageIndex = pageIndex;
            }
          }
        }

        if (minPageIndex !== Infinity && lastDetectedPageRef.current !== minPageIndex) {
          lastDetectedPageRef.current = minPageIndex;
          onPageChangeRef.current(minPageIndex);
        }
      },
      {
        root,
        rootMargin,
        threshold,
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
    }
  }, []);

  return { registerPageElement };
};
