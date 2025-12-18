import React, { useEffect, useRef, useCallback } from 'react';

import { useInViewport } from '../../hooks/useInViewport';
import { usePdfController } from '../../providers/PdfControllerContextProvider';

export interface ICanvasLayerProps extends React.ComponentProps<'canvas'> {
  pageIndex?: number;
  scale?: number;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const CanvasLayer: React.FC<ICanvasLayerProps> = ({
  pageIndex = 0,
  scale = 1.0,

  onCanvasReady,
  ...props
}) => {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const { controller, isInitialized } = usePdfController();
  const isInViewport = useInViewport(canvas);
  const hasRendered = useRef(false);

  const renderPdfCanvas = useCallback(() => {
    if (!canvas.current || !isInitialized) {
      return;
    }

    try {
      controller.renderPdf(canvas.current, {
        pageIndex,
        scale,
        pixelRatio: window.devicePixelRatio || 1,
      });
      hasRendered.current = true;
      onCanvasReady?.(canvas.current);
    } catch (error) {
      console.warn('Failed to render PDF on canvas.', error);
    }
  }, [controller, isInitialized, pageIndex, scale, onCanvasReady]);

  useEffect(() => {
    if (isInViewport) {
      renderPdfCanvas();
    }
  }, [isInViewport, renderPdfCanvas]);

  return <canvas ref={canvas} className="pdf-canvas-layer z-0 h-[300px] w-[300px]" {...props} />;
};
