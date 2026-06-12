import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  type IAnnotation,
  type AnnotationType,
  normalizeAnnotation,
  denormalizeAnnotation,
  commitAnnotation,
} from '../annotations';
import { usePdfState } from './PdfStateContextProvider';
import { usePdfController } from './PdfControllerContextProvider';
import { useEditHistory } from './EditHistoryContextProvider';

export interface IEditSessionData {
  /** Editor plain text saved across virtualized unmount/remount cycles. Key: `${pageIndex}:${paragraphIndex}` */
  savedEditorText: Map<string, string>;
  /** Original per-line CSS color strings saved before FPDFPage_GenerateContent corrupts them. Key: `${pageIndex}:${paragraphIndex}` */
  savedLineColors: Map<string, string[]>;
}

export interface IAnnotationContextValue {
  /** Currently selected annotation tool */
  selectedTool: AnnotationType | null;
  /** Set the current annotation tool */
  setSelectedTool: (tool: AnnotationType | null) => void;
  /** Whether inline text-editing mode is active */
  isEditMode: boolean;
  /** Toggle inline text-editing mode */
  setIsEditMode: (mode: boolean) => void;
  /** Add an annotation (will be normalized for scale-independent storage) */
  addAnnotation: (annotation: IAnnotation) => void;
  /** All annotations in the stack */
  annotationStack: IAnnotation[];
  /** Remove and return the last overlay annotation */
  popAnnotation: () => IAnnotation | undefined;
  /** Get annotations for a specific page (denormalized for current scale) */
  getAnnotationsForPage: (pageIndex: number) => IAnnotation[];
  /**
   * Returns true exactly once per annotation id — the first time it is queried
   * after being added. Used so freshly-created text boxes auto-focus/enter edit
   * mode while pre-existing ones remounting (virtualization/zoom) stay idle.
   */
  consumeNewAnnotation: (id: string) => boolean;
  /** Set native annotations loaded from PDF */
  setNativeAnnotationsForPage: (pageIndex: number, annotations: IAnnotation[]) => void;
  /** Commit all overlay annotations to PDFium */
  commitAnnotations: () => void;
  /** Commit overlay annotations to PDFium without changing React working state. */
  commitAnnotationsToPdfium: () => boolean;
  /** Update an existing annotation by ID */
  updateAnnotation: (id: string, updates: Partial<IAnnotation>) => void;
  /** Version counter that increments when page content changes (e.g., text flattened) */
  renderVersion: number;
  /** Force a canvas re-render after direct page-content edits */
  bumpRenderVersion: () => void;
  /** Mutable session data for text-editing mode, scoped to the current document */
  editSessionData: IEditSessionData;
}

const AnnotationContext = createContext<IAnnotationContextValue | null>(null);

// Stable empty array so pages without annotations always return the same
// reference (avoids spurious re-renders/redraws from a fresh [] each call).
const EMPTY_ANNOTATIONS: IAnnotation[] = [];

export function useAnnotation(): IAnnotationContextValue {
  const ctx = useContext(AnnotationContext);
  if (!ctx) throw new Error('useAnnotation must be used within AnnotationContextProvider');
  return ctx;
}

