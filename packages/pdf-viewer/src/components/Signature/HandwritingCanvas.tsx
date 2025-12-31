import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@pdfviewer/ui/components/button';

export interface IHandwritingCanvasProps {
  onSignatureReady: (args: {
    pngDataUrl: string;
    pngBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
  }) => void;
}

export const HandwritingCanvas: React.FC<IHandwritingCanvasProps> = ({ onSignatureReady }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

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

      // Convert display coordinates to canvas coordinates
      // Canvas actual size is 600x200, but display size may be different
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

  const handleEnd = useCallback(() => {
    setIsDrawing(false);
    // Auto-update signature when drawing ends
    if (hasContent) {
      // Use setTimeout to ensure canvas is fully updated
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const pngDataUrl = canvas.toDataURL('image/png');
        const pngBytes = new Uint8Array(
          atob(pngDataUrl.split(',')[1])
            .split('')
            .map((c) => c.charCodeAt(0)),
        );

        onSignatureReady({
          pngDataUrl,
          pngBytes,
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

    // Set canvas size
    canvas.width = 600;
    canvas.height = 200;

    // Configure drawing style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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
