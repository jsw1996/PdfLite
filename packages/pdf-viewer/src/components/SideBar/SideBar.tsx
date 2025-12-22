'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from '@pdfviewer/ui/components/sidebar';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { PagePreview } from './PagePreview';
import { useLazyPageLoader } from '../../hooks/useLazyPageLoader';
import { useEffect, useRef } from 'react';

export function AppSidebar() {
  const { controller, currentPage } = usePdfController();
  const pageCount = controller.getPageCount();
  const { loadedPages, sentinelRef, hasMorePages, ensurePageLoaded } = useLazyPageLoader({
    pageCount,
    initialPageLoad: 10,
    pageLoadIncrement: 10,
  });

  const pendingScrollPageRef = useRef<number | null>(null);

  // If user jumps to a page that isn't rendered in the preview list yet, load up to that page.
  useEffect(() => {
    if (pageCount <= 0) return;
    if (currentPage < 0 || currentPage >= pageCount) return;
    if (currentPage >= loadedPages) {
      pendingScrollPageRef.current = currentPage;
      ensurePageLoaded(currentPage);
    }
  }, [currentPage, ensurePageLoaded, loadedPages, pageCount]);

  // Once loaded, scroll the preview into view (so preview follows PageControlBar jumps).
  useEffect(() => {
    const pending = pendingScrollPageRef.current;
    if (pending == null) return;
    if (pending >= loadedPages) return; // not rendered yet
    pendingScrollPageRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const previewCanvas = document.querySelector(`[data-preview-index="${pending}"]`);
        previewCanvas?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }, [loadedPages]);

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {Array.from({ length: loadedPages }, (_, i) => i).map((page) => (
              <PagePreview key={`page-preview-${page}`} page={page} />
            ))}
            {hasMorePages && (
              <div
                ref={sentinelRef}
                className="h-8 flex items-center justify-center text-gray-400 text-sm"
              >
                Loading...
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
