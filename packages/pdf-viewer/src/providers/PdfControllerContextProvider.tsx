/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import type { PdfController } from '@pdfviewer/controller';
import { PdfController as PdfControllerClass } from '@pdfviewer/controller';

/** Handler type for scrolling to a specific page index */
export type ScrollToIndexHandler = (index: number) => void;

export interface IPdfControllerContextValue {
  controller: PdfController;
  isInitialized: boolean;
  error: Error | null;
  initialize: () => Promise<void>;
  isLoaded: boolean;
  setIsLoaded: (isLoaded: boolean) => void;
  currentPage: number;
  goToPage: (
    page: number,
    options?: { scrollIntoView?: boolean; scrollIntoPreview?: boolean },
  ) => void;
  /** Register a scroll handler from the virtualized viewer */
  registerScrollToIndex: (handler: ScrollToIndexHandler) => void;
}

const PdfControllerContext = createContext<IPdfControllerContextValue | null>(null);

export function usePdfController(): IPdfControllerContextValue {
  const ctx = useContext(PdfControllerContext);
  if (!ctx) {
    throw new Error('usePdfController must be used within PdfControllerContextProvider');
  }
  return ctx;
}

interface IPdfControllerContextProviderProps {
  children: ReactNode;
  autoInitialize?: boolean;
}

export function PdfControllerContextProvider({
  children,
  autoInitialize = true,
}: IPdfControllerContextProviderProps) {
  const [controller] = useState<PdfController>(() => {
    const instance = new PdfControllerClass();
    return instance;
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Ref for virtualized viewer's scrollToIndex handler
  const scrollToIndexRef = useRef<ScrollToIndexHandler | null>(null);

  const registerScrollToIndex = useCallback((handler: ScrollToIndexHandler) => {
    scrollToIndexRef.current = handler;
  }, []);

  const goToPage = useCallback(
    (page: number, options?: { scrollIntoView?: boolean; scrollIntoPreview?: boolean }) => {
      const { scrollIntoView = true, scrollIntoPreview = true } = options ?? {};
      setCurrentPage(page);

      const isInViewport = (element: Element | null) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
      };

      // Scroll preview sidebar
      const previewCanvas = document.querySelector(`[data-preview-index="${page}"]`);
      if (scrollIntoPreview && !isInViewport(previewCanvas)) {
        previewCanvas?.scrollIntoView({ behavior: 'smooth' });
      }

      // Scroll main viewer - use virtualized handler if available
      if (scrollIntoView) {
        if (scrollToIndexRef.current) {
          scrollToIndexRef.current(page);
        } else {
          // Fallback to DOM query
          const viewerCanvas = document.querySelector(`[data-page-index="${page}"]`);
          if (!isInViewport(viewerCanvas)) {
            viewerCanvas?.scrollIntoView({
              behavior: 'instant',
              block: 'center',
              inline: 'center',
            });
          }
        }
      }
    },
    [],
  );
  const initialize = useCallback(async () => {
    if (isInitialized) return;

    setError(null);
    try {
      await controller.ensureInitialized();
      setIsInitialized(true);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  }, [controller, isInitialized]);

  useEffect(() => {
    if (!autoInitialize) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-initialize intentionally updates state after async init
    void initialize();
  }, [autoInitialize, initialize]);

  const value = useMemo<IPdfControllerContextValue>(
    () => ({
      controller,
      isInitialized,
      isLoaded,
      error,
      initialize,
      setIsLoaded,
      currentPage,
      goToPage,
      registerScrollToIndex,
    }),
    [
      controller,
      currentPage,
      error,
      initialize,
      isInitialized,
      isLoaded,
      goToPage,
      registerScrollToIndex,
    ],
  );

  return <PdfControllerContext.Provider value={value}>{children}</PdfControllerContext.Provider>;
}
