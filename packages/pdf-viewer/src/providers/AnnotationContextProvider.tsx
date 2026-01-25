import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import {
  type IAnnotation,
  type AnnotationType,
  normalizeAnnotation,
  denormalizeAnnotation,
  commitAnnotation,
} from '../annotations';
import { usePdfState } from './PdfStateContextProvider';
import { usePdfController } from './PdfControllerContextProvider';

export interface IAnnotationContextValue {
  /** Currently selected annotation tool */
  selectedTool: AnnotationType | null;
  /** Set the current annotation tool */
  setSelectedTool: (tool: AnnotationType | null) => void;
  /** Add an annotation (will be normalized for scale-independent storage) */
  addAnnotation: (annotation: IAnnotation) => void;
  /** All annotations in the stack */
  annotationStack: IAnnotation[];
  /** Remove and return the last overlay annotation */
  popAnnotation: () => IAnnotation | undefined;
  /** Get annotations for a specific page (denormalized for current scale) */
  getAnnotationsForPage: (pageIndex: number) => IAnnotation[];
  /** Set native annotations loaded from PDF */
  setNativeAnnotationsForPage: (pageIndex: number, annotations: IAnnotation[]) => void;
  /** Commit all overlay annotations to PDFium */
  commitAnnotations: () => void;
  /** Update an existing annotation by ID */
  updateAnnotation: (id: string, updates: Partial<IAnnotation>) => void;
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
  const { controller } = usePdfController();

  // Pre-compute a Map of annotations by pageIndex for efficient lookups
  const annotationsByPage = useMemo(() => {
    const map = new Map<number, IAnnotation[]>();
    for (const annotation of annotationStack) {
      const pageAnnotations = map.get(annotation.pageIndex);
      if (pageAnnotations) {
        pageAnnotations.push(annotation);
      } else {
        map.set(annotation.pageIndex, [annotation]);
      }
    }
    return map;
  }, [annotationStack]);

  const popAnnotation = useCallback(() => {
    let popped: IAnnotation | undefined;
    setAnnotationStack((prev) => {
      if (prev.length === 0) return prev;
      // Don't pop native annotations
      if (prev[prev.length - 1].source === 'native') return prev;
      popped = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    return popped;
  }, []);

  const addAnnotation = useCallback(
    (annotation: IAnnotation) => {
      // Normalize the annotation for scale-independent storage
      const normalizedAnnotation = normalizeAnnotation(annotation, scale);
      setAnnotationStack((prev) => [...prev, normalizedAnnotation]);
    },
    [scale],
  );

  const updateAnnotation = useCallback((id: string, updates: Partial<IAnnotation>) => {
    setAnnotationStack((prev) =>
      prev.map((ann) => {
        if (ann.id !== id) return ann;
        // Merge updates, ensuring type compatibility
        return { ...ann, ...updates } as IAnnotation;
      }),
    );
  }, []);

  // Memoized function that uses the pre-computed map for O(1) lookup
  const getAnnotationsForPage = useCallback(
    (pageIndex: number) => {
      const pageAnnotations = annotationsByPage.get(pageIndex) ?? [];
      return pageAnnotations.map((annotation) => denormalizeAnnotation(annotation, scale));
    },
    [annotationsByPage, scale],
  );

  const setNativeAnnotationsForPage = useCallback(
    (pageIndex: number, annotations: IAnnotation[]) => {
      setAnnotationStack((prev) => {
        // Check if we already have native annotations for this page
        if (prev.some((a) => a.source === 'native' && a.pageIndex === pageIndex)) {
          return prev;
        }
        // Prepend native annotations (they should appear below overlay annotations)
        return [...annotations, ...prev];
      });
    },
    [],
  );

  const commitAnnotationsCallback = useCallback(() => {
    // Commit all overlay annotations to PDFium using handlers
    annotationStack.forEach((annotation) => {
      if (annotation.source === 'overlay') {
        commitAnnotation(controller, annotation);
      }
    });
    // Mark all annotations as native after commit
    setAnnotationStack((prev) => prev.map((a) => ({ ...a, source: 'native' as const })));
  }, [annotationStack, controller]);

  const value = useMemo<IAnnotationContextValue>(
    () => ({
      selectedTool,
      setSelectedTool,
      addAnnotation,
      getAnnotationsForPage,
      setNativeAnnotationsForPage,
      annotationStack,
      popAnnotation,
      commitAnnotations: commitAnnotationsCallback,
      updateAnnotation,
    }),
    [
      addAnnotation,
      getAnnotationsForPage,
      selectedTool,
      setNativeAnnotationsForPage,
      annotationStack,
      popAnnotation,
      commitAnnotationsCallback,
      updateAnnotation,
    ],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
