import React, { useRef, useState, useEffect } from 'react';
import { PagePreview } from './PagePreview';
import { usePdfController } from '@/providers/PdfControllerContextProvider';

interface ILazyPagePreviewProps {
  page: number;
}

/**
 * LazyPagePreview - Only renders the actual PagePreview when it's near the viewport.
 * This prevents mounting 500+ canvas elements for large PDFs.
 */
export const LazyPagePreview = React.memo(({ page }: ILazyPagePreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const { controller } = usePdfController();

  // Get page dimensions for placeholder sizing
  const { width: pageWidth, height: pageHeight } = controller.getPageDimension(page);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0 },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Display 1-indexed page number
  const displayPageNumber = page + 1;

  if (!shouldLoad) {
    // Render placeholder with correct aspect ratio
    return (
      <div
        ref={containerRef}
        className="flex flex-col items-center gap-2 rounded-xl p-2.5"
        style={{ minHeight: '120px' }}
      >
        <div
          className="w-full bg-muted/50 rounded-lg animate-pulse"
          style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }}
        />
        <span className="text-xs font-medium text-muted-foreground">{displayPageNumber}</span>
      </div>
    );
  }

  return <PagePreview page={page} />;
});

LazyPagePreview.displayName = 'LazyPagePreview';
