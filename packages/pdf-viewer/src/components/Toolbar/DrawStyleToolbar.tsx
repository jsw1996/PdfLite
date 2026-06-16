import React from 'react';
import { cn } from '@pdfviewer/ui/lib/utils';
import { DRAW_COLOR_PRESETS, DRAW_STROKE_WIDTH_PRESETS } from '../../annotations';
import { ColorSwatches } from './ColorSwatches';

export interface IDrawStyleToolbarProps {
  /** Current stroke color as a CSS color string */
  color: string;
  /** Current stroke width in logical px at scale=1 */
  strokeWidth: number;
  onColorChange: (rgb: string) => void;
  onStrokeWidthChange: (width: number) => void;
}

const sectionLabel = 'text-[10px] font-medium uppercase tracking-wide text-foreground/50';

/**
 * Vertical styling palette for the draw (pen) tool. Lets the user pick stroke
 * width and color before drawing, and delete the selected stroke.
 */
export const DrawStyleToolbar: React.FC<IDrawStyleToolbarProps> = ({
  color,
  strokeWidth,
  onColorChange,
  onStrokeWidthChange,
}) => {
  return (
    <div className="flex w-max flex-col gap-2.5">
      {/* Stroke width */}
      <div className="flex flex-col items-center gap-1.5">
        <span className={sectionLabel}>Width</span>
        <div className="flex flex-col items-center gap-1.5">
          {DRAW_STROKE_WIDTH_PRESETS.map((width) => {
            const isActive = width === strokeWidth;
            // Visual dot grows with the stroke width, capped so the control stays compact.
            const dot = Math.min(18, 4 + width * 1.5);
            return (
              <button
                key={width}
                type="button"
                onClick={() => onStrokeWidthChange(width)}
                aria-label={`Stroke width ${width}`}
                aria-pressed={isActive}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/10',
                  isActive && 'bg-foreground/10 ring-1 ring-foreground/30',
                )}
              >
                <span
                  className="rounded-full bg-foreground/80"
                  style={{ width: dot, height: dot }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px w-full bg-border/60" />

      {/* Color */}
      <div className="flex flex-col items-center gap-1.5">
        <span className={sectionLabel}>Color</span>
        <ColorSwatches color={color} presets={DRAW_COLOR_PRESETS} onChange={onColorChange} />
      </div>
    </div>
  );
};

DrawStyleToolbar.displayName = 'DrawStyleToolbar';
