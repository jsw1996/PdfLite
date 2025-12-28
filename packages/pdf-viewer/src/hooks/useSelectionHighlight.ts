import { useCallback, useEffect, useRef } from 'react';
import { useAnnotation } from '../providers/AnnotationContextProvider';
import { AnnotationType } from '../types/annotation';

const DEFAULT_HIGHLIGHT_COLOR = 'rgb(248, 196, 72)';

// Delay to wait before applying highlight, to allow for double/triple-click detection
const MULTI_CLICK_DELAY_MS = 300;

export interface IUseSelectionHighlightOptions {
  pageIndex: number;
  pdfCanvas: HTMLCanvasElement | null;
}

export function useSelectionHighlight({ pageIndex, pdfCanvas }: IUseSelectionHighlightOptions) {
  const { selectedTool, setSelectedTool, addAnnotation } = useAnnotation();
  const prevToolRef = useRef<AnnotationType | null>(null);
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

    let added = 0;
    for (const r of clientRects) {
      const left = Math.max(r.left, pdfRect.left);
      const right = Math.min(r.right, pdfRect.right);
      const top = Math.max(r.top, pdfRect.top);
      const bottom = Math.min(r.bottom, pdfRect.bottom);
      const w = right - left;
      const h = bottom - top;
      if (w <= 0 || h <= 0) continue;

      const x = left - pdfRect.left;
      const y = top - pdfRect.top;

      // Add to overlay for immediate visual feedback
      addAnnotation({
        id: `selhl-${now}-${pageIndex}-${added}`,
        type: AnnotationType.HIGHLIGHT,
        shape: 'polygon',
        source: 'overlay',
        pageIndex,
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        color: DEFAULT_HIGHLIGHT_COLOR,
        strokeWidth: 0,
        createdAt: now,
      });
      added++;
    }

    if (added > 0) {
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
    if (selectedTool !== AnnotationType.HIGHLIGHT) return;
    const applied = applyCurrentSelectionAsHighlight();
    if (applied && prev == null) {
      setSelectedTool(null);
    }
  }, [applyCurrentSelectionAsHighlight, selectedTool, setSelectedTool]);

  const handleHighlightOnInteraction = useCallback(() => {
    // Case 1: Highlight mode active -> selecting text applies highlight on mouse/key up.
    if (selectedTool === AnnotationType.HIGHLIGHT) {
      // Cancel any pending highlight application to handle double/triple-click
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      // Delay the highlight application to allow for double/triple-click selection
      highlightTimeoutRef.current = setTimeout(() => {
        highlightTimeoutRef.current = null;
        applyCurrentSelectionAsHighlight();
      }, MULTI_CLICK_DELAY_MS);
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
