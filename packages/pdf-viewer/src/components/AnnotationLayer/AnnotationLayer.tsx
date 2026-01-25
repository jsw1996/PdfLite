import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { type IPoint } from '../../annotations';
import { useRenderAnnotation } from '../../hooks/useRenderAnnotation';
import { useInk } from '../../hooks/useInk';
import { cn } from '@pdfviewer/ui/lib/utils';
import { clampFinite } from '@/utils/shared';

export interface IAnnotationLayerProps {
  pageIndex: number;
  /** PDF canvas for position/size alignment */
  pdfCanvas: HTMLCanvasElement | null;
  /** ViewerPage container for calculating relative offsets */
  containerEl: HTMLElement | null;
  onCommitHighlight?: (args: { pageIndex: number; canvasPoints: IPoint[] }) => void;
}

interface ICanvasMetrics {
  top: number;
  left: number;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * Compute canvas metrics from refs. Returns null if refs are not ready.
 */
function computeMetrics(
  pdfCanvas: HTMLCanvasElement | null,
  containerEl: HTMLElement | null,
): ICanvasMetrics | null {
  if (!pdfCanvas || !containerEl) return null;
  const rect = pdfCanvas.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  const top = rect.top - containerRect.top;
  const left = rect.left - containerRect.left;

  return {
    top: clampFinite(top, 0),
    left: clampFinite(left, 0),
    cssWidth: clampFinite(rect.width, 0),
    cssHeight: clampFinite(rect.height, 0),
    pixelWidth: pdfCanvas.width,
    pixelHeight: pdfCanvas.height,
  };
}

export const AnnotationLayer: React.FC<IAnnotationLayerProps> = ({
  pageIndex,
  pdfCanvas,
  containerEl,
  onCommitHighlight,
}) => {
  const { selectedTool, addAnnotation, getAnnotationsForPage } = useAnnotation();
  const annotations = getAnnotationsForPage(pageIndex);

  const highlightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Track a version to force recalculation on resize
  const [metricsVersion, setMetricsVersion] = useState(0);

  // Compute metrics as derived state (will re-run when metricsVersion changes)
  const metrics = useMemo(() => {
    // metricsVersion is used to trigger recalculation
    void metricsVersion;
    return computeMetrics(pdfCanvas, containerEl);
  }, [pdfCanvas, containerEl, metricsVersion]);

  const updateMetrics = useCallback(() => {
    setMetricsVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!pdfCanvas) return;
    const ro = new ResizeObserver(() => updateMetrics());
    ro.observe(pdfCanvas);
    window.addEventListener('resize', updateMetrics);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [pdfCanvas, updateMetrics]);

  // Highlight is now text-selection based (handled by TextLayer/ViewerPage),
  // so AnnotationLayer only supports freehand interaction for DRAW.
  const canInteract = selectedTool === 'draw';

  const style = useMemo<React.CSSProperties>(() => {
    if (!metrics) return { display: 'none' };
    return {
      position: 'absolute',
      top: metrics.top,
      left: metrics.left,
      width: metrics.cssWidth,
      height: metrics.cssHeight,
      zIndex: 10,
      // pointerEvents controlled by specific canvas
    };
  }, [metrics]);

  const highlightCanvasStyle = useMemo<React.CSSProperties>(() => {
    return {
      ...style,
      // 关键：让高亮与底下 PDF 画面混合（不需要透明度也不会盖住文字）
      mixBlendMode: 'multiply',
      pointerEvents: 'none',
    };
  }, [style]);

  const drawCanvasStyle = useMemo<React.CSSProperties>(() => {
    return {
      ...style,
      mixBlendMode: 'normal',
      pointerEvents: canInteract ? 'auto' : 'none',
    };
  }, [canInteract, style]);

  const { currentPath, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useInk({
    canvasRef: drawCanvasRef,
    metrics,
    selectedTool: canInteract ? selectedTool : null,
    pageIndex,
    onAddAnnotation: addAnnotation,
    onCommitHighlight,
  });

  const { textAnnotations, signatureAnnotations } = useRenderAnnotation({
    highlightCanvasRef,
    drawCanvasRef,
    metrics,
    annotations,
    selectedTool,
    currentPath,
  });

  if (!metrics) return null;

  const annotationLayerClassName = cn(
    'absolute top-0 left-0 w-[stretch] h-[stretch]',
    selectedTool === 'text' && 'cursor-text',
    selectedTool === 'draw' && 'cursor-crosshair',
  );

  return (
    <div className={annotationLayerClassName}>
      <canvas
        ref={highlightCanvasRef}
        width={metrics.pixelWidth}
        height={metrics.pixelHeight}
        style={highlightCanvasStyle}
        className="annotation-layer annotation-layer-highlight"
      />
      <canvas
        ref={drawCanvasRef}
        width={metrics.pixelWidth}
        height={metrics.pixelHeight}
        style={drawCanvasStyle}
        className="annotation-layer annotation-layer-draw"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      {textAnnotations}
      {signatureAnnotations}
    </div>
  );
};
