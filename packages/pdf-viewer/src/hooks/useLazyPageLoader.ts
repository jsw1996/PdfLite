import { useCallback, useEffect, useRef, useState } from 'react';

export interface IUseLazyPageLoaderOptions {
  pageCount: number;
  initialPageLoad?: number;
  pageLoadIncrement?: number;
  rootMargin?: number;
}

export interface IUseLazyPageLoaderResult {
  loadedPages: number;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  hasMorePages: boolean;
}

/**
 * Hook that manages lazy loading of PDF pages using IntersectionObserver.
 * Loads pages incrementally as the user scrolls down for better performance.
 */
export const useLazyPageLoader = ({
  pageCount,
  initialPageLoad = 10,
  pageLoadIncrement = 10,
  rootMargin = 200,
}: IUseLazyPageLoaderOptions): IUseLazyPageLoaderResult => {
  const [loadedPages, setLoadedPages] = useState(() => Math.min(initialPageLoad, pageCount));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMorePages = useCallback(() => {
    setLoadedPages((prev) => Math.min(prev + pageLoadIncrement, pageCount));
  }, [pageCount, pageLoadIncrement]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMorePages();
        }
      },
      { rootMargin: `${rootMargin}px` },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMorePages, rootMargin]);

  useEffect(() => {
    setLoadedPages(Math.min(initialPageLoad, pageCount));
  }, [pageCount, initialPageLoad]);

  return {
    loadedPages,
    sentinelRef,
    hasMorePages: loadedPages < pageCount,
  };
};
