import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import type { IAnnotation, AnnotationType } from '../types/annotation';

export interface IAnnotationContextValue {
  selectedTool: AnnotationType | null;
  setSelectedTool: (tool: AnnotationType | null) => void;
  addAnnotation: (pageIndex: number, annotation: IAnnotation) => void;
  getAnnotationsForPage: (pageIndex: number) => IAnnotation[];
  setNativeAnnotationsForPage: (pageIndex: number, annotations: IAnnotation[]) => void;
  clearAnnotations: (pageIndex?: number) => void;
}

const AnnotationContext = createContext<IAnnotationContextValue | null>(null);

export function useAnnotation(): IAnnotationContextValue {
  const ctx = useContext(AnnotationContext);
  if (!ctx) throw new Error('useAnnotation must be used within AnnotationContextProvider');
  return ctx;
}

export function AnnotationContextProvider({ children }: { children: React.ReactNode }) {
  const [selectedTool, setSelectedTool] = useState<AnnotationType | null>(null);
  const [byPage, setByPage] = useState<Map<number, IAnnotation[]>>(new Map());

  const addAnnotation = useCallback((pageIndex: number, annotation: IAnnotation) => {
    setByPage((prev) => {
      const next = new Map(prev);
      const list = next.get(pageIndex) ?? [];
      next.set(pageIndex, [...list, annotation]);
      return next;
    });
  }, []);

  const getAnnotationsForPage = useCallback(
    (pageIndex: number) => byPage.get(pageIndex) ?? [],
    [byPage],
  );

  const setNativeAnnotationsForPage = useCallback(
    (pageIndex: number, annotations: IAnnotation[]) => {
      setByPage((prev) => {
        const next = new Map(prev);
        const existing = next.get(pageIndex) ?? [];
        const overlays = existing.filter((a) => a.source !== 'native');
        next.set(pageIndex, [...overlays, ...annotations]);
        return next;
      });
    },
    [],
  );

  const clearAnnotations = useCallback((pageIndex?: number) => {
    if (typeof pageIndex === 'number') {
      setByPage((prev) => {
        const next = new Map(prev);
        next.delete(pageIndex);
        return next;
      });
      return;
    }
    setByPage(new Map());
  }, []);

  const value = useMemo<IAnnotationContextValue>(
    () => ({
      selectedTool,
      setSelectedTool,
      addAnnotation,
      getAnnotationsForPage,
      setNativeAnnotationsForPage,
      clearAnnotations,
    }),
    [
      addAnnotation,
      clearAnnotations,
      getAnnotationsForPage,
      selectedTool,
      setNativeAnnotationsForPage,
    ],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
