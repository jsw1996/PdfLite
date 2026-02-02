/**
 * CanvasLayer of the PDF Viewer.
 * Call RenderPdf to draw the canvas.
 * RenderPDF can be expensive, so we optimize the zooming experience by:
 * 1. Rendering at low quality (lower scale) first for smooth zooming by css transform scale.
 * 2. Meanwhile, schedule a high quality render after a short delay (200ms) for debouncing.
 * 3. If user keeps zooming, keep rendering at low quality until user stops zooming for 200ms,
 *    then do the high quality render.
 * 4. When a new render is requested, cancel any in-progress render to avoid wasted work.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { LoaderIcon } from 'lucide-react';
import { usePdfController } from '../../providers/PdfControllerContextProvider';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { RENDER_CONFIG } from '@/utils/config';

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { controller, isInitialized } = usePdfController();
  const { renderVersion } = useAnnotation();

  // Track what scale the PDF is *currently* drawn at on the canvas
  // Initialize to 0 to indicate "not yet rendered" - this shows loader on initial load
  const [renderedScale, setRenderedScale] = useState(0);
  // Track actual canvas dimensions for crisp CSS sizing
  // CSS dimensions must be exactly canvas.width/pixelRatio to avoid browser scaling artifacts
  const [canvasDimensions, setCanvasDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AbortController for cancelling in-progress renders
  const abortControllerRef = useRef<AbortController | null>(null);
  const { width: pageWidth, height: pageHeight } = controller.getPageDimension(pageIndex);

  // Derive loading state: loading when not yet rendered or being re-rendered at different scale
  const isLoading = Math.abs(scale - renderedScale) > 0.01;

  // 1. Calculate CSS Transform
  // If we rendered at 1.0, and user zooms to 1.5:
  // visualScale = 1.5 / 1.0 = 1.5. We stretch the canvas 1.5x via CSS.
  // Once the heavy render finishes, renderedScale becomes 1.5, result is 1.0 (no stretch).
  const visualScale = useMemo(() => {
    if (renderedScale === 0) return 1;
    return scale / renderedScale;
  }, [scale, renderedScale]);

  // 2. The Heavy Render Function - memoized with useCallback
  // Supports cancellation of in-progress renders when a new render is requested
  const renderPdfCanvas = useCallback(async () => {
    if (!canvasRef.current || !isInitialized) return;

    // Cancel any previous in-progress render
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this render
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const pixelRatio = window.devicePixelRatio || 1;
      await controller.renderPdf(canvasRef.current, {
        pageIndex,
        scale,
        pixelRatio,
        signal: abortController.signal,
      });

      // Update our tracker so we know the canvas is now sharp at this scale
      setRenderedScale(scale);
      // Store actual canvas dimensions for precise CSS sizing
      // CSS dimensions must match canvas.width/pixelRatio exactly to avoid browser scaling
      setCanvasDimensions({
        width: canvasRef.current.width / pixelRatio,
        height: canvasRef.current.height / pixelRatio,
      });
      onCanvasReady?.(canvasRef.current);
    } catch (error) {
      // Ignore AbortError - this is expected when render is cancelled
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.warn('Failed to render PDF on canvas.', error);
    }
  }, [controller, isInitialized, pageIndex, scale, onCanvasReady]);

  useEffect(() => {
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    // Virtuoso handles virtualization - render immediately on mount,
    // debounce only for scale changes (zooming)
    const delay = renderedScale === 0 ? 16 : RENDER_CONFIG.RENDER_DEBOUNCE_MS;

    renderTimeoutRef.current = setTimeout(() => {
      void renderPdfCanvas();
    }, delay);

    return () => {
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
      // Cancel any in-progress render on cleanup (when component unmounts)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [scale, renderPdfCanvas, renderVersion, renderedScale]);

  return (
    // div wrapper for the layout update on zooming
    <div
      style={{
        width: `${pageWidth * scale}px`,
        height: `${pageHeight * scale}px`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        className="pdf-canvas-layer z-0"
        // low resolution canvas while zooming for performance
        style={{
          // Use actual canvas dimensions / pixelRatio for crisp 1:1 pixel mapping
          // This avoids browser scaling artifacts that occur when CSS size doesn't
          // exactly match the canvas physical size / devicePixelRatio
          width: canvasDimensions
            ? `${canvasDimensions.width}px`
            : `${pageWidth * renderedScale}px`,
          height: canvasDimensions
            ? `${canvasDimensions.height}px`
            : `${pageHeight * renderedScale}px`,
          transform: `scale(${visualScale})`, // css for visual scaling update
          position: 'absolute',
          transformOrigin: 'top left',
          display: 'block',
          // Prevent browser interpolation for crisp rendering on HiDPI displays
          imageRendering: 'crisp-edges',
        }}
        {...props}
      />
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            zIndex: 10,
          }}
        >
          <LoaderIcon
            role="status"
            aria-label="Loading"
            className="size-8 animate-spin text-gray-800 dark:text-gray-200"
          />
        </div>
      )}
    </div>
  );
};
