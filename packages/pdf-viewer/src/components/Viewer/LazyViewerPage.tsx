import { useEffect, useRef, useState } from 'react';
import { ViewerPage } from './ViewerPage';
import { usePdfController } from '@/providers/PdfControllerContextProvider';

interface ILazyViewerPageProps {
  pageIndex: number;
  registerPageElement: (index: number, el: HTMLDivElement | null) => void;
}

/**
 * Lazy wrapper for ViewerPage that only mounts the full component when near viewport.
 * Always renders a placeholder container so the page can be scrolled to.
 */
export const LazyViewerPage: React.FC<ILazyViewerPageProps> = ({
  pageIndex,
  registerPageElement,
}) => {
  const [shouldLoad, setShouldLoad] = useState(false);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const { controller } = usePdfController();

  // Get page dimensions for placeholder sizing
  const pageDimension = controller.getPageDimension(pageIndex);
  const placeholderHeight = pageDimension ? pageDimension.height : 800; // fallback height

  useEffect(() => {
    const element = placeholderRef.current;
    if (!element || shouldLoad) return;

    // Observe when placeholder enters viewport (with large margin for preloading)
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldLoad(true);
        }
      },
      {
        rootMargin: '500px', // Start loading when within 500px of viewport
        threshold: 0,
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [shouldLoad]);

  if (!shouldLoad) {
    // Render lightweight placeholder until page enters viewport
    return (
      <div
        ref={(el) => {
          placeholderRef.current = el;
          registerPageElement(pageIndex, el);
        }}
        data-slot={`viewer-page-container-${pageIndex}`}
        data-page-index={pageIndex}
        className="relative z-0 w-fit mx-auto mb-4"
        style={{
          minHeight: `${placeholderHeight}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Optional loading indicator */}
        <div className="text-muted-foreground text-sm">Page {pageIndex + 1}</div>
      </div>
    );
  }

  // Mount full ViewerPage when in/near viewport
  return <ViewerPage pageIndex={pageIndex} registerPageElement={registerPageElement} />;
};
