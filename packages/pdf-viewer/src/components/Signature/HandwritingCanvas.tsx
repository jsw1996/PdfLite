import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@pdfviewer/ui/components/button';
import { safeBase64Decode } from '@/utils/shared';

/** Logical drawing surface size; the captured raster is supersampled from this. */
const LOGICAL_WIDTH = 600;
const LOGICAL_HEIGHT = 200;
/** On-screen stroke thickness in logical px (scaled up with the supersample factor). */
const STROKE_WIDTH = 2;

/**
 * Supersampling factor for the canvas backing store. The stroke is captured as a
 * raster and later scaled to fit the signature box and the page zoom, so a 1:1
 * 600x200 surface visibly aliases — both while drawing on a HiDPI screen and
 * after it's scaled up on the page. Rendering the backing store larger (and the
 * stroke width to match) lets the captured PNG carry enough resolution to stay
 * crisp. Tied to devicePixelRatio with headroom, capped to bound memory.
 */
function getSupersampleFactor(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(4, Math.max(2, Math.ceil(dpr * 1.5)));
}

export interface IHandwritingCanvasProps {
  onSignatureReady: (args: {
    pngDataUrl: string;
    pngBytes: Uint8Array;
    rgbaBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
  }) => void;
}

/**
 * Handwriting signature canvas component.
 *
 * @param onSignatureReady the callback for when the signature is ready
 * @constructor
 * @returns component for drawing handwriting signature on a canvas
 */
export const HandwritingCanvas: React.FC<IHandwritingCanvasProps> = ({ onSignatureReady }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  // Pending capture timer so it can be cancelled if the component unmounts
  // (e.g. dialog closes) before it fires, avoiding a callback on a stale parent.
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    };
  }, []);

  const getPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      let clientX: number;
      let clientY: number;

      if ('touches' in e) {
        // Touch event
        if (e.touches.length === 0) return null;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        // Mouse event
        clientX = e.clientX;
        clientY = e.clientY;
      }

      // Convert display coordinates to canvas (backing-store) coordinates.
      // The backing store is supersampled, so width/height differ from the
      // CSS display size; scale by the ratio so strokes land correctly.
      const displayX = clientX - rect.left;
      const displayY = clientY - rect.top;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      return {
        x: displayX * scaleX,
        y: displayY * scaleY,
      };
    },
    [],
  );

  /**
   * Handle start of drawing on canvas.
   */
  const handleStart = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const point = getPoint(e);
      if (!point) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      setIsDrawing(true);
      setHasContent(true);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    },
    [getPoint],
  );

  /**
   * Handle movement during drawing on canvas.
   */
  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;
      e.preventDefault();

      const point = getPoint(e);
      if (!point) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    },
    [isDrawing, getPoint],
  );

  /**
   * Handle end of drawing on canvas.
   */
  const handleEnd = useCallback(() => {
    setIsDrawing(false);
    // Auto-update signature when drawing ends
    if (hasContent) {
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
      // Use setTimeout to ensure canvas is fully updated
      captureTimerRef.current = setTimeout(() => {
        captureTimerRef.current = null;
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Convert canvas to PNG data URL (base64 encoded)
        const pngDataUrl = canvas.toDataURL('image/png');
        // Convert base64 string to Uint8Array with error handling
        const base64Data = pngDataUrl.split(',')[1];
        const pngBytes = safeBase64Decode(base64Data);

        if (!pngBytes) {
          console.error('Failed to decode signature image data');
          return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('Failed to get canvas context for image data');
          return;
        }
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const rgbaBytes = new Uint8Array(imageData.data);

        onSignatureReady({
          pngDataUrl,
          pngBytes,
          rgbaBytes,
          widthPx: canvas.width,
          heightPx: canvas.height,
        });
      }, 0);
    }
  }, [hasContent, onSignatureReady]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    // Clear signature data when canvas is cleared
    onSignatureReady({
      pngDataUrl: '',
      pngBytes: new Uint8Array(0),
      rgbaBytes: new Uint8Array(0),
      widthPx: 0,
      heightPx: 0,
    });
  }, [onSignatureReady]);

  // Initialize canvas
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas backing-store size (supersampled for a crisp, alias-free
    // capture). getPoint() maps pointer coords via canvas.width / rect.width, so
    // strokes still land correctly regardless of this resolution.
    const supersample = getSupersampleFactor();
    canvas.width = LOGICAL_WIDTH * supersample;
    canvas.height = LOGICAL_HEIGHT * supersample;

    // Configure drawing style. Scale the line width by the supersample factor so
    // the on-screen thickness is unchanged by the higher backing resolution.
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = STROKE_WIDTH * supersample;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair touch-none"
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          style={{ width: '100%', height: '200px' }}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleClear} variant="outline" disabled={!hasContent}>
          Clear
        </Button>
      </div>
    </div>
  );
};
