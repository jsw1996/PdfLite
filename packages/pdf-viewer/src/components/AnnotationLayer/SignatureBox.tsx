import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { IPoint, ISignatureAnnotation } from '../../annotations';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { Draggable } from './Draggable';
import { Resizable } from './Resizable';

export interface ISignatureBoxProps {
  id: string;
  position: IPoint;
  imageDataUrl: string;
  width: number;
  height: number;
}

export const SignatureBox: React.FC<ISignatureBoxProps> = ({
  id,
  position,
  imageDataUrl,
  width,
  height,
}) => {
  const { updateAnnotation } = useAnnotation();
  const [isSelected, setIsSelected] = useState(false);
  const [localPosition, setLocalPosition] = useState<IPoint>(position);
  const [localSize, setLocalSize] = useState({ width, height });
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync position and size from props
  useEffect(() => {
    setLocalPosition(position);
  }, [position]);

  useEffect(() => {
    setLocalSize({ width, height });
  }, [width, height]);

  // Handle resize callbacks
  const handleSizeChange = useCallback((newSize: { width: number; height: number }) => {
    setLocalSize(newSize);
  }, []);

  const handleResizePositionChange = useCallback((newPosition: { x: number; y: number }) => {
    setLocalPosition(newPosition);
  }, []);

  const handleResizeEnd = useCallback(
    (finalSize: { width: number; height: number }) => {
      updateAnnotation(id, {
        position: localPosition,
        width: finalSize.width,
        height: finalSize.height,
      } as Partial<ISignatureAnnotation>);
    },
    [id, localPosition, updateAnnotation],
  );

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't select if clicking on resize handle
    if (target.classList.contains('resize-handle')) {
      return;
    }

    // Select if clicking on container or its children (including img)
    if (containerRef.current?.contains(target)) {
      e.stopPropagation();
      setIsSelected(true);
    }
  }, []);

  // Click outside to deselect
  useEffect(() => {
    if (!isSelected) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsSelected(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSelected]);

  const handlePositionChange = useCallback((newPosition: IPoint) => {
    setLocalPosition(newPosition);
  }, []);

  const handleDragEnd = useCallback(
    (finalPosition: IPoint) => {
      updateAnnotation(id, {
        position: finalPosition,
        width: localSize.width,
        height: localSize.height,
      } as Partial<ISignatureAnnotation>);
    },
    [id, localSize, updateAnnotation],
  );

  const contentStyle = useMemo(() => {
    return {
      zIndex: isSelected ? 1000 : 10,
    };
  }, [isSelected]);

  const imageStyle = useMemo(() => {
    return {
      width: '100%',
      height: '100%',
      objectFit: 'contain' as React.CSSProperties['objectFit'],
      pointerEvents: 'none' as const,
      userSelect: 'none' as const,
    };
  }, []);

  return (
    <Draggable
      position={localPosition}
      enabled={true}
      requireSelection={true}
      isSelected={isSelected}
      onPositionChange={handlePositionChange}
      onDragEnd={handleDragEnd}
      className="pointer-events-auto"
      style={contentStyle}
    >
      <Resizable
        width={localSize.width}
        height={localSize.height}
        position={localPosition}
        enabled={true}
        requireSelection={true}
        isSelected={isSelected}
        minWidth={20}
        minHeight={20}
        onSizeChange={handleSizeChange}
        onPositionChange={handleResizePositionChange}
        onResizeEnd={handleResizeEnd}
        showHandles={isSelected}
      >
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
          onClick={handleClick}
        >
          <img src={imageDataUrl} alt="Signature" style={imageStyle} draggable={false} />
          {isSelected && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                border: '2px dashed #3b82f6',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </Resizable>
    </Draggable>
  );
};
