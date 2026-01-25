import React, {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { IPoint } from '../../annotations';

export interface IDraggableProps {
  /** Initial position */
  position: IPoint;
  /** Whether dragging is enabled (default: true) */
  enabled?: boolean;
  /** Whether selection is required before dragging (default: false) */
  requireSelection?: boolean;
  /** Whether the component is selected */
  isSelected?: boolean;
  /** Callback when position changes */
  onPositionChange?: (position: IPoint) => void;
  /** Callback when drag starts */
  onDragStart?: () => void;
  /** Callback when drag ends */
  onDragEnd?: (position: IPoint) => void;
  /** Child components */
  children: ReactNode;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Custom class name */
  className?: string;
  /** Whether to prevent text selection */
  preventTextSelection?: boolean;
}

/**
 * Draggable component: Provides drag functionality, wrapped child components can be dragged to change position
 */
export const Draggable: React.FC<IDraggableProps> = ({
  position,
  enabled = true,
  requireSelection = false,
  isSelected = false,
  onPositionChange,
  onDragStart,
  onDragEnd,
  children,
  style,
  className,
  preventTextSelection = true,
}) => {
  const [localPosition, setLocalPosition] = useState<IPoint>(position);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef<IPoint | null>(null);
  const startMouseRef = useRef<(IPoint & { containerLeft?: number; containerTop?: number }) | null>(
    null,
  );
  const hasMovedRef = useRef(false);

  // Sync position from props (only when not dragging)
  // Use useLayoutEffect to sync before browser paint to avoid flickering
  useLayoutEffect(() => {
    if (!isDragging && (localPosition.x !== position.x || localPosition.y !== position.y)) {
      setLocalPosition(position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, isDragging]);

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      // Don't handle drag if clicking on resize-handle
      if (target.classList.contains('resize-handle')) {
        return;
      }

      // Don't handle if selection is required but not selected
      if (requireSelection && !isSelected) {
        return;
      }

      if (containerRef.current?.contains(target)) {
        hasMovedRef.current = false;
        setIsDragging(true);
        const containerRect = containerRef.current.getBoundingClientRect();
        startPosRef.current = { ...localPosition };
        // Cache container initial position to avoid recalculating on every move
        startMouseRef.current = {
          x: e.clientX - containerRect.left - localPosition.x,
          y: e.clientY - containerRect.top - localPosition.y,
          containerLeft: containerRect.left,
          containerTop: containerRect.top,
        };

        if (preventTextSelection) {
          e.preventDefault();
          window.getSelection()?.removeAllRanges();
        }
        e.stopPropagation();

        onDragStart?.();
      }
    },
    [enabled, requireSelection, isSelected, localPosition, preventTextSelection, onDragStart],
  );

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return;

    let rafId: number | null = null;
    let pendingPosition: IPoint | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (!startMouseRef.current || !startPosRef.current) return;

      hasMovedRef.current = true;

      if (
        startMouseRef.current.containerLeft !== undefined &&
        startMouseRef.current.containerTop !== undefined
      ) {
        const newX = Math.max(
          0,
          e.clientX - startMouseRef.current.containerLeft - startMouseRef.current.x,
        );
        const newY = Math.max(
          0,
          e.clientY - startMouseRef.current.containerTop - startMouseRef.current.y,
        );
        pendingPosition = { x: newX, y: newY };
      }

      // Use requestAnimationFrame to throttle updates
      if (pendingPosition && rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (pendingPosition) {
            setLocalPosition(pendingPosition);
            onPositionChange?.(pendingPosition);
            pendingPosition = null;
          }
          rafId = null;
        });
      }
    };

    const handleMouseUp = () => {
      // Cancel pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      // Apply the last update
      if (pendingPosition) {
        setLocalPosition(pendingPosition);
        onPositionChange?.(pendingPosition);
      }

      const hadMoved = hasMovedRef.current;
      // Capture the final position before resetting pendingPosition
      const finalPosition = pendingPosition ?? localPosition;

      // Reset state
      pendingPosition = null;
      setIsDragging(false);
      startPosRef.current = null;
      startMouseRef.current = null;
      hasMovedRef.current = false;

      if (hadMoved) {
        onDragEnd?.(finalPosition);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, localPosition, onPositionChange, onDragEnd]);

  const containerStyle = useMemo(() => {
    return {
      position: 'absolute' as const,
      left: `${localPosition.x}px`,
      top: `${localPosition.y}px`,
      cursor: isDragging
        ? 'grabbing'
        : enabled && (!requireSelection || isSelected)
          ? 'grab'
          : 'default',
      userSelect: preventTextSelection ? ('none' as const) : undefined,
      WebkitUserSelect: preventTextSelection ? ('none' as const) : undefined,
      MozUserSelect: preventTextSelection ? ('none' as const) : undefined,
      ...style,
    };
  }, [
    localPosition,
    isDragging,
    enabled,
    requireSelection,
    isSelected,
    preventTextSelection,
    style,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>
  );
};
