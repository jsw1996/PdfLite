'use client';

import * as React from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from '@pdfviewer/ui/components/sidebar';

interface IAppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  numPages: number;
  currentPage: number;
  onPageClick: (page: number) => void;
}
export function AppSidebar({ numPages, currentPage, onPageClick }: IAppSidebarProps) {
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
              <div
                key={page}
                onClick={() => onPageClick(page)}
                className={`cursor-pointer group flex flex-col items-center space-y-2 rounded-lg p-2 transition-colors ${
                  currentPage === page ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-full aspect-[1/1.4] bg-white border shadow-sm rounded flex items-center justify-center text-slate-200 ${
                    currentPage === page ? 'border-indigo-300' : 'border-slate-200'
                  }`}
                >
                  <div className="w-12 h-1 bg-slate-100 mb-1 rounded-full"></div>
                  <div className="w-8 h-1 bg-slate-100 mb-1 rounded-full"></div>
                </div>
                <span
                  className={`text-xs font-medium ${
                    currentPage === page ? 'text-indigo-600' : 'text-slate-500'
                  }`}
                >
                  Page {page}
                </span>
              </div>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
