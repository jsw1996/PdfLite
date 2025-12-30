import React, { useCallback, useEffect, useState } from 'react';
import { CanvasLayer } from '../CanvasLayer/CanvasLayer';
import { AnnotationLayer } from '../AnnotationLayer/AnnotationLayer';
import { usePdfController } from '../../providers/PdfControllerContextProvider';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { AnnotationType, type IAnnotation } from '../../types/annotation';
import { TextLayer } from '../TextLayer/TextLayer';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { LinkLayer, type ILinkItem } from '../LinkLayer/LinkLayer';
import { useSelectionHighlight } from '../../hooks/useSelectionHighlight';
import { useAddText } from '@/hooks/useAddText';

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
  const { setNativeAnnotationsForPage } = useAnnotation();

  const onCanvasReady = useCallback((c: HTMLCanvasElement) => {
    setPdfCanvas(c);
  }, []);

  const { scale } = usePdfState();

  const { handleHighlightOnInteraction } = useSelectionHighlight({ pageIndex, pdfCanvas });
  useAddText(containerEl, pageIndex);
  const refreshNativeAnnots = useCallback(() => {
    const native = controller.listNativeAnnotations(pageIndex, { scale: 1 });
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
  }, [controller, pageIndex, setNativeAnnotationsForPage]);

  useEffect(() => {
    if (!pdfCanvas) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh native annotations after canvas is ready
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
      <TextLayer pageIndex={pageIndex} scale={scale} />
    </div>
  );
};
