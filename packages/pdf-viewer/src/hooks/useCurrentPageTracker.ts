import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Calculate the center point of the viewport
        let viewportCenter: number;
        if (root) {
          const rootRect = root.getBoundingClientRect();
          viewportCenter = rootRect.top + rootRect.height / 2;
        } else {
          viewportCenter = window.innerHeight / 2;
        }

        // Collect all visible pages (including partially visible ones)
        const allVisiblePages = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => {
            const pageIndex = parseInt(entry.target.getAttribute('data-page-index') ?? '0', 10);
            const rect = entry.boundingClientRect;
            // Calculate the center point of the page
            const pageCenter = rect.top + rect.height / 2;
            // Calculate the distance from page center to viewport center
            const distanceToViewportCenter = Math.abs(pageCenter - viewportCenter);

            return {
              pageIndex,
              ratio: entry.intersectionRatio,
              boundingClientRect: rect,
              pageCenter,
              distanceToViewportCenter,
            };
          });

        // Prefer pages with visibility ratio >= 50%
        const fullyVisiblePages = allVisiblePages.filter((p) => p.ratio >= 0.5);
        const visiblePages = fullyVisiblePages.length > 0 ? fullyVisiblePages : allVisiblePages;
        // Sort by priority
        visiblePages.sort((a, b) => {
          // Prefer the page whose center is closest to the viewport center
          if (Math.abs(a.distanceToViewportCenter - b.distanceToViewportCenter) > 1) {
            return a.distanceToViewportCenter - b.distanceToViewportCenter;
          }
          // If distances are similar, prefer the page with higher visibility ratio
          if (Math.abs(b.ratio - a.ratio) > 0.01) {
            return b.ratio - a.ratio;
          }
          // If ratios are also similar, prefer the page that is higher in the viewport
          if (a.boundingClientRect.top < b.boundingClientRect.top) return -1;
          if (a.boundingClientRect.top > b.boundingClientRect.top) return 1;
          return 0;
        });

        if (visiblePages.length > 0) {
          const currentPage = visiblePages[0].pageIndex;
          // Only call the callback when the page actually changes
          if (lastDetectedPageRef.current !== currentPage) {
            lastDetectedPageRef.current = currentPage;
            onPageChange(currentPage);
          }
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
  }, [pageCount, onPageChange, root, rootMargin, threshold]);

  // Function to register a page element
  const registerPageElement = (pageIndex: number, element: Element | null) => {
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
  };

  return { registerPageElement };
};
