'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from '@pdfviewer/ui/components/sidebar';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { LazyPagePreview } from './LazyPagePreview';
import { useEffect } from 'react';

export function AppSidebar() {
  const { controller, currentPage } = usePdfController();
  const pageCount = controller.getPageCount();

  // Scroll the preview into view when current page changes
  useEffect(() => {
    if (pageCount <= 0) return;
    if (currentPage < 0 || currentPage >= pageCount) return;

    // Single RAF is sufficient - double RAF was causing unnecessary frame delays
    requestAnimationFrame(() => {
      const previewCanvas = document.querySelector(`[data-preview-index="${currentPage}"]`);
      previewCanvas?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [currentPage, pageCount]);

  return (
    <Sidebar className="border-r-0">
      <SidebarContent className="bg-sidebar/80 dark:bg-sidebar/70 backdrop-blur-xl">
        <SidebarGroup className="p-3">
          <SidebarGroupContent className="space-y-2">
            {Array.from({ length: pageCount }, (_, i) => i).map((page) => (
              <LazyPagePreview key={`page-preview-${page}`} page={page} />
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
