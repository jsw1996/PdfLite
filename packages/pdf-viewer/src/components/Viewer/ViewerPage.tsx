import React, { useCallback, useEffect, useState } from 'react';
import { CanvasLayer } from '../CanvasLayer/CanvasLayer';
import { AnnotationLayer } from '../AnnotationLayer/AnnotationLayer';
import { usePdfController } from '../../providers/PdfControllerContextProvider';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { AnnotationType, type IAnnotation } from '../../types/annotation';
import { TextLayer } from '../TextLayer/TextLayer';
import { usePdfState } from '@/providers/PdfStateContextProvider';

const DEFAULT_HIGHLIGHT_COLOR = 'rgb(248, 196, 72)';

export interface IViewerPageProps {
  pageIndex: number;
  registerPageElement: (index: number, el: HTMLDivElement | null) => void;
}

export const ViewerPage: React.FC<IViewerPageProps> = ({ pageIndex, registerPageElement }) => {
  const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const { controller } = usePdfController();
  const {
    setNativeAnnotationsForPage,
  }: {
    setNativeAnnotationsForPage: (pageIndex: number, annotations: IAnnotation[]) => void;
  } = useAnnotation();

  const onCanvasReady = useCallback((c: HTMLCanvasElement) => {
    setPdfCanvas(c);
  }, []);

  const { scale } = usePdfState();

  const refreshNativeAnnots = useCallback(() => {
    const native = controller.listNativeAnnotations(pageIndex, { scale });
    const converted: IAnnotation[] = native.map((a) => ({
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
      className="relative z-0 w-fit mx-auto mb-4"
    >
      <CanvasLayer
        data-slot={`viewer-canvas-${pageIndex}`}
        pageIndex={pageIndex}
        scale={scale}
        onCanvasReady={onCanvasReady}
      />
      <TextLayer pageIndex={pageIndex} scale={scale} />
      <AnnotationLayer
        pageIndex={pageIndex}
        pdfCanvas={pdfCanvas}
        containerEl={containerEl}
        onCommitHighlight={onCommitHighlight}
      />
    </div>
  );
};
