import { useAnnotation } from '../providers/AnnotationContextProvider';
import { useEffect, useCallback, useState } from 'react';
import { generateAnnotationId, type ISignatureAnnotation, type IAnnotation } from '../annotations';

export interface ISignatureData {
  pngDataUrl: string;
  pngBytes: Uint8Array;
  rgbaBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
}

export const useAddSignature = (pageElement: HTMLDivElement | null, pageIndex: number) => {
  const { selectedTool, addAnnotation, setSelectedTool } = useAnnotation();
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (selectedTool !== 'signature') return;
      if (!pageElement) return;

      const rect = pageElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setClickPosition({ x, y });
      setIsDialogOpen(true);
    },
    [selectedTool, pageElement],
  );

  useEffect(() => {
    if (!pageElement) return;

    pageElement.addEventListener('click', handleClick);

    return () => {
      pageElement.removeEventListener('click', handleClick);
    };
  }, [pageElement, handleClick]);

  // Create the annotation directly in the apply handler. This runs from the
  // dialog's Apply button (a user event), where setState is batched and safe.
  // Doing it in an effect keyed on `addAnnotation` caused an infinite update
  // loop: addAnnotation calls history.run(), which changes the history context
  // identity, which gives addAnnotation a new identity, which re-fired the
  // effect while clickPosition/pendingSignature were still set — adding a fresh
  // signature each pass until React hit "Maximum update depth exceeded".
  const handleSignatureReady = useCallback(
    (signatureData: ISignatureData) => {
      if (!clickPosition) return;
      // Guard against a cleared/empty canvas (widthPx/heightPx === 0), which
      // would otherwise yield a NaN aspect ratio and a broken annotation.
      if (signatureData.widthPx <= 0 || signatureData.heightPx <= 0) return;

      const aspectRatio = signatureData.widthPx / signatureData.heightPx;
      const defaultHeight = 100; // 默认高度 100px
      const defaultWidth = defaultHeight * aspectRatio;

      // Create signature annotation
      const annotation: ISignatureAnnotation = {
        id: generateAnnotationId('signature'),
        type: 'signature',
        source: 'overlay',
        pageIndex,
        position: clickPosition,
        imageDataUrl: signatureData.pngDataUrl,
        imageRgbaBytes: signatureData.rgbaBytes,
        imageWidthPx: signatureData.widthPx,
        imageHeightPx: signatureData.heightPx,
        width: defaultWidth,
        height: defaultHeight,
        createdAt: Date.now(),
      };

      addAnnotation(annotation as IAnnotation);
      setSelectedTool(null);
      setIsDialogOpen(false);
      setClickPosition(null);
    },
    [clickPosition, pageIndex, addAnnotation, setSelectedTool],
  );

  return {
    isDialogOpen,
    setIsDialogOpen,
    onSignatureReady: handleSignatureReady,
  };
};
