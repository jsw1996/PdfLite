import React from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { DrawStyleToolbar } from './DrawStyleToolbar';
import { HighlightStyleToolbar } from './HighlightStyleToolbar';

/**
 * Right-docked vertical palette that surfaces styling controls for the active
 * annotation tool. Shown for the draw and highlight tools; hidden otherwise.
 */
export const StyleDock: React.FC = () => {
  const {
    selectedTool,
    drawColor,
    setDrawColor,
    drawStrokeWidth,
    setDrawStrokeWidth,
    highlightColor,
    setHighlightColor,
  } = useAnnotation();

  if (selectedTool !== 'draw' && selectedTool !== 'highlight') return null;

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-40 flex items-center pr-3">
      <div className="pointer-events-auto rounded-xl border border-border/60 bg-popover/95 p-2.5 shadow-lg backdrop-blur-sm">
        {selectedTool === 'draw' ? (
          <DrawStyleToolbar
            color={drawColor}
            strokeWidth={drawStrokeWidth}
            onColorChange={setDrawColor}
            onStrokeWidthChange={setDrawStrokeWidth}
          />
        ) : (
          <HighlightStyleToolbar color={highlightColor} onColorChange={setHighlightColor} />
        )}
      </div>
    </div>
  );
};

StyleDock.displayName = 'StyleDock';
