import { cn } from '@pdfviewer/ui/lib/utils';
import type { IPoint, ITextAnnotation } from '../../annotations';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { Draggable } from './Draggable';
import { Resizable } from './Resizable';

export interface ITextBoxProps {
  id: string;
  content: string;
  position: IPoint;
  fontSize: number;
  fontColor: string;
  dimensions?: { width: number; height: number };
  /** Page container size used to constrain dragging within bounds */
  containerSize?: { width: number; height: number };
}

type Mode = 'editing' | 'selected' | 'idle';

/**
 * Measure the natural (content-based) size of a textarea so we have a
 * baseline for the Resizable wrapper before the user has ever resized.
 */
function measureTextArea(
  content: string,
  fontSize: number,
  maxWidth?: number,
): { width: number; height: number } {
  const el = document.createElement('textarea');
  el.style.position = 'absolute';
  el.style.visibility = 'hidden';
  el.style.whiteSpace = 'pre-wrap';
  el.style.wordBreak = 'break-all';
  el.style.fontSize = `${fontSize}px`;
  el.style.lineHeight = '1.4';
  el.style.padding = '0';
  el.style.border = 'none';
  el.style.boxSizing = 'border-box';
  el.style.setProperty('field-sizing', 'content');
  el.style.minWidth = '50px';
  if (maxWidth != null) {
    el.style.width = `${maxWidth}px`;
  }
  el.value = content || ' ';
  document.body.appendChild(el);
  const width = maxWidth ?? Math.max(el.scrollWidth, 50);
  const height = Math.max(el.scrollHeight, fontSize * 1.5);
  document.body.removeChild(el);
  return { width, height };
}

export const TextBox: React.FC<ITextBoxProps> = ({
  id,
  content,
  position,
  fontSize,
  fontColor,
  dimensions,
  containerSize,
}) => {
  const { updateAnnotation } = useAnnotation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('editing');
  const [isSelected, setIsSelected] = useState(true);
  const [localPosition, setLocalPosition] = useState<IPoint>(position);

  // Compute size: use persisted dimensions or measure from content
  const propSize = useMemo(() => {
    if (dimensions) return dimensions;
    return measureTextArea(content, fontSize);
  }, [dimensions, content, fontSize]);

  const [localSize, setLocalSize] = useState(propSize);

  // Track the base size/fontSize for manual-resize scaling.
  // These reset whenever the props change (e.g. zoom), so manual
  // resize scaling is always relative to the current zoom level.
  const [baseSize, setBaseSize] = useState(propSize);
  const [baseFontSize, setBaseFontSize] = useState(fontSize);
  // Track whether the user is actively resizing (to avoid clobbering)
  const isManualResizingRef = useRef(false);

  // Sync from props (zoom changes): reset base refs so scaledFontSize stays correct
  useEffect(() => {
    if (!isManualResizingRef.current) {
      setLocalSize(propSize);
      setBaseSize(propSize);
      setBaseFontSize(fontSize);
    }
  }, [propSize, fontSize]);

  const scaledFontSize = useMemo(() => {
    const scale = localSize.height / baseSize.height;
    return Math.max(6, baseFontSize * scale);
  }, [localSize.height, baseSize.height, baseFontSize]);

  // Sync position from props
  useEffect(() => {
    setLocalPosition(position);
  }, [position]);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // ---------- selection / mode ----------

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('resize-handle')) return;
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

  // Click outside → deselect
  useEffect(() => {
    if (!isSelected) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsSelected(false);
        setMode('idle');
        // Persist content + dimensions on deselect
        const val = textareaRef.current?.value ?? '';
        updateAnnotation(id, {
          content: val,
          fontSize: scaledFontSize,
          dimensions: localSize,
        } as Partial<ITextAnnotation>);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [isSelected, id, scaledFontSize, localSize, updateAnnotation]);

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
      updateAnnotation(id, {
        position: finalPos,
        fontSize: scaledFontSize,
        dimensions: localSize,
      } as Partial<ITextAnnotation>);
    },
    [id, scaledFontSize, localSize, updateAnnotation],
  );

  // ---------- resize callbacks ----------

  const handleResizeStart = useCallback(() => {
    isManualResizingRef.current = true;
  }, []);

  const handleSizeChange = useCallback((s: { width: number; height: number }) => {
    setLocalSize(s);
  }, []);

  const handleResizePositionChange = useCallback((p: { x: number; y: number }) => {
    setLocalPosition(p);
  }, []);

  const handleResizeEnd = useCallback(
    (finalSize: { width: number; height: number }) => {
      isManualResizingRef.current = false;
      const scale = finalSize.height / baseSize.height;
      const newFontSize = Math.max(6, baseFontSize * scale);
      updateAnnotation(id, {
        position: localPosition,
        fontSize: newFontSize,
        dimensions: finalSize,
      } as Partial<ITextAnnotation>);
    },
    [id, localPosition, baseSize.height, baseFontSize, updateAnnotation],
  );

  // ---------- auto-resize on input ----------

  const handleInput = useCallback(() => {
    if (!textareaRef.current || mode !== 'editing') return;
    const val = textareaRef.current.value;
    // Measure with current width as constraint so only height grows on wrap
    const natural = measureTextArea(val, scaledFontSize, localSize.width);
    setLocalSize(natural);
    setBaseSize(natural);
    setBaseFontSize(scaledFontSize);
  }, [mode, scaledFontSize, localSize.width]);

  // ---------- blur ----------

  const handleBlur = useCallback(() => {
    // Commit current content + dimensions (already updated by handleInput)
    const val = textareaRef.current?.value ?? '';
    updateAnnotation(id, {
      content: val,
      fontSize: scaledFontSize,
      dimensions: localSize,
    } as Partial<ITextAnnotation>);
  }, [id, scaledFontSize, localSize, updateAnnotation]);

  // ---------- render ----------

  const dragBounds = useMemo(() => {
    if (!containerSize) return undefined;
    return {
      maxX: Math.max(0, containerSize.width - localSize.width),
      maxY: Math.max(0, containerSize.height - localSize.height),
    };
  }, [containerSize, localSize]);

  const wrapperStyle = useMemo(() => ({ zIndex: isSelected ? 1000 : 10 }), [isSelected]);

  const textareaClassName = cn(
    'resize-none w-full h-full overflow-hidden caret-black bg-transparent outline-none border-none p-0 m-0',
    mode === 'editing' && 'cursor-text',
    mode === 'selected' && 'cursor-grab',
    mode === 'idle' && 'cursor-default pointer-events-none',
  );

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
      className="pointer-events-auto"
      style={wrapperStyle}
    >
      <Resizable
        width={localSize.width}
        height={localSize.height}
        position={localPosition}
        enabled={true}
        requireSelection={true}
        isSelected={isSelected}
        minWidth={30}
        minHeight={Math.max(20, scaledFontSize)}
        onSizeChange={handleSizeChange}
        onPositionChange={handleResizePositionChange}
        onResizeStart={handleResizeStart}
        onResizeEnd={handleResizeEnd}
        showHandles={isSelected}
      >
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', position: 'relative' }}
          onClick={handleClick}
        >
          <textarea
            ref={textareaRef}
            readOnly={mode !== 'editing'}
            className={textareaClassName}
            style={{
              fontSize: `${scaledFontSize}px`,
              color: fontColor,
              lineHeight: 1.4,
              wordBreak: 'break-all',
            }}
            defaultValue={content}
            onInput={handleInput}
            onBlur={handleBlur}
          />
          {(mode === 'editing' || mode === 'selected') && (
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
      </Resizable>
    </Draggable>
  );
};
