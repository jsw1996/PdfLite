import React, { useEffect, useState } from 'react';
import { Bold, Italic, Minus, Plus, Trash2 } from 'lucide-react';
import { cn } from '@pdfviewer/ui/lib/utils';
import { TEXT_ANNOTATION_DEFAULTS, TEXT_COLOR_PRESETS } from '../../annotations';
import { colorKey, hexToRgbString, rgbStringToHex } from '../../utils/color';

export interface ITextStyleToolbarProps {
  /** Current font size in logical points (scale-independent) */
  fontSizePt: number;
  /** Current color as a CSS color string */
  fontColor: string;
  bold: boolean;
  italic: boolean;
  onFontSizeChange: (pt: number) => void;
  onColorChange: (rgb: string) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onDelete: () => void;
  /** Render above or below the text box, depending on available room */
  placement: 'above' | 'below';
}

const iconBtn =
  'flex h-7 w-7 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-foreground/10';

export const TextStyleToolbar: React.FC<ITextStyleToolbarProps> = ({
  fontSizePt,
  fontColor,
  bold,
  italic,
  onFontSizeChange,
  onColorChange,
  onToggleBold,
  onToggleItalic,
  onDelete,
  placement,
}) => {
  // Local input text so typing intermediate values (e.g. an empty field) does
  // not immediately clamp/commit on every keystroke.
  const [sizeText, setSizeText] = useState(String(Math.round(fontSizePt)));
  useEffect(() => {
    setSizeText(String(Math.round(fontSizePt)));
  }, [fontSizePt]);

  const clamp = (v: number) =>
    Math.min(
      TEXT_ANNOTATION_DEFAULTS.MAX_FONT_SIZE,
      Math.max(TEXT_ANNOTATION_DEFAULTS.MIN_FONT_SIZE, v),
    );

  const commitSize = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setSizeText(String(Math.round(fontSizePt)));
      return;
    }
    const next = clamp(parsed);
    setSizeText(String(next));
    if (next !== Math.round(fontSizePt)) onFontSizeChange(next);
  };

  const step = (delta: number) => {
    const next = clamp(Math.round(fontSizePt) + delta);
    setSizeText(String(next));
    onFontSizeChange(next);
  };

  const activeKey = colorKey(fontColor);

  // Buttons should not steal focus from the textarea (so the user can keep
  // typing after toggling a style). Inputs are exempt — they need focus.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      // Stop drag/selection logic in the parent box from firing, but allow the
      // controls themselves to receive focus/click (no preventDefault).
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'absolute left-0 z-1001 flex items-center gap-1 rounded-lg border border-border/60',
        'bg-popover/95 p-1 shadow-md backdrop-blur-sm',
        placement === 'above' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
      )}
      style={{ cursor: 'default' }}
    >
      {/* Font size stepper */}
      <div className="flex items-center">
        <button
          type="button"
          className={iconBtn}
          onMouseDown={keepFocus}
          onClick={() => step(-1)}
          aria-label="Decrease font size"
        >
          <Minus size={14} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={sizeText}
          onChange={(e) => setSizeText(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={(e) => commitSize(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="h-7 w-9 rounded-md bg-transparent text-center text-sm tabular-nums outline-none focus:bg-foreground/5"
          aria-label="Font size"
        />
        <button
          type="button"
          className={iconBtn}
          onMouseDown={keepFocus}
          onClick={() => step(1)}
          aria-label="Increase font size"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="mx-0.5 h-5 w-px bg-border/60" />

      {/* Bold / Italic */}
      <button
        type="button"
        className={cn(iconBtn, bold && 'bg-foreground/10 text-foreground')}
        onMouseDown={keepFocus}
        onClick={onToggleBold}
        aria-pressed={bold}
        aria-label="Bold"
      >
        <Bold size={15} />
      </button>
      <button
        type="button"
        className={cn(iconBtn, italic && 'bg-foreground/10 text-foreground')}
        onMouseDown={keepFocus}
        onClick={onToggleItalic}
        aria-pressed={italic}
        aria-label="Italic"
      >
        <Italic size={15} />
      </button>

      <div className="mx-0.5 h-5 w-px bg-border/60" />

      {/* Color presets */}
      <div className="flex items-center gap-1">
        {TEXT_COLOR_PRESETS.map((preset) => {
          const isActive = colorKey(preset) === activeKey;
          return (
            <button
              key={preset}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => onColorChange(preset)}
              aria-label={`Color ${preset}`}
              className={cn(
                'h-5 w-5 rounded-full border border-black/15 transition-transform hover:scale-110',
                isActive && 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover',
              )}
              style={{ backgroundColor: preset }}
            />
          );
        })}
        {/* Custom color */}
        <label
          className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-black/15"
          style={{
            background: 'conic-gradient(red, orange, yellow, green, cyan, blue, magenta, red)',
          }}
          aria-label="Custom color"
        >
          <input
            type="color"
            value={rgbStringToHex(fontColor)}
            onChange={(e) => onColorChange(hexToRgbString(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div className="mx-0.5 h-5 w-px bg-border/60" />

      <button
        type="button"
        className={cn(iconBtn, 'hover:bg-destructive/15 hover:text-destructive')}
        onMouseDown={keepFocus}
        onClick={onDelete}
        aria-label="Delete text"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};
