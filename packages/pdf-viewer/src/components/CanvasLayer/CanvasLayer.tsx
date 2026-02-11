// CanvasLayer.tsx
/**
 * CanvasLayer of the PDF Viewer.
 * Call RenderPdf to draw the canvas.
 * RenderPDF can be expensive, so we optimize the zooming experience by:
 * 1. Rendering at the last drawn scale (renderedScale) and scaling visually via CSS transform for smooth zooming.
 * 2. Debouncing a high quality render at the target scale after a short delay.
 * 3. Cancelling in-progress renders when a new render is requested.
 *
 * Flicker fixes in this version:
 * - Do NOT show per-page loader during zoom (only on initial render).
 * - Do NOT schedule redundant renders after renderedScale updates unless needed.
 * - Avoid layout-affecting borders (use outline instead).
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Spinner } from '@pdfviewer/ui/components/spinner';
import { usePdfController } from '../../providers/PdfControllerContextProvider';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { RENDER_CONFIG } from '@/utils/config';

export interface ICanvasLayerProps extends React.ComponentProps<'canvas'> {
  pageIndex?: number;
  scale?: number;
  hidden?: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const CanvasLayer: React.FC<ICanvasLayerProps> = ({
  pageIndex = 0,
  scale = 1.0,
  hidden = false,
  onCanvasReady,
  ...props
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { controller, isInitialized } = usePdfController();
  const { renderVersion } = useAnnotation();

  // Track the scale the PDF is currently drawn at on the canvas
  const [renderedScale, setRenderedScale] = useState(0);

  // CSS dimensions must match canvas.width/pixelRatio to avoid browser resampling artifacts
  const [canvasDimensions, setCanvasDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track last annotation version we actually rendered
  const lastRenderedVersionRef = useRef(renderVersion);

  const { width: pageWidth, height: pageHeight } = controller.getPageDimension(pageIndex);

  // Only show loader on initial render (avoid flicker/spinners during zoom)
  const showLoader = renderedScale === 0;

  // Visual scale for smooth zooming: target scale / rendered scale
  const visualScale = useMemo(() => {
    if (renderedScale === 0) return 1;
    return scale / renderedScale;
  }, [scale, renderedScale]);

  const renderPdfCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !isInitialized) return;

    // Cancel any previous in-progress render
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const pixelRatio = window.devicePixelRatio || 1;

    try {
      await controller.renderPdf(canvas, {
        pageIndex,
        scale,
        pixelRatio,
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      // Mark that this scale + annotation version are now sharp
      lastRenderedVersionRef.current = renderVersion;
      setRenderedScale(scale);
      setCanvasDimensions({
        width: canvas.width / pixelRatio,
        height: canvas.height / pixelRatio,
      });

      onCanvasReady?.(canvas);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;

      console.warn('Failed to render PDF on canvas.', error);
    }
  }, [controller, isInitialized, pageIndex, scale, onCanvasReady, renderVersion]);

  // Debounce expensive render; only run when actually needed
  useEffect(() => {
    if (!isInitialized || !canvasRef.current) return;

    const needsScaleRender = renderedScale === 0 || Math.abs(scale - renderedScale) > 0.01;
    const needsVersionRender = renderVersion !== lastRenderedVersionRef.current;

    const needsRender = needsScaleRender || needsVersionRender;
    if (!needsRender) return;

    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    // Render immediately on first mount; debounce subsequent renders (zooming/annotations)
    const delay = renderedScale === 0 ? 0 : RENDER_CONFIG.RENDER_DEBOUNCE_MS;

    renderTimeoutRef.current = setTimeout(() => {
      void renderPdfCanvas();
    }, delay);

    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
        renderTimeoutRef.current = null;
      }
    };
  }, [isInitialized, scale, renderVersion, renderedScale, renderPdfCanvas]);

  // Abort any in-progress render on unmount
  useEffect(() => {
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
        renderTimeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      style={{
        width: `${pageWidth * scale}px`,
        height: `${pageHeight * scale}px`,
        overflow: 'hidden',
        position: 'relative',
        // Use outline so it doesn't affect layout sizing (prevents virtualizer measurement jitter)
        outline: '1px solid #e7e5e598',
        outlineOffset: 0,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        backgroundColor: '#fff',
      }}
    >
      <canvas
        ref={canvasRef}
        className="pdf-canvas-layer z-0"
        style={{
          width: canvasDimensions
            ? `${canvasDimensions.width}px`
            : `${pageWidth * renderedScale}px`,
          height: canvasDimensions
            ? `${canvasDimensions.height}px`
            : `${pageHeight * renderedScale}px`,
          transform: `scale(${visualScale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          display: 'block',
          imageRendering: 'crisp-edges',
          willChange: 'transform',
          visibility: hidden ? 'hidden' : undefined,
        }}
        {...props}
      />

      {showLoader && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Spinner className="size-8 text-black" />
        </div>
      )}
    </div>
  );
};
