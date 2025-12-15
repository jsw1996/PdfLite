import React, { useEffect } from 'react';

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
  const canvas = React.useRef<HTMLCanvasElement | null>(null);
  const { controller, isInitialized } = usePdfController();

  const renderPdfCanvas = React.useCallback(() => {
    if (!canvas.current || !isInitialized) {
      return;
    }

    try {
      controller.renderPdf(canvas.current, { pageIndex, scale });
      onCanvasReady?.(canvas.current);
    } catch (error) {
      console.warn('Failed to render PDF on canvas.', error);
      // PDF may not be loaded yet, silently ignore
    }
  }, [controller, isInitialized, onCanvasReady, pageIndex, scale]);

  useEffect(() => {
    renderPdfCanvas();
  }, [renderPdfCanvas]);

  return <canvas ref={canvas} className="pdf-canvas-layer mx-auto mt-8 z-0" {...props} />;
};
