import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import type { IAnnotation, AnnotationType } from '../types/annotation';
import { usePdfState } from './PdfStateContextProvider';

export interface IAnnotationContextValue {
  selectedTool: AnnotationType | null;
  setSelectedTool: (tool: AnnotationType | null) => void;
  addAnnotation: (annotation: IAnnotation) => void;
  annotationStack: IAnnotation[];
  popAnnotation: () => IAnnotation | undefined;
  getAnnotationsForPage: (pageIndex: number) => IAnnotation[];
  setNativeAnnotationsForPage: (pageIndex: number, annotations: IAnnotation[]) => void;
}

const AnnotationContext = createContext<IAnnotationContextValue | null>(null);

export function useAnnotation(): IAnnotationContextValue {
  const ctx = useContext(AnnotationContext);
  if (!ctx) throw new Error('useAnnotation must be used within AnnotationContextProvider');
  return ctx;
}

export function AnnotationContextProvider({ children }: { children: React.ReactNode }) {
  const [selectedTool, setSelectedTool] = useState<AnnotationType | null>(null);
  const [annotationStack, setAnnotationStack] = useState<IAnnotation[]>([]);
  const scale = usePdfState().scale;
  const popAnnotation = useCallback(() => {
    let popped: IAnnotation | undefined;
    setAnnotationStack((prev) => {
      if (prev.length === 0) return prev;
      popped = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    return popped;
  }, []);

  const addAnnotation = useCallback(
    (annotation: IAnnotation) => {
      const normalizedPoints = annotation.points.map((point) => ({
        x: point.x / scale,
        y: point.y / scale,
      }));
      const normalizedAnnotation = { ...annotation, points: normalizedPoints };
      setAnnotationStack((prev) => [...prev, normalizedAnnotation]);
    },
    [scale],
  );

  const getAnnotationsForPage = useCallback(
    (pageIndex: number) =>
      annotationStack
        .filter((a) => a.pageIndex === pageIndex)
        .map((annotation) => {
          return {
            ...annotation,
            points: annotation.points.map((point) => ({
              x: point.x * scale,
              y: point.y * scale,
            })),
          };
        }) ?? [],
    [annotationStack, scale],
  );

  const setNativeAnnotationsForPage = useCallback(
    (pageIndex: number, annotations: IAnnotation[]) => {
      setAnnotationStack((prev) => {
        if (prev.some((a) => a.source === 'native' && a.pageIndex === pageIndex)) {
          return prev;
        } else {
          return [...annotations, ...prev];
        }
      });
    },
    [],
  );

  const value = useMemo<IAnnotationContextValue>(
    () => ({
      selectedTool,
      setSelectedTool,
      addAnnotation,
      getAnnotationsForPage,
      setNativeAnnotationsForPage,
      annotationStack,
      popAnnotation,
    }),
    [
      addAnnotation,
      getAnnotationsForPage,
      selectedTool,
      setNativeAnnotationsForPage,
      annotationStack,
      popAnnotation,
    ],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
