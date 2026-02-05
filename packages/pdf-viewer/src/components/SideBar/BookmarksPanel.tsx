'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IUserBookmark } from '@pdfviewer/controller';

interface IBookmarksPanelProps {
  storageKey: string;
  currentPage: number;
  onGoToPage: (pageIndex: number) => void;
}

function createBookmarkId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function BookmarksPanel({ storageKey, currentPage, onGoToPage }: IBookmarksPanelProps) {
  const [bookmarks, setBookmarks] = useState<IUserBookmark[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as IUserBookmark[];
        setBookmarks(Array.isArray(parsed) ? parsed : []);
      } else {
        setBookmarks([]);
      }
    } catch {
      setBookmarks([]);
    } finally {
      setIsReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isReady || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(bookmarks));
  }, [bookmarks, isReady, storageKey]);

  const handleAdd = useCallback(() => {
    const title = `Page ${currentPage + 1}`;
    const next: IUserBookmark = {
      id: createBookmarkId(),
      title,
      pageIndex: currentPage,
      createdAt: Date.now(),
    };
    setBookmarks((prev) => [next, ...prev]);
  }, [currentPage]);

  const handleRename = useCallback((bookmark: IUserBookmark) => {
    const title = window.prompt('Rename bookmark', bookmark.title);
    if (!title) return;
    setBookmarks((prev) =>
      prev.map((item) => (item.id === bookmark.id ? { ...item, title } : item)),
    );
  }, []);

  const handleDelete = useCallback((bookmark: IUserBookmark) => {
    setBookmarks((prev) => prev.filter((item) => item.id !== bookmark.id));
  }, []);

  const emptyState = useMemo(() => {
    if (bookmarks.length) return null;
    return <div className="px-3 py-4 text-sm text-slate-500">No bookmarks yet.</div>;
  }, [bookmarks.length]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-3">
        <button
          type="button"
          className="w-full text-xs px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
          onClick={handleAdd}
        >
          Add Bookmark
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar pb-3">
        {emptyState}
        {bookmarks.map((bookmark) => (
          <div key={bookmark.id} className="px-3 py-2">
            <button
              type="button"
              className="w-full text-left text-sm text-slate-900 hover:text-slate-700"
              onClick={() => onGoToPage(bookmark.pageIndex)}
            >
              {bookmark.title}
              <span className="ml-2 text-xs text-slate-400">Page {bookmark.pageIndex + 1}</span>
            </button>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-700"
                onClick={() => handleRename(bookmark)}
              >
                Rename
              </button>
              <button
                type="button"
                className="text-xs text-red-500 hover:text-red-600"
                onClick={() => handleDelete(bookmark)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
