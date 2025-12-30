import { useCallback, useEffect, useRef } from 'react';
import { useAnnotation } from '../providers/AnnotationContextProvider';
import {
  type IHighlightAnnotation,
  type IRect,
  generateAnnotationId,
  ANNOTATION_COLORS,
  ANNOTATION_TIMING,
} from '../annotations';

export interface IUseSelectionHighlightOptions {
  pageIndex: number;
  pdfCanvas: HTMLCanvasElement | null;
}

export function useSelectionHighlight({ pageIndex, pdfCanvas }: IUseSelectionHighlightOptions) {
  const { selectedTool, setSelectedTool, addAnnotation } = useAnnotation();
  const prevToolRef = useRef<typeof selectedTool>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyCurrentSelectionAsHighlight = useCallback((): boolean => {
    if (!pdfCanvas) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;

    const range = sel.getRangeAt(0);

    const findPageIndex = (n: Node | null): number | null => {
      let el: Element | null =
        n && n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n?.parentElement ?? null);
      while (el) {
        const v = el.getAttribute('data-page-index');
        if (v != null) {
          const idx = Number(v);
          return Number.isFinite(idx) ? idx : null;
        }
        el = el.parentElement;
      }
      return null;
    };

    const a = findPageIndex(sel.anchorNode);
    const f = findPageIndex(sel.focusNode);
    if (a !== pageIndex || f !== pageIndex) return false;

    const pdfRect = pdfCanvas.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects());
    const now = Date.now();

    // Collect all rects for this highlight annotation
    const rects: IRect[] = [];
    for (const r of clientRects) {
      const left = Math.max(r.left, pdfRect.left);
      const right = Math.min(r.right, pdfRect.right);
      const top = Math.max(r.top, pdfRect.top);
      const bottom = Math.min(r.bottom, pdfRect.bottom);
      const w = right - left;
      const h = bottom - top;
      if (w <= 0 || h <= 0) continue;

      rects.push({
        left: left - pdfRect.left,
        top: top - pdfRect.top,
        width: w,
        height: h,
      });
    }

    if (rects.length > 0) {
      // Create a single highlight annotation with all rects
      const annotation: IHighlightAnnotation = {
        id: generateAnnotationId('highlight'),
        type: 'highlight',
        source: 'overlay',
        pageIndex,
        rects,
        color: ANNOTATION_COLORS.HIGHLIGHT,
        createdAt: now,
      };
      addAnnotation(annotation);
      sel.removeAllRanges();
      return true;
    }
    return false;
  }, [addAnnotation, pageIndex, pdfCanvas]);

  // Case 2:
  // Highlight tool was inactive, user selected text, then clicked Highlight button.
  // We treat that click as "apply highlight to current selection", not "enter freehand mode".
  useEffect(() => {
    const prev = prevToolRef.current;
    prevToolRef.current = selectedTool;
    if (selectedTool !== 'highlight') return;
    const applied = applyCurrentSelectionAsHighlight();
    if (applied && prev == null) {
      setSelectedTool(null);
    }
  }, [applyCurrentSelectionAsHighlight, selectedTool, setSelectedTool]);

  const handleHighlightOnInteraction = useCallback(() => {
    // Case 1: Highlight mode active -> selecting text applies highlight on mouse/key up.
    if (selectedTool === 'highlight') {
      // Cancel any pending highlight application to handle double/triple-click
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      // Delay the highlight application to allow for double/triple-click selection
      highlightTimeoutRef.current = setTimeout(() => {
        highlightTimeoutRef.current = null;
        applyCurrentSelectionAsHighlight();
      }, ANNOTATION_TIMING.MULTI_CLICK_DELAY_MS);
    }
  }, [applyCurrentSelectionAsHighlight, selectedTool]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  return {
    applyCurrentSelectionAsHighlight,
    handleHighlightOnInteraction,
  };
}
