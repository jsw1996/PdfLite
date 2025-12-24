import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasLayer } from '../CanvasLayer/CanvasLayer';
import { AnnotationLayer } from '../AnnotationLayer/AnnotationLayer';
import { usePdfController } from '../../providers/PdfControllerContextProvider';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { AnnotationType, type IAnnotation } from '../../types/annotation';
import { TextLayer } from '../TextLayer/TextLayer';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { LinkLayer, type ILinkItem } from '../LinkLayer/LinkLayer';

const DEFAULT_HIGHLIGHT_COLOR = 'rgb(248, 196, 72)';
const FPDF_ANNOTATION_SUBTYPE_LINK = 2;

export interface IViewerPageProps {
  pageIndex: number;
  registerPageElement: (index: number, el: HTMLDivElement | null) => void;
}

export const ViewerPage: React.FC<IViewerPageProps> = ({ pageIndex, registerPageElement }) => {
  const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const { controller, goToPage } = usePdfController();
  const [linkItems, setLinkItems] = useState<ILinkItem[]>([]);
  const { selectedTool, setSelectedTool, addAnnotation, setNativeAnnotationsForPage } =
    useAnnotation();
  const prevToolRef = useRef<AnnotationType | null>(null);

  const onCanvasReady = useCallback((c: HTMLCanvasElement) => {
    setPdfCanvas(c);
  }, []);

  const { scale } = usePdfState();

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

  const refreshNativeAnnots = useCallback(() => {
    const native = controller.listNativeAnnotations(pageIndex, { scale });
    const links = native
      .filter((a) => a.subtype === FPDF_ANNOTATION_SUBTYPE_LINK)
      .map(
        (a): ILinkItem => ({
          id: a.id,
          points: a.points,
          uri: a.uri,
          destPageIndex: a.destPageIndex,
        }),
      );
    setLinkItems(links);

    const converted: IAnnotation[] = native
      .filter((a) => a.subtype !== FPDF_ANNOTATION_SUBTYPE_LINK)
      .map((a) => ({
        id: a.id,
        // 原生注释里：HIGHLIGHT=9, INK=15（我们把两者都按“高亮效果”显示为黄色）
        type: a.subtype === 9 || a.subtype === 15 ? AnnotationType.HIGHLIGHT : AnnotationType.DRAW,
        shape: a.shape,
        source: 'native' as const,
        pageIndex,
        points: a.points,
        // 默认显示颜色：黄色（避免部分 PDF 高亮颜色存储在 CA/其它键里导致读出来发灰）
        color:
          a.subtype === 9 || a.subtype === 15
            ? DEFAULT_HIGHLIGHT_COLOR
            : `rgba(${a.color.r}, ${a.color.g}, ${a.color.b}, ${Math.min(1, Math.max(0, a.color.a / 255))})`,
        strokeWidth: a.strokeWidth,
        createdAt: Date.now(),
      }));
    setNativeAnnotationsForPage(pageIndex, converted);
  }, [controller, pageIndex, scale, setNativeAnnotationsForPage]);

  useEffect(() => {
    if (!pdfCanvas) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh native annotations after canvas is ready
    refreshNativeAnnots();
  }, [pdfCanvas, refreshNativeAnnots]);

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

  const onCommitHighlight = useCallback(
    ({ canvasPoints }: { pageIndex: number; canvasPoints: { x: number; y: number }[] }) => {
      controller.addInkHighlight(pageIndex, { scale, canvasPoints });
      refreshNativeAnnots();
    },
    [controller, pageIndex, refreshNativeAnnots, scale],
  );

  return (
    <div
      ref={(el) => {
        setContainerEl(el);
        registerPageElement(pageIndex, el);
      }}
      data-slot={`viewer-page-container-${pageIndex}`}
      data-page-index={pageIndex}
      className="relative z-0 w-fit mx-auto mb-4"
      onMouseUpCapture={() => {
        // Case 1: Highlight mode active -> selecting text applies highlight on mouse up.
        if (selectedTool === AnnotationType.HIGHLIGHT) {
          applyCurrentSelectionAsHighlight();
        }
      }}
      onKeyUpCapture={() => {
        if (selectedTool === AnnotationType.HIGHLIGHT) {
          applyCurrentSelectionAsHighlight();
        }
      }}
    >
      <CanvasLayer
        data-slot={`viewer-canvas-${pageIndex}`}
        pageIndex={pageIndex}
        scale={scale}
        onCanvasReady={onCanvasReady}
      />
      <TextLayer pageIndex={pageIndex} scale={scale} />
      <LinkLayer
        pageIndex={pageIndex}
        pdfCanvas={pdfCanvas}
        containerEl={containerEl}
        links={linkItems}
        onOpenExternal={(uri) => window.open(uri, '_blank', 'noopener,noreferrer')}
        onGoToPage={(p) => goToPage(p, { scrollIntoView: true, scrollIntoPreview: true })}
        onCreateLink={({ canvasRect, uri }) => {
          controller.addLinkAnnotation(pageIndex, { scale, canvasRect, uri });
          refreshNativeAnnots();
        }}
      />
      <AnnotationLayer
        pageIndex={pageIndex}
        pdfCanvas={pdfCanvas}
        containerEl={containerEl}
        onCommitHighlight={onCommitHighlight}
      />
    </div>
  );
};
