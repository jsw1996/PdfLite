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
import { Loader2 } from 'lucide-react';

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
    <Sidebar className="border-r-0">
      <SidebarContent className="bg-sidebar/80 dark:bg-sidebar/70 backdrop-blur-xl">
        <SidebarGroup className="p-3">
          <SidebarGroupContent className="space-y-2">
            {Array.from({ length: loadedPages }, (_, i) => i).map((page) => (
              <PagePreview key={`page-preview-${page}`} page={page} />
            ))}
            {hasMorePages && (
              <div
                ref={sentinelRef}
                className="h-10 flex items-center justify-center gap-2 text-muted-foreground text-xs"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more...</span>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
