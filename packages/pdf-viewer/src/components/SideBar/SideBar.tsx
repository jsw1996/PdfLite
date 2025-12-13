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

export function AppSidebar() {
  const { controller } = usePdfController();
  const pageCount = controller.getPageCount();
  const { loadedPages, sentinelRef, hasMorePages } = useLazyPageLoader({
    pageCount,
    initialPageLoad: 10,
    pageLoadIncrement: 10,
  });

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
