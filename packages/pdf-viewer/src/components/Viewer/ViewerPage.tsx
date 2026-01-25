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
} from '../../annotations';
import { TextLayer } from '../TextLayer/TextLayer';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { LinkLayer } from '../LinkLayer/LinkLayer';
import { useSelectionHighlight } from '../../hooks/useSelectionHighlight';
import { useAddText } from '@/hooks/useAddText';
import { useAddSignature } from '@/hooks/useAddSignature';
import { SignatureDialog } from '../Signature/SignatureDialog';

const FPDF_ANNOTATION_SUBTYPE_LINK = 2;
const FPDF_ANNOTATION_SUBTYPE_HIGHLIGHT = 9;
const FPDF_ANNOTATION_SUBTYPE_INK = 15;

export interface IViewerPageProps {
  pageIndex: number;
  registerPageElement: (index: number, el: HTMLDivElement | null) => void;
}

export const ViewerPage: React.FC<IViewerPageProps> = ({ pageIndex, registerPageElement }) => {
  const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const { controller, goToPage } = usePdfController();
  const { setNativeAnnotationsForPage } = useAnnotation();

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
        registerPageElement(pageIndex, el);
      }}
      data-slot={`viewer-page-container-${pageIndex}`}
      data-page-index={pageIndex}
      className="relative z-0 w-fit mx-auto mb-4"
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
