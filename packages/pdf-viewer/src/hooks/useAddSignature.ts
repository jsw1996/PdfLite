import { useAnnotation } from '../providers/AnnotationContextProvider';
import { useEffect, useCallback, useState } from 'react';
import { generateAnnotationId, type ISignatureAnnotation, type IAnnotation } from '../annotations';

export interface ISignatureData {
  pngDataUrl: string;
  pngBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
}

export const useAddSignature = (pageElement: HTMLDivElement | null, pageIndex: number) => {
  const { selectedTool, addAnnotation, setSelectedTool } = useAnnotation();
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingSignature, setPendingSignature] = useState<ISignatureData | null>(null);

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

  const handleSignatureReady = useCallback(
    (signatureData: ISignatureData) => {
      if (!clickPosition) return;

      setPendingSignature(signatureData);
    },
    [clickPosition],
  );

  // Apply signature when both position and signature data are ready
  useEffect(() => {
    if (!clickPosition || !pendingSignature) return;

    const aspectRatio = pendingSignature.widthPx / pendingSignature.heightPx;
    const defaultHeight = 100; // 默认高度 100px
    const defaultWidth = defaultHeight * aspectRatio;

    // Create signature annotation
    const annotation: ISignatureAnnotation = {
      id: generateAnnotationId('signature'),
      type: 'signature',
      source: 'overlay',
      pageIndex,
      position: clickPosition,
      imageDataUrl: pendingSignature.pngDataUrl,
      imageBytes: pendingSignature.pngBytes,
      width: defaultWidth,
      height: defaultHeight,
      createdAt: Date.now(),
    };

    addAnnotation(annotation as IAnnotation);
    setSelectedTool(null);

    // Use setTimeout to avoid calling setState synchronously in effect
    setTimeout(() => {
      setIsDialogOpen(false);
      setClickPosition(null);
      setPendingSignature(null);
    }, 0);
  }, [clickPosition, pendingSignature, pageIndex, addAnnotation, setSelectedTool]);

  return {
    isDialogOpen,
    setIsDialogOpen,
    onSignatureReady: handleSignatureReady,
  };
};
