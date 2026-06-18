import { cn } from '@pdfviewer/ui/lib/utils';
import type { IPoint, ITextAnnotation } from '../../annotations';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { usePdfState } from '../../providers/PdfStateContextProvider';
import { Draggable } from './Draggable';
import { TextStyleToolbar } from './TextStyleToolbar';

export interface ITextBoxProps {
  id: string;
  content: string;
  position: IPoint;
  fontSize: number;
  fontColor: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  dimensions?: { width: number; height: number };
  /** Page container size used to constrain dragging within bounds */
  containerSize?: { width: number; height: number };
}

type Mode = 'editing' | 'selected' | 'idle';

// Single reused hidden textarea for measurement. Creating/appending/removing a
// fresh element on every keystroke forces extra layout churn; reusing one node
// (set up once, left detached-but-cached in <body>) avoids the DOM mutation cost.
let measureEl: HTMLTextAreaElement | null = null;

function getMeasureEl(): HTMLTextAreaElement {
  if (!measureEl) {
    measureEl = document.createElement('textarea');
    const s = measureEl.style;
    s.position = 'absolute';
    s.visibility = 'hidden';
    s.left = '-9999px';
    s.top = '0';
    s.whiteSpace = 'pre-wrap';
    s.wordBreak = 'break-all';
    s.padding = '0';
    s.border = 'none';
    s.boxSizing = 'border-box';
    s.minWidth = '50px';
    measureEl.setAttribute('aria-hidden', 'true');
    measureEl.tabIndex = -1;
    document.body.appendChild(measureEl);
  }
  return measureEl;
}

/** Measure the natural size of the text for a given font, optionally width-constrained. */
function measureTextArea(
  content: string,
  fontSize: number,
  fontWeight: string,
  fontStyle: string,
  maxWidth?: number,
): { width: number; height: number } {
  const el = getMeasureEl();
  el.style.fontSize = `${fontSize}px`;
  el.style.fontWeight = fontWeight;
  el.style.fontStyle = fontStyle;
  el.style.lineHeight = '1.4';
  el.style.setProperty('field-sizing', 'content');
  el.style.width = maxWidth != null ? `${maxWidth}px` : '';
  el.value = content || ' ';
  const width = maxWidth ?? Math.max(el.scrollWidth + 2, 50);
  const height = Math.max(el.scrollHeight, fontSize * 1.5);
  return { width, height };
}

/**
 * Auto-size the box to its content. Grows freely until it reaches the page's
 * right edge, then wraps (height grows instead). Manual resize was removed in
 * favour of the numeric font-size control in the styling toolbar.
 */
function computeSize(
  content: string,
  fontSize: number,
  fontWeight: string,
  fontStyle: string,
  availableWidth?: number,
): { width: number; height: number } {
  const natural = measureTextArea(content, fontSize, fontWeight, fontStyle);
  if (availableWidth != null && natural.width > availableWidth) {
    const constrained = measureTextArea(content, fontSize, fontWeight, fontStyle, availableWidth);
    return { width: availableWidth, height: constrained.height };
  }
  return natural;
}

