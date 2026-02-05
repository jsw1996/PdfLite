'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Sidebar, SidebarContent } from '@pdfviewer/ui/components/sidebar';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { PagePreview } from './PagePreview';
import { OutlinePanel } from './OutlinePanel';
import { BookmarksPanel } from './BookmarksPanel';
import type { IPdfOutlineNode } from '@pdfviewer/controller';

type SidebarTab = 'pages' | 'outline' | 'bookmarks';

interface IAppSidebarProps {
  file: File;
  isFileLoaded: boolean;
}

export function AppSidebar({ file, isFileLoaded }: IAppSidebarProps) {
  const { controller, currentPage, goToPage } = usePdfController();
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
      <div className="px-3 pb-0.5">
        <PagePreview page={index} />
      </div>
    ),
    [],
  );

  return (
    <Sidebar className="border-r-0">
      <SidebarContent className="bg-sidebar/80 dark:bg-sidebar/70 backdrop-blur-xl">
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-1 px-3 pt-3">
            <button
              type="button"
              className={`text-xs px-2.5 py-1 rounded-md ${
                activeTab === 'pages'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('pages')}
            >
              Pages
            </button>
            <button
              type="button"
              className={`text-xs px-2.5 py-1 rounded-md ${
                activeTab === 'outline'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('outline')}
            >
              Outline
            </button>
            <button
              type="button"
              className={`text-xs px-2.5 py-1 rounded-md ${
                activeTab === 'bookmarks'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('bookmarks')}
            >
              Bookmarks
            </button>
          </div>
          <div className="flex-1 min-h-0">
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
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
