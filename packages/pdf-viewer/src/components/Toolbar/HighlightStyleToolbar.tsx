import React from 'react';
import { HIGHLIGHT_COLOR_PRESETS } from '../../annotations';
import { ColorSwatches } from './ColorSwatches';

export interface IHighlightStyleToolbarProps {
  /** Current highlight color as a CSS color string */
  color: string;
  onColorChange: (rgb: string) => void;
}

const sectionLabel = 'text-[10px] font-medium uppercase tracking-wide text-foreground/50';

/**
 * Vertical styling palette for the highlight tool. Picks the color applied to
 * text selections while the highlight tool is active.
 */
export const HighlightStyleToolbar: React.FC<IHighlightStyleToolbarProps> = ({
  color,
  onColorChange,
}) => {
  return (
    <div className="flex w-max flex-col items-center gap-1.5">
      <span className={sectionLabel}>Color</span>
      <ColorSwatches color={color} presets={HIGHLIGHT_COLOR_PRESETS} onChange={onColorChange} />
    </div>
  );
};

HighlightStyleToolbar.displayName = 'HighlightStyleToolbar';
