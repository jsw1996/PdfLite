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

interface IAppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentPage: number;
  onPageClick: (page: number) => void;
}
export function AppSidebar({ currentPage, onPageClick }: IAppSidebarProps) {
  const { controller } = usePdfController();
  const pageCount = controller.getPageCount();

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
              <PagePreview
                key={`page-preview-${page}`}
                page={page}
                currentPage={currentPage}
                onPageClick={onPageClick}
              />
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
