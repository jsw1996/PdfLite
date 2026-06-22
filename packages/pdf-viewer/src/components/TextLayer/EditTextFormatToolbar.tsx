import React, { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Minus, Plus } from 'lucide-react';
import { cn } from '@pdfviewer/ui/lib/utils';
import type { EditFontFamily } from '../../providers/AnnotationContextProvider';
import { TEXT_ANNOTATION_DEFAULTS, TEXT_COLOR_PRESETS } from '../../annotations';
import { colorKey, hexToRgbString, rgbStringToHex } from '../../utils/color';

export type TextAlign = 'left' | 'center' | 'right';

export interface IEditTextFormatToolbarProps {
  /** Current effective font size in display points (rounded). */
  fontSizePt: number;
  /** Current font family selection. */
  fontFamily: EditFontFamily;
  /** Current color as a CSS color string. */
  color: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  onFontSizeChange: (pt: number) => void;
  onFontFamilyChange: (family: EditFontFamily) => void;
  onColorChange: (rgb: string) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onAlignChange: (align: TextAlign) => void;
}

const FONT_FAMILY_OPTIONS: { value: EditFontFamily; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
];

const iconBtn =
  'flex h-7 w-7 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-foreground/10';

const divider = <div className="mx-0.5 h-5 w-px bg-border/60" />;

/**
 * Floating formatting toolbar shown above the focused paragraph editor in Edit
 * Text mode. Mirrors the look of the add-text style toolbar but operates on an
 * existing paragraph as a block: changing a control applies to every line.
 */
export const EditTextFormatToolbar: React.FC<IEditTextFormatToolbarProps> = ({
  fontSizePt,
  fontFamily,
  color,
  bold,
  italic,
  align,
  onFontSizeChange,
  onFontFamilyChange,
  onColorChange,
  onToggleBold,
  onToggleItalic,
  onAlignChange,
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

  const activeColorKey = colorKey(color);

  // Controls must not steal focus/caret from the editor, so every button
  // suppresses the default mousedown focus shift. Inputs/selects are exempt.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const alignOptions: { value: TextAlign; icon: React.ReactNode; label: string }[] = [
    { value: 'left', icon: <AlignLeft size={15} />, label: 'Align left' },
    { value: 'center', icon: <AlignCenter size={15} />, label: 'Align center' },
    { value: 'right', icon: <AlignRight size={15} />, label: 'Align right' },
  ];

  return (
    <div
      // Stop the editor's pointer handling from firing, but let the controls
      // themselves receive clicks (no preventDefault on click).
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex items-center gap-1 rounded-lg border border-border/60',
        'bg-popover/95 p-1 shadow-md backdrop-blur-sm',
      )}
      style={{ cursor: 'default' }}
    >
      {/* Font family */}
      <select
        value={fontFamily}
        onChange={(e) => onFontFamilyChange(e.target.value as EditFontFamily)}
        className="h-7 rounded-md bg-transparent px-1 text-sm outline-none hover:bg-foreground/5 focus:bg-foreground/5"
        aria-label="Font family"
      >
        {FONT_FAMILY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {divider}

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

      {divider}

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

      {divider}

      {/* Alignment */}
      {alignOptions.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={cn(iconBtn, align === opt.value && 'bg-foreground/10 text-foreground')}
          onMouseDown={keepFocus}
          onClick={() => onAlignChange(opt.value)}
          aria-pressed={align === opt.value}
          aria-label={opt.label}
        >
          {opt.icon}
        </button>
      ))}

      {divider}

      {/* Color presets */}
      <div className="flex items-center gap-1">
        {TEXT_COLOR_PRESETS.map((preset) => {
          const isActive = colorKey(preset) === activeColorKey;
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
            value={rgbStringToHex(color)}
            onChange={(e) => onColorChange(hexToRgbString(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
};

EditTextFormatToolbar.displayName = 'EditTextFormatToolbar';
