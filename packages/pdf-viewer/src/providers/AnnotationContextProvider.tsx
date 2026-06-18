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
  DRAW_TOOL_DEFAULTS,
  HIGHLIGHT_TOOL_DEFAULTS,
} from '../annotations';
import { usePdfState } from './PdfStateContextProvider';
import { usePdfController } from './PdfControllerContextProvider';
import { useEditHistory } from './EditHistoryContextProvider';

export interface IAnnotationContextValue {
  /** Currently selected annotation tool */
  selectedTool: AnnotationType | null;
  /** Set the current annotation tool */
  setSelectedTool: (tool: AnnotationType | null) => void;
  /** Stroke color for the draw (pen) tool (CSS color string) */
  drawColor: string;
  /** Set the draw tool stroke color */
  setDrawColor: (color: string) => void;
  /** Stroke width for the draw (pen) tool (logical px at scale=1) */
  drawStrokeWidth: number;
  /** Set the draw tool stroke width */
  setDrawStrokeWidth: (width: number) => void;
  /** Id of the currently selected draw stroke (canvas annotation), or null */
  selectedDrawId: string | null;
  /** Select a draw stroke by id (null clears the selection) */
  setSelectedDrawId: (id: string | null) => void;
  /** Fill color for the highlight tool (CSS color string) */
  highlightColor: string;
  /** Set the highlight tool color */
  setHighlightColor: (color: string) => void;
  /** Add an annotation (will be normalized for scale-independent storage) */
  addAnnotation: (annotation: IAnnotation) => void;
  /** All annotations in the stack */
  annotationStack: IAnnotation[];
  /** Remove and return the last overlay annotation */
  popAnnotation: () => IAnnotation | undefined;
  /**
   * Remove a specific overlay annotation by ID. Pass `recordHistory: false`
   * for internal cleanup (e.g. discarding an empty text box) that should not
   * pollute the undo stack.
   */
  removeAnnotation: (id: string, recordHistory?: boolean) => void;
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
  const [drawColor, setDrawColor] = useState<string>(DRAW_TOOL_DEFAULTS.COLOR);
  const [drawStrokeWidth, setDrawStrokeWidth] = useState<number>(DRAW_TOOL_DEFAULTS.STROKE_WIDTH);
  const [selectedDrawId, setSelectedDrawId] = useState<string | null>(null);
  const [highlightColor, setHighlightColor] = useState<string>(HIGHLIGHT_TOOL_DEFAULTS.COLOR);
  const [annotationStack, setAnnotationStack] = useState<IAnnotation[]>([]);
  const [renderVersion, setRenderVersion] = useState(0);
  const scale = usePdfState().scale;
  const { controller } = usePdfController();
  const history = useEditHistory();
  const annotationStackRef = useRef(annotationStack);
  useEffect(() => {
    annotationStackRef.current = annotationStack;
  }, [annotationStack]);

  const setSelectedTool = useCallback((tool: AnnotationType | null) => {
    _setSelectedTool(tool);
    // A draw selection only makes sense while the draw tool is active.
    if (tool !== 'draw') setSelectedDrawId(null);
  }, []);

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

  const removeAnnotation = useCallback(
    (id: string, recordHistory = true) => {
      const target = annotationStackRef.current.find((ann) => ann.id === id);
      if (!target || target.source === 'native') return;
      if (!recordHistory) {
        newAnnotationIdsRef.current.delete(id);
        setAnnotationStack((prev) => prev.filter((ann) => ann.id !== id));
        return;
      }
      history.run({
        label: 'Delete annotation',
        redo: () => {
          newAnnotationIdsRef.current.delete(id);
          setAnnotationStack((prev) => prev.filter((ann) => ann.id !== id));
        },
        undo: () => {
          setAnnotationStack((prev) => [...prev, target]);
        },
      });
    },
    [history],
  );

  // Drop a stale selection if the stroke is gone (e.g. removed via undo/redo).
  // Queued via microtask so the clear lands after this render rather than
  // synchronously inside the effect (which the cascading-render lint rule rejects).
  useEffect(() => {
    if (selectedDrawId && !annotationStack.some((a) => a.id === selectedDrawId)) {
      queueMicrotask(() => setSelectedDrawId(null));
    }
  }, [annotationStack, selectedDrawId]);

  // Delete / Escape handling for a selected draw stroke. Mirrors the text box
  // behavior but lives here because strokes are canvas-rendered (no DOM node of
  // their own to receive key events). Ignored while typing into a field so it
  // never hijacks the caret.
  useEffect(() => {
    if (!selectedDrawId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeAnnotation(selectedDrawId, true);
        setSelectedDrawId(null);
      } else if (e.key === 'Escape') {
        setSelectedDrawId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedDrawId, removeAnnotation]);

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
    // Commit all overlay annotations to PDFium using handlers.
    const committedAny = commitAnnotationsToPdfium();
    // After commit:
    // - Signature annotations are flattened into page content (not real annotations),
    //   so they must be REMOVED from the stack (PDFium won't list them as annotations)
    // - Other annotations (ink, highlight) become real PDF annotations,
    //   so mark them as 'native' (they'll be found by listNativeAnnotations)
    setAnnotationStack((prev) =>
      prev
        .filter((a) => a.source !== 'overlay' || a.type !== 'signature')
        .map((a) => ({ ...a, source: 'native' as const })),
    );

    // Re-render the page bitmap so the just-committed annotations become visible.
    // This is required because the overlay no longer draws annotations once they
    // become 'native' (PDFium owns their rendering): flattened text/signature
    // content AND ink/highlight that transitioned to native are now displayed
    // solely by the freshly re-rendered bitmap.
    if (committedAny) {
      setRenderVersion((v) => v + 1);
    }
  }, [commitAnnotationsToPdfium]);

  const bumpRenderVersion = useCallback(() => {
    setRenderVersion((v) => v + 1);
  }, []);

  const value = useMemo<IAnnotationContextValue>(
    () => ({
      selectedTool,
      setSelectedTool,
      drawColor,
      setDrawColor,
      drawStrokeWidth,
      setDrawStrokeWidth,
      selectedDrawId,
      setSelectedDrawId,
      highlightColor,
      setHighlightColor,
      addAnnotation,
      getAnnotationsForPage,
      consumeNewAnnotation,
      setNativeAnnotationsForPage,
      annotationStack,
      popAnnotation,
      removeAnnotation,
      commitAnnotations,
      commitAnnotationsToPdfium,
      updateAnnotation,
      renderVersion,
      bumpRenderVersion,
    }),
    [
      addAnnotation,
      getAnnotationsForPage,
      consumeNewAnnotation,
      selectedTool,
      setSelectedTool,
      drawColor,
      drawStrokeWidth,
      selectedDrawId,
      highlightColor,
      setNativeAnnotationsForPage,
      annotationStack,
      popAnnotation,
      removeAnnotation,
      renderVersion,
      bumpRenderVersion,
      commitAnnotations,
      commitAnnotationsToPdfium,
      updateAnnotation,
    ],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
