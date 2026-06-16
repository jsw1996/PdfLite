import React from 'react';
import { cn } from '@pdfviewer/ui/lib/utils';
import { colorKey, hexToRgbString, rgbStringToHex } from '../../utils/color';

export interface IColorSwatchesProps {
  /** Currently active color as a CSS color string */
  color: string;
  /** Preset color swatches (CSS color strings) */
  presets: readonly string[];
  onChange: (rgb: string) => void;
}

/**
 * A compact grid of preset color swatches plus a custom color picker. Shared by
 * the draw and highlight styling toolbars so both pick colors the same way.
 */
export const ColorSwatches: React.FC<IColorSwatchesProps> = ({ color, presets, onChange }) => {
  const activeKey = colorKey(color);
  return (
    <div className="flex flex-col items-center gap-1.5">
      {presets.map((preset) => {
        const isActive = colorKey(preset) === activeKey;
        return (
          <button
            key={preset}
            type="button"
            // Preserve any active text selection (highlight tool) when picking.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(preset)}
            aria-label={`Color ${preset}`}
            aria-pressed={isActive}
            className={cn(
              'h-6 w-6 rounded-full border border-black/15 transition-transform hover:scale-110',
              isActive && 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover',
            )}
            style={{ backgroundColor: preset }}
          />
        );
      })}
      {/* Custom color */}
      <label
        className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-black/15"
        style={{
          background: 'conic-gradient(red, orange, yellow, green, cyan, blue, magenta, red)',
        }}
        aria-label="Custom color"
      >
        <input
          type="color"
          value={rgbStringToHex(color)}
          onChange={(e) => onChange(hexToRgbString(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
};

ColorSwatches.displayName = 'ColorSwatches';
