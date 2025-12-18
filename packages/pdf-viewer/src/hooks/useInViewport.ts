import { useEffect, useState, type RefObject } from 'react';

export interface IUseInViewportOptions {
  /** Margin around the root element */
  rootMargin?: string;
  /** Threshold(s) at which to trigger */
  threshold?: number | number[];
  /** Root element to use for intersection */
  root?: Element | null;
}

/**
 * Hook to track whether an element is in the viewport using Intersection Observer
 * @param ref - React ref to the element to observe
 * @param options - Intersection Observer options
 * @returns boolean indicating if the element is in viewport
 */
export function useInViewport<T extends Element>(
  ref: RefObject<T | null>,
  options: IUseInViewportOptions = {},
): boolean {
  const [isInViewport, setIsInViewport] = useState(false);

  const { rootMargin = '100px', threshold = 0, root = null } = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInViewport(entry.isIntersecting);
        });
      },
      {
        root,
        rootMargin,
        threshold,
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref, root, rootMargin, threshold]);

  return isInViewport;
}
