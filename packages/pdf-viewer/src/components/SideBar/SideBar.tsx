'use client';

import * as React from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from '@pdfviewer/ui/components/sidebar';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { PagePreview } from './PagePreview';
import { useLazyPageLoader } from '../../hooks/useLazyPageLoader';

interface IAppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentPage: number;
  onPageClick: (page: number) => void;
}
export function AppSidebar({ currentPage, onPageClick }: IAppSidebarProps) {
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
            {Array.from({ length: loadedPages }, (_, i) => i + 1).map((page) => (
              <PagePreview
                key={`page-preview-${page}`}
                page={page}
                currentPage={currentPage}
                onPageClick={onPageClick}
              />
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
