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

export interface IPdfControllerContextValue {
  controller: PdfController;
  isInitialized: boolean;
  error: Error | null;
  initialize: () => Promise<void>;
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
  const controllerRef = useRef<PdfController | null>(null);
  controllerRef.current ??= new PdfControllerClass();

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const initialize = useCallback(async () => {
    if (isInitialized) return;

    setError(null);
    try {
      await controllerRef.current!.ensureInitialized();
      setIsInitialized(true);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  }, [isInitialized]);

  useEffect(() => {
    if (!autoInitialize) return;
    void initialize();
  }, [autoInitialize, initialize]);

  const value = useMemo<IPdfControllerContextValue>(
    () => ({
      controller: controllerRef.current!,
      isInitialized,
      error,
      initialize,
    }),
    [error, initialize, isInitialized],
  );

  return <PdfControllerContext.Provider value={value}>{children}</PdfControllerContext.Provider>;
}
