'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Sidebar, SidebarContent, useSidebar } from '@pdfviewer/ui/components/sidebar';
import { Button } from '@pdfviewer/ui/components/button';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { PagePreview } from './PagePreview';
import { OutlinePanel } from './OutlinePanel';
import { BookmarksPanel } from './BookmarksPanel';
import type { IPdfOutlineNode } from '@pdfviewer/controller';
import { BookOpen, Bookmark, ListTree } from 'lucide-react';

type SidebarTab = 'pages' | 'outline' | 'bookmarks' | undefined;

interface IAppSidebarProps {
  file: File;
  isFileLoaded: boolean;
}

export function AppSidebar({ file, isFileLoaded }: IAppSidebarProps) {
  const { controller, currentPage, goToPage } = usePdfController();
  const { state, setOpen, isMobile, setOpenMobile } = useSidebar();
  const [activeTab, setActiveTab] = useState<SidebarTab>('pages');
  const [outline, setOutline] = useState<IPdfOutlineNode[]>([]);
  const pageCount = controller.getPageCount();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const bookmarkStorageKey = useMemo(
    () => `pdfBookmarks:${file.name}:${file.size}:${file.lastModified}`,
    [file.lastModified, file.name, file.size],
  );

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

  useEffect(() => {
    if (!isFileLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOutline([]);
      return;
    }
    setOutline(controller.getOutline());
  }, [controller, isFileLoaded, file]);

  const itemContent = useCallback(
    (index: number) => (
      <div className="px-3 pb-0.5 pt-0.5">
        <PagePreview page={index} />
      </div>
    ),
    [],
  );

  const isCollapsed = state === 'collapsed';

  const openSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(true);
      return;
    }
    setOpen(true);
  }, [isMobile, setOpen, setOpenMobile]);

  const closeSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
      return;
    }
    setOpen(false);
  }, [isMobile, setOpen, setOpenMobile]);

  const handleTabClick = useCallback(
    (tab: SidebarTab) => {
      if (tab === activeTab) {
        if (!isCollapsed) {
          closeSidebar();
          setActiveTab(undefined);
          return;
        }
        openSidebar();
        return;
      }
      setActiveTab(tab);
      openSidebar();
    },
    [activeTab, closeSidebar, isCollapsed, openSidebar],
  );

  return (
    <Sidebar className="border-r-0" collapsible="icon">
      <SidebarContent className="bg-sidebar/80 dark:bg-sidebar/70 backdrop-blur-xl">
        <div className="flex h-full">
          <div className="w-12 shrink-0 border-r border-border/60 py-3 flex flex-col items-center gap-2 bg-sidebar-ring/15">
            <Button
              type="button"
              size="icon-sm"
              variant={activeTab === 'pages' ? 'default' : 'ghost'}
              className="rounded-lg"
              onClick={() => handleTabClick('pages')}
              title="Pages"
              aria-label="Pages"
            >
              <BookOpen className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant={activeTab === 'outline' ? 'default' : 'ghost'}
              className="rounded-lg"
              onClick={() => handleTabClick('outline')}
              title="Outline"
              aria-label="Outline"
            >
              <ListTree className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant={activeTab === 'bookmarks' ? 'default' : 'ghost'}
              className="rounded-lg"
              onClick={() => handleTabClick('bookmarks')}
              title="Bookmarks"
              aria-label="Bookmarks"
            >
              <Bookmark className="size-4" />
            </Button>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-h-0 w-0">
              {activeTab === 'pages' && (
                <Virtuoso
                  ref={virtuosoRef}
                  totalCount={pageCount}
                  itemContent={itemContent}
                  overscan={500}
                  className="h-full custom-scrollbar"
                />
              )}
              {activeTab === 'outline' && <OutlinePanel outline={outline} onGoToPage={goToPage} />}
              {activeTab === 'bookmarks' && (
                <BookmarksPanel
                  storageKey={bookmarkStorageKey}
                  currentPage={currentPage}
                  onGoToPage={goToPage}
                />
              )}
            </div>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