export const TextBox: React.FC<ITextBoxProps> = ({
  id,
  content,
  position,
  fontSize,
  fontColor,
  fontWeight,
  fontStyle,
  containerSize,
}) => {
  const { updateAnnotation, removeAnnotation, consumeNewAnnotation } = useAnnotation();
  const scale = usePdfState().scale;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only a freshly-created box should auto-enter edit mode and grab focus.
  // A pre-existing box remounting (virtualization/zoom) must stay idle so it
  // doesn't steal focus or scroll the viewport. Computed once on mount.
  const [isNew] = useState(() => consumeNewAnnotation(id));
  const [mode, setMode] = useState<Mode>(isNew ? 'editing' : 'idle');
  const [isSelected, setIsSelected] = useState(isNew);
  const [localPosition, setLocalPosition] = useState<IPoint>(position);
  // Controlled text so the box can live-resize while typing.
  const [value, setValue] = useState(content);

  const weight = fontWeight ?? 'normal';
  const style = fontStyle ?? 'normal';

  // Keep value in sync with the annotation when not actively editing
  // (e.g. undo/redo updates the stored content).
  useEffect(() => {
    if (mode !== 'editing') setValue(content);
  }, [content, mode]);

  // Sync position from props (zoom / undo / external move)
  useEffect(() => {
    setLocalPosition(position);
  }, [position]);

  // Available width before the box must wrap at the page's right edge. Uses the
  // committed position (prop), not the live drag position, so dragging doesn't
  // reflow the text mid-gesture.
  const availableWidth = useMemo(
    () => (containerSize ? Math.max(60, containerSize.width - position.x - 2) : undefined),
    [containerSize, position.x],
  );

  const size = useMemo(
    () => computeSize(value, fontSize, weight, style, availableWidth),
    [value, fontSize, weight, style, availableWidth],
  );

  // Auto-focus only newly-created boxes (not remounts of existing ones).
  useEffect(() => {
    if (isNew) textareaRef.current?.focus();
  }, [isNew]);

  // Persist current text + measured dimensions, plus any explicit changes.
  const persist = useCallback(
    (extra?: Partial<ITextAnnotation>) => {
      updateAnnotation(id, {
        content: value,
        dimensions: size,
        ...extra,
      } as Partial<ITextAnnotation>);
    },
    [id, value, size, updateAnnotation],
  );

  const deselect = useCallback(() => {
    setIsSelected(false);
    setMode('idle');
    if (value.trim() === '') {
      // Discard empty boxes silently (no undo entry) — they were never real.
      removeAnnotation(id, false);
    } else {
      persist();
    }
  }, [value, id, removeAnnotation, persist]);

  // ---------- selection / mode ----------

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('drag-handle')) return;
      if (!containerRef.current?.contains(target)) return;
      e.stopPropagation();

      if (mode === 'idle') {
        setMode('selected');
        setIsSelected(true);
      } else if (mode === 'selected') {
        setMode('editing');
        setIsSelected(true);
        textareaRef.current?.focus();
      }
    },
    [mode],
  );

  // Click outside → deselect (and discard if empty)
  useEffect(() => {
    if (!isSelected) return;
    const onOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        deselect();
      }
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [isSelected, deselect]);

  // Keyboard: Escape cancels/deselects, Delete/Backspace removes a selected box.
  useEffect(() => {
    if (!isSelected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        textareaRef.current?.blur();
        deselect();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && mode !== 'editing') {
        // Only when the box is selected (not being typed into).
        e.preventDefault();
        removeAnnotation(id, true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isSelected, mode, id, removeAnnotation, deselect]);

  // ---------- drag callbacks ----------

  const handleDragStart = useCallback(() => {
    if (mode === 'editing') {
      textareaRef.current?.blur();
      setMode('selected');
      setIsSelected(true);
    }
  }, [mode]);

  const handlePositionChange = useCallback((p: IPoint) => {
    setLocalPosition(p);
  }, []);

  const handleDragEnd = useCallback(
    (finalPos: IPoint) => {
      updateAnnotation(id, { position: finalPos } as Partial<ITextAnnotation>);
    },
    [id, updateAnnotation],
  );

  // ---------- style toolbar callbacks ----------

  const fontSizePt = Math.max(1, Math.round(fontSize / scale));
  const refocusIfEditing = useCallback(() => {
    if (mode === 'editing') textareaRef.current?.focus();
  }, [mode]);

  const handleFontSize = useCallback(
    (pt: number) => {
      persist({ fontSize: pt * scale });
      refocusIfEditing();
    },
    [persist, scale, refocusIfEditing],
  );
  const handleColor = useCallback(
    (rgb: string) => {
      persist({ fontColor: rgb });
      refocusIfEditing();
    },
    [persist, refocusIfEditing],
  );
  const handleToggleBold = useCallback(() => {
    persist({ fontWeight: weight === 'bold' ? 'normal' : 'bold' });
    refocusIfEditing();
  }, [persist, weight, refocusIfEditing]);
  const handleToggleItalic = useCallback(() => {
    persist({ fontStyle: style === 'italic' ? 'normal' : 'italic' });
    refocusIfEditing();
  }, [persist, style, refocusIfEditing]);
  const handleDelete = useCallback(() => {
    removeAnnotation(id, true);
  }, [id, removeAnnotation]);

  // ---------- blur ----------

  const handleBlur = useCallback(() => {
    // Persist content; do NOT remove empties here — only a true deselect
    // (outside-click / Escape) discards an empty box. This keeps the box alive
    // while the user interacts with the styling toolbar.
    persist();
  }, [persist]);

  // ---------- render ----------

  const dragBounds = useMemo(() => {
    if (!containerSize) return undefined;
    return {
      maxX: Math.max(0, containerSize.width - size.width),
      maxY: Math.max(0, containerSize.height - size.height),
    };
  }, [containerSize, size]);

  const wrapperStyle = useMemo(() => ({ zIndex: isSelected ? 1000 : 10 }), [isSelected]);

  const textareaClassName = cn(
    'resize-none w-full h-full overflow-hidden bg-transparent outline-none border-none p-0 m-0',
    mode === 'editing' && 'cursor-text',
    mode === 'selected' && 'cursor-grab',
    mode === 'idle' && 'cursor-default pointer-events-none',
  );

  const showChrome = mode === 'editing' || mode === 'selected';
  const toolbarPlacement = localPosition.y > 56 ? 'above' : 'below';

  return (
    <Draggable
      position={localPosition}
      enabled={true}
      requireSelection={true}
      isSelected={isSelected && mode === 'selected'}
      bounds={dragBounds}
      onPositionChange={handlePositionChange}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="text-annotation-box pointer-events-auto"
      style={wrapperStyle}
    >
      <div
        ref={containerRef}
        style={{ width: size.width, height: size.height, position: 'relative' }}
        onClick={handleClick}
      >
        {showChrome && (
          <TextStyleToolbar
            fontSizePt={fontSizePt}
            fontColor={fontColor}
            bold={weight === 'bold'}
            italic={style === 'italic'}
            onFontSizeChange={handleFontSize}
            onColorChange={handleColor}
            onToggleBold={handleToggleBold}
            onToggleItalic={handleToggleItalic}
            onDelete={handleDelete}
            placement={toolbarPlacement}
          />
        )}
        <textarea
          ref={textareaRef}
          readOnly={mode !== 'editing'}
          className={textareaClassName}
          style={{
            fontSize: `${fontSize}px`,
            color: fontColor,
            caretColor: fontColor,
            fontWeight: weight,
            fontStyle: style,
            lineHeight: 1.4,
            wordBreak: 'break-all',
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
        />
        {showChrome && (
          <>
            {/* Visual border */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                border: '2px dashed #a200ff',
                pointerEvents: 'none',
              }}
            />
            {/* Interactive edge hit zones for border dragging */}
            <div
              className="drag-handle"
              style={{
                position: 'absolute',
                top: -3,
                left: -3,
                right: -3,
                height: 8,
                cursor: 'grab',
                pointerEvents: 'auto',
              }}
            />
            <div
              className="drag-handle"
              style={{
                position: 'absolute',
                bottom: -3,
                left: -3,
                right: -3,
                height: 8,
                cursor: 'grab',
                pointerEvents: 'auto',
              }}
            />
            <div
              className="drag-handle"
              style={{
                position: 'absolute',
                top: -3,
                left: -3,
                bottom: -3,
                width: 8,
                cursor: 'grab',
                pointerEvents: 'auto',
              }}
            />
            <div
              className="drag-handle"
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                bottom: -3,
                width: 8,
                cursor: 'grab',
                pointerEvents: 'auto',
              }}
            />
          </>
        )}
      </div>
    </Draggable>
  );
};
