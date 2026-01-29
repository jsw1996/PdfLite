'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Sidebar, SidebarContent } from '@pdfviewer/ui/components/sidebar';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { PagePreview } from './PagePreview';

export function AppSidebar() {
  const { controller, currentPage } = usePdfController();
  const pageCount = controller.getPageCount();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Scroll the preview into view when current page changes
  useEffect(() => {
    if (pageCount <= 0) return;
    if (currentPage < 0 || currentPage >= pageCount) return;

    virtuosoRef.current?.scrollToIndex({
      index: currentPage,
      align: 'center',
      behavior: 'smooth',
    });
  }, [currentPage, pageCount]);

  const itemContent = useCallback(
    (index: number) => (
      <div className="px-3 pb-2 first:pt-3">
        <PagePreview page={index} />
      </div>
    ),
    [],
  );

  return (
    <Sidebar className="border-r-0">
      <SidebarContent className="bg-sidebar/80 dark:bg-sidebar/70 backdrop-blur-xl">
        <Virtuoso
          ref={virtuosoRef}
          totalCount={pageCount}
          itemContent={itemContent}
          overscan={500}
          className="h-full custom-scrollbar"
        />
      </SidebarContent>
    </Sidebar>
  );
}