export function AnnotationContextProvider({ children }: { children: React.ReactNode }) {
  const [selectedTool, _setSelectedTool] = useState<AnnotationType | null>(null);
  const [isEditMode, _setIsEditMode] = useState(false);
  const [annotationStack, setAnnotationStack] = useState<IAnnotation[]>([]);
  const [renderVersion, setRenderVersion] = useState(0);
  const scale = usePdfState().scale;
  const { controller } = usePdfController();
  const history = useEditHistory();
  const annotationStackRef = useRef(annotationStack);
  useEffect(() => {
    annotationStackRef.current = annotationStack;
  }, [annotationStack]);

  // Mutable session data for text-editing mode. Created once via lazy
  // initializer so mutations don't trigger React re-renders (we never call
  // the setter). Using useState instead of useRef avoids "ref access during
  // render" errors from the React Compiler.
  const [editSessionData] = useState<IEditSessionData>(() => ({
    savedEditorText: new Map(),
    savedLineColors: new Map(),
  }));

  const setSelectedTool = useCallback((tool: AnnotationType | null) => {
    _setSelectedTool(tool);
    if (tool) _setIsEditMode(false);
  }, []);

  const setIsEditMode = useCallback(
    (mode: boolean) => {
      _setIsEditMode(mode);
      if (mode) {
        _setSelectedTool(null);
      } else {
        // Only clear transient editor text — preserve savedLineColors across
        // sessions because FPDFPage_GenerateContent corrupts the content stream's
        // color data, making FPDFText_GetFillColor unreliable for edited objects.
        editSessionData.savedEditorText.clear();
      }
    },
    [editSessionData],
  );

  // Document-level edit-mode teardown.
  // Child TextLayer effects fire before parent effects, so by the time this
  // runs every per-page commit has already landed. Owning the doc-wide
  // teardown here prevents the race that occurred when each virtualized
  // TextLayer called releaseEditPages/bumpRenderVersion in parallel.
  // setRenderVersion is queued via microtask to avoid the cascading-render
  // pattern the lint rule rejects (and to let the current commit phase finish
  // releasing edit-page pointers before invalidating canvases).
  const wasEditModeRef = useRef(false);
  useEffect(() => {
    if (isEditMode) {
      wasEditModeRef.current = true;
      return;
    }
    if (!wasEditModeRef.current) return;
    wasEditModeRef.current = false;
    controller.releaseEditPages();
    queueMicrotask(() => setRenderVersion((v) => v + 1));
  }, [isEditMode, controller]);

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
    const current = annotationStackRef.current;
    const popped = current[current.length - 1];
    if (!popped || popped.source === 'native') return undefined;
    history.run({
      label: 'Delete annotation',
      redo: () => {
        newAnnotationIdsRef.current.delete(popped.id);
        setAnnotationStack((prev) => prev.filter((ann) => ann.id !== popped.id));
      },
      undo: () => {
        setAnnotationStack((prev) => [...prev, popped]);
      },
    });
    return popped;
  }, [history]);

  // Ids of annotations created this session that have not yet been "claimed" by
  // their component on first mount (drives one-time auto-focus/edit).
  const newAnnotationIdsRef = useRef<Set<string>>(new Set());

  const addAnnotation = useCallback(
    (annotation: IAnnotation) => {
      // Normalize the annotation for scale-independent storage
      const normalizedAnnotation = normalizeAnnotation(annotation, scale);
      history.run({
        label: 'Add annotation',
        redo: () => {
          newAnnotationIdsRef.current.add(annotation.id);
          setAnnotationStack((prev) => {
            if (prev.some((ann) => ann.id === normalizedAnnotation.id)) return prev;
            return [...prev, normalizedAnnotation];
          });
        },
        undo: () => {
          newAnnotationIdsRef.current.delete(annotation.id);
          setAnnotationStack((prev) => prev.filter((ann) => ann.id !== normalizedAnnotation.id));
        },
      });
    },
    [history, scale],
  );

  const consumeNewAnnotation = useCallback(
    (id: string) => newAnnotationIdsRef.current.delete(id),
    [],
  );

  const updateAnnotation = useCallback(
    (id: string, updates: Partial<IAnnotation>) => {
      const before = annotationStackRef.current.find((ann) => ann.id === id);
      if (!before) return;
      // Stored annotations are normalized (scale=1). Updates come from UI in
      // denormalized (current scale) coordinates.
      const denormalized = denormalizeAnnotation(before, scale);
      const merged = { ...denormalized, ...updates } as IAnnotation;
      const after = normalizeAnnotation(merged, scale);
      history.run({
        label: 'Update annotation',
        coalesceKey: `annotation:${id}`,
        coalesceMs: 500,
        redo: () => {
          setAnnotationStack((prev) => prev.map((ann) => (ann.id === id ? after : ann)));
        },
        undo: () => {
          setAnnotationStack((prev) => prev.map((ann) => (ann.id === id ? before : ann)));
        },
      });
    },
    [history, scale],
  );

  // Pre-denormalize per page once per (annotations, scale) change so that
  // getAnnotationsForPage returns a stable array identity across renders.
  // Without this, every parent render produced a fresh array, defeating the
  // downstream useMemo/redraw memoization in the annotation render hook.
  const denormalizedByPage = useMemo(() => {
    const map = new Map<number, IAnnotation[]>();
    annotationsByPage.forEach((anns, pageIndex) => {
      map.set(
        pageIndex,
        anns.map((annotation) => denormalizeAnnotation(annotation, scale)),
      );
    });
    return map;
  }, [annotationsByPage, scale]);

  const getAnnotationsForPage = useCallback(
    (pageIndex: number) => denormalizedByPage.get(pageIndex) ?? EMPTY_ANNOTATIONS,
    [denormalizedByPage],
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

  const commitAnnotationsToPdfium = useCallback(() => {
    const overlays = annotationStackRef.current.filter(
      (annotation) => annotation.source === 'overlay',
    );
    overlays.forEach((annotation) => {
      commitAnnotation(controller, annotation);
    });
    return overlays.length > 0;
  }, [controller]);

  const commitAnnotations = useCallback(() => {
    // Check if any flattened annotations exist (text/signature)
    const hasFlattenedAnnotations = annotationStack.some(
      (a) => a.source === 'overlay' && (a.type === 'text' || a.type === 'signature'),
    );

    // Commit all overlay annotations to PDFium using handlers.
    commitAnnotationsToPdfium();
    // After commit:
    // - Text and signature annotations are flattened into page content (not real annotations),
    //   so they must be REMOVED from the stack (PDFium won't list them as annotations)
    // - Other annotations (ink, highlight) become real PDF annotations,
    //   so mark them as 'native' (they'll be found by listNativeAnnotations)
    setAnnotationStack((prev) =>
      prev
        .filter((a) => a.source !== 'overlay' || (a.type !== 'text' && a.type !== 'signature'))
        .map((a) => ({ ...a, source: 'native' as const })),
    );

    // Increment render version to trigger canvas re-render for flattened content
    if (hasFlattenedAnnotations) {
      setRenderVersion((v) => v + 1);
    }
  }, [annotationStack, commitAnnotationsToPdfium]);

  const bumpRenderVersion = useCallback(() => {
    setRenderVersion((v) => v + 1);
  }, []);

  const value = useMemo<IAnnotationContextValue>(
    () => ({
      selectedTool,
      setSelectedTool,
      isEditMode,
      setIsEditMode,
      addAnnotation,
      getAnnotationsForPage,
      consumeNewAnnotation,
      setNativeAnnotationsForPage,
      annotationStack,
      popAnnotation,
      commitAnnotations,
      commitAnnotationsToPdfium,
      updateAnnotation,
      renderVersion,
      bumpRenderVersion,
      editSessionData,
    }),
    [
      addAnnotation,
      getAnnotationsForPage,
      consumeNewAnnotation,
      selectedTool,
      setSelectedTool,
      isEditMode,
      setIsEditMode,
      setNativeAnnotationsForPage,
      annotationStack,
      popAnnotation,
      renderVersion,
      bumpRenderVersion,
      commitAnnotations,
      commitAnnotationsToPdfium,
      updateAnnotation,
      editSessionData,
    ],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
