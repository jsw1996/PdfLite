import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { CanvasLayer } from '../CanvasLayer/CanvasLayer';
import React, { useCallback } from 'react';
import { RENDER_CONFIG } from '@/utils/config';

interface IPagePreviewProps {
  page: number;
}

export const PagePreview = React.memo(({ page }: IPagePreviewProps) => {
  const { currentPage, goToPage } = usePdfController();
  const handlePageClick = useCallback(() => {
    goToPage(page);
  }, [goToPage, page]);

  // Display 1-indexed page number to users
  const displayPageNumber = page + 1;

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
      className={`cursor-pointer group flex flex-col items-center space-y-2 rounded-lg p-2 transition-colors ${
        currentPage === page ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
      }`}
    >
      <div
        data-slot="page-preview-canvas-container"
        className={`w-full aspect-[1/1.4] bg-white border shadow-sm rounded flex items-center justify-center text-slate-200 overflow-hidden ${
          currentPage === page ? 'border-indigo-300' : 'border-slate-200'
        }`}
      >
        <CanvasLayer
          data-slot={`page-preview-canvas`}
          data-preview-index={String(page)}
          pageIndex={page}
          scale={RENDER_CONFIG.PREVIEW_SCALE}
          className="mt-0"
        />
      </div>
      <span
        data-slot="page-preview-page-number"
        className={`text-xs font-medium ${
          currentPage === page ? 'text-indigo-600' : 'text-slate-500'
        }`}
      >
        Page {displayPageNumber}
      </span>
    </div>
  );
});

PagePreview.displayName = 'PagePreview';
