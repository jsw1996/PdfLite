import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { useAnnotation } from '@/providers/AnnotationContextProvider';
import { convertRectsToBaseSpans } from './TextLayerUtils';

export interface ITextLayerProps {
  pageIndex: number;
  scale?: number;
}

/**
 * TextLayer component renders invisible but selectable text over the PDF canvas.
 * This enables text selection, copy/paste, and search functionality.
 */
export const TextLayer: React.FC<ITextLayerProps> = ({ pageIndex, scale = 1.5 }) => {
  const { controller, isInitialized } = usePdfController();
  const { renderVersion } = useAnnotation();
  const layerRef = useRef<HTMLDivElement | null>(null);

  const deferredScale = useDeferredValue(scale);

  // While the user is dragging a selection, an "end of content" backstop covers
  // the whole text layer. Absolutely-positioned glyph spans leave gaps between
  // them; when the pointer drifts into a gap the browser would otherwise resolve
  // the caret to the start of the container (selecting upward, above the anchor).
  // A transparent, user-select:none overlay makes every point fall inside the
  // layer, so the caret snaps to the nearest glyph instead. (PDF.js technique.)
  const [isSelecting, setIsSelecting] = useState(false);
  useEffect(() => {
    if (!isSelecting) return;
    const stop = () => setIsSelecting(false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, [isSelecting]);

  const textContent = useMemo(() => {
    // renderVersion is a manual invalidation key for flattened-content edits.
    void renderVersion;
    if (!isInitialized) return null;

    try {
      return controller.getPageTextContent(pageIndex);
    } catch (error) {
      console.warn('Failed to load text content for page', pageIndex, error);
      return null;
    }
  }, [controller, isInitialized, pageIndex, renderVersion]);

  const baseSpans = useMemo(() => {
    if (!textContent) return [];
    return convertRectsToBaseSpans(textContent.textRects);
  }, [textContent]);

  if (!textContent) {
    return null;
  }

  return (
    <div
      ref={layerRef}
      className="text-layer absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        width: `${textContent.pageWidth * deferredScale}px`,
        height: `${textContent.pageHeight * deferredScale}px`,
      }}
    >
      {/* End-of-content backstop: during an active selection drag it covers
          the layer behind glyph spans so pointer gaps still resolve to nearby text. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: isSelecting ? 0 : '100%',
          bottom: 0,
          cursor: 'text',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: isSelecting ? 'auto' : 'none',
        }}
      />
      <div
        style={{
          transform: `scale(${deferredScale})`,
          transformOrigin: '0 0',
        }}
        onMouseDown={(e) => {
          if (e.button === 0) setIsSelecting(true);
        }}
      >
        {baseSpans.map((span, index) => (
          <span
            key={`${span.left}-${span.top}-${index}`}
            className="absolute whitespace-pre select-text origin-top-left pointer-events-auto text-transparent selection:text-transparent selection:bg-[rgba(0,0,255,0.3)]"
            style={span.style}
          >
            {span.text}
          </span>
        ))}
      </div>
    </div>
  );
};
