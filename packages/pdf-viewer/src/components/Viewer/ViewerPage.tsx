import React, { useCallback, useEffect, useState } from 'react';
import { CanvasLayer } from '../CanvasLayer/CanvasLayer';
import { AnnotationLayer } from '../AnnotationLayer/AnnotationLayer';
import { usePdfController } from '../../providers/PdfControllerContextProvider';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import {
  type IAnnotation,
  type IDrawAnnotation,
  type IHighlightAnnotation,
  ANNOTATION_COLORS,
  isDrawAnnotation,
  hitTestDrawAnnotations,
} from '../../annotations';
import { TextLayer } from '../TextLayer/TextLayer';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { LinkLayer } from '../LinkLayer/LinkLayer';
import { FormLayer } from '../FormLayer/FormLayer';
import { useSelectionHighlight } from '../../hooks/useSelectionHighlight';
import { useAddText } from '@/hooks/useAddText';
import { useAddSignature } from '@/hooks/useAddSignature';
import { SignatureDialog } from '../Signature/SignatureDialog';

const FPDF_ANNOTATION_SUBTYPE_LINK = 2;
const FPDF_ANNOTATION_SUBTYPE_HIGHLIGHT = 9;
const FPDF_ANNOTATION_SUBTYPE_INK = 15;

export interface IViewerPageProps {
  pageIndex: number;
  /** Optional callback to register the page element for tracking. Used by non-virtualized viewers. */
  registerPageElement?: (index: number, el: HTMLDivElement | null) => void;
}

export const ViewerPage: React.FC<IViewerPageProps> = ({ pageIndex, registerPageElement }) => {
  const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const { controller, goToPage } = usePdfController();
  const {
    setNativeAnnotationsForPage,
    selectedTool,
    isEditMode,
    getAnnotationsForPage,
    setSelectedDrawId,
  } = useAnnotation();

  // Select tool (no annotation tool, not editing) lets the user click a stroke
  // to select it. Hit-testing happens here, in the page's capture phase, so a
  // miss falls through to links/forms/text/text-boxes instead of being eaten by
  // a full-page canvas overlay.
  const isSelectMode = selectedTool === null && !isEditMode;
  const handleSelectPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isSelectMode || !pdfCanvas) return;
      // Let DOM annotations (text boxes) handle their own selection.
      if ((e.target as HTMLElement).closest('.text-annotation-box')) return;

      const rect = pdfCanvas.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Only overlay strokes are selectable — native (committed/original) ink is
      // not removable, so selecting it would be a dead end.
      const strokes = getAnnotationsForPage(pageIndex)
        .filter(isDrawAnnotation)
        .filter((a) => a.source === 'overlay');
      const hitId = hitTestDrawAnnotations(point, strokes);
      if (hitId) {
        // Suppress the default text-caret placement, but let the event keep
        // propagating so an open text box can deselect via its outside-click.
        e.preventDefault();
        setSelectedDrawId(hitId);
      } else {
        setSelectedDrawId(null);
      }
    },
    [isSelectMode, pdfCanvas, getAnnotationsForPage, pageIndex, setSelectedDrawId],
  );

  const onCanvasReady = useCallback((c: HTMLCanvasElement) => {
    setPdfCanvas(c);
  }, []);

  const { scale } = usePdfState();

  const { handleHighlightOnInteraction } = useSelectionHighlight({ pageIndex, pdfCanvas });
  useAddText(containerEl, pageIndex);

  const { isDialogOpen, setIsDialogOpen, onSignatureReady } = useAddSignature(
    containerEl,
    pageIndex,
  );
  const refreshNativeAnnots = useCallback(() => {
    const native = controller.listNativeAnnotations(pageIndex, { scale: 1 });

    // Convert native annotations to our new type system
    const converted: IAnnotation[] = native
      .filter((a) => a.subtype !== FPDF_ANNOTATION_SUBTYPE_LINK)
      .map((a): IAnnotation => {
        const isHighlight =
          a.subtype === FPDF_ANNOTATION_SUBTYPE_HIGHLIGHT ||
          a.subtype === FPDF_ANNOTATION_SUBTYPE_INK;

        if (isHighlight && a.shape === 'polygon' && a.points.length >= 4) {
          // Convert polygon points to rect for highlight annotations
          const xs = a.points.map((p) => p.x);
          const ys = a.points.map((p) => p.y);
          const highlight: IHighlightAnnotation = {
            id: a.id,
            type: 'highlight',
            source: 'native',
            pageIndex,
            rects: [
              {
                left: Math.min(...xs),
                top: Math.min(...ys),
                width: Math.max(...xs) - Math.min(...xs),
                height: Math.max(...ys) - Math.min(...ys),
              },
            ],
            color: ANNOTATION_COLORS.HIGHLIGHT,
            createdAt: Date.now(),
          };
          return highlight;
        } else {
          // Draw annotation (ink strokes)
          const draw: IDrawAnnotation = {
            id: a.id,
            type: 'draw',
            source: 'native',
            pageIndex,
            points: a.points,
            color: `rgba(${a.color.r}, ${a.color.g}, ${a.color.b}, ${Math.min(1, Math.max(0, a.color.a / 255))})`,
            strokeWidth: a.strokeWidth,
            createdAt: Date.now(),
          };
          return draw;
        }
      });
    setNativeAnnotationsForPage(pageIndex, converted);
  }, [controller, pageIndex, setNativeAnnotationsForPage]);

  useEffect(() => {
    if (!pdfCanvas) return;

    refreshNativeAnnots();
  }, [pdfCanvas, refreshNativeAnnots]);

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
        registerPageElement?.(pageIndex, el);
      }}
      data-slot={`viewer-page-container-${pageIndex}`}
      data-page-index={pageIndex}
      className="relative z-0 w-fit mx-auto"
      onPointerDownCapture={handleSelectPointerDown}
      onMouseUpCapture={handleHighlightOnInteraction}
      onKeyUpCapture={handleHighlightOnInteraction}
    >
      <CanvasLayer
        data-slot={`viewer-canvas-${pageIndex}`}
        pageIndex={pageIndex}
        scale={scale}
        onCanvasReady={onCanvasReady}
      />
      <LinkLayer
        pageIndex={pageIndex}
        pdfCanvas={pdfCanvas}
        containerEl={containerEl}
        onOpenExternal={(uri) => window.open(uri, '_blank', 'noopener,noreferrer')}
        onGoToPage={(p) => goToPage(p, { scrollIntoView: true, scrollIntoPreview: true })}
      />
      <FormLayer pageIndex={pageIndex} pdfCanvas={pdfCanvas} containerEl={containerEl} />
      <AnnotationLayer
        pageIndex={pageIndex}
        pdfCanvas={pdfCanvas}
        containerEl={containerEl}
        onCommitHighlight={onCommitHighlight}
      />
      <TextLayer pageIndex={pageIndex} scale={scale} />
      <SignatureDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSignatureReady={onSignatureReady}
      />
    </div>
  );
};
