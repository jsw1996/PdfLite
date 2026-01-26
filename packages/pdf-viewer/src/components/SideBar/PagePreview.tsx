import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { CanvasLayer } from '../CanvasLayer/CanvasLayer';
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { RENDER_CONFIG } from '@/utils/config';

interface IPagePreviewProps {
  page: number;
}

export const PagePreview = React.memo(({ page }: IPagePreviewProps) => {
  const { currentPage, goToPage, controller } = usePdfController();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const handlePageClick = useCallback(() => {
    goToPage(page);
  }, [goToPage, page]);

  // Get page dimensions to calculate proper scaling
  const { width: pageWidth, height: pageHeight } = controller.getPageDimension(page);
  const previewScale = RENDER_CONFIG.PREVIEW_SCALE;
  const canvasWidth = pageWidth * previewScale;

  // Measure container width to calculate fit scale
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Calculate scale to fit canvas within container
  const fitScale = containerWidth > 0 ? containerWidth / canvasWidth : 1;

  // Display 1-indexed page number to users
  const displayPageNumber = page + 1;
  const isActive = currentPage === page;

  return (
    <div
      data-slot="page-preview"
      key={`page-preview-${page}`}
      onClick={handlePageClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePageClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Go to page ${displayPageNumber}`}
      className={`
        cursor-pointer group flex flex-col items-center gap-2 rounded-xl p-2.5 
        transition-all duration-200
        ${isActive ? 'bg-primary/10 ring-2 ring-primary/30' : 'hover:bg-secondary/80'}
      `}
    >
      <div
        ref={containerRef}
        data-slot="page-preview-canvas-container"
        className={`
          relative w-full bg-white dark:bg-slate-800 rounded-lg 
          overflow-hidden
          shadow-md transition-all duration-200
          ${isActive ? 'shadow-primary/20 ring-2 ring-primary' : 'shadow-slate-200/50 dark:shadow-slate-900/50 group-hover:shadow-lg'}
        `}
        style={{
          aspectRatio: `${pageWidth} / ${pageHeight}`,
        }}
      >
        <div
          className="origin-top-left"
          style={{
            transform: `scale(${fitScale})`,
          }}
        >
          <CanvasLayer
            data-slot="page-preview-canvas"
            data-preview-index={String(page)}
            pageIndex={page}
            scale={previewScale}
          />
        </div>
      </div>
      <span
        data-slot="page-preview-page-number"
        className={`
          text-xs font-medium transition-colors duration-200
          ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}
        `}
      >
        {displayPageNumber}
      </span>
    </div>
  );
});

PagePreview.displayName = 'PagePreview';
