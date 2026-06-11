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
  /** Optional upper-bound limits for dragging (e.g. page width/height minus element size) */
  bounds?: { maxX?: number; maxY?: number };
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
  bounds,
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
  // Pointer position at drag start plus the layout<->client scale factor, so
  // movement deltas are converted from client px to layout px. The factor is 1
  // unless an ancestor applies a CSS transform: scale().
  const startMouseRef = useRef<{
    clientX: number;
    clientY: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const hasMovedRef = useRef(false);

  // Latest-callback / latest-value refs so the drag effect can depend ONLY on
  // `isDragging`. Without this, every mouse-move setLocalPosition rebinds the
  // mousemove/mouseup listeners mid-gesture (effect deps were localPosition +
  // unstable callback identities), which can drop pointer events.
  const localPositionRef = useRef(localPosition);
  useEffect(() => {
    localPositionRef.current = localPosition;
  }, [localPosition]);
  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);
  const onPositionChangeRef = useRef(onPositionChange);
  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);

  // Sync position from props (only when not dragging)
  // Use useLayoutEffect to sync before browser paint to avoid flickering
  useLayoutEffect(() => {
    if (!isDragging && (localPosition.x !== position.x || localPosition.y !== position.y)) {
      setLocalPosition(position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, isDragging]);

  // Handle pointer down (mouse, touch, and pen)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      // Don't handle drag if clicking on resize-handle
      if (target.classList.contains('resize-handle')) {
        return;
      }

      // Allow drag from elements marked as drag handles regardless of selection
      const isDragHandle =
        target.classList.contains('drag-handle') || target.closest?.('.drag-handle') != null;

      // Don't handle if selection is required but not selected (unless it's a drag handle)
      if (requireSelection && !isSelected && !isDragHandle) {
        return;
      }

      const container = containerRef.current;
      if (container?.contains(target)) {
        hasMovedRef.current = false;
        setIsDragging(true);
        const containerRect = container.getBoundingClientRect();
        startPosRef.current = { ...localPosition };
        // Derive the client->layout scale from the element's rendered rect vs its
        // layout size. Equals 1 with no CSS transform; >1 / <1 under transform: scale().
        const scaleX = container.offsetWidth > 0 ? containerRect.width / container.offsetWidth : 1;
        const scaleY =
          container.offsetHeight > 0 ? containerRect.height / container.offsetHeight : 1;
        startMouseRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          scaleX: scaleX || 1,
          scaleY: scaleY || 1,
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

    const handlePointerMove = (e: PointerEvent) => {
      const start = startMouseRef.current;
      const startPos = startPosRef.current;
      if (!start || !startPos) return;

      hasMovedRef.current = true;

      // Convert client-space movement to layout space via the scale factor.
      let newX = Math.max(0, startPos.x + (e.clientX - start.clientX) / start.scaleX);
      let newY = Math.max(0, startPos.y + (e.clientY - start.clientY) / start.scaleY);
      const b = boundsRef.current;
      if (b?.maxX != null) newX = Math.min(newX, b.maxX);
      if (b?.maxY != null) newY = Math.min(newY, b.maxY);
      pendingPosition = { x: newX, y: newY };

      // Use requestAnimationFrame to throttle updates
      if (pendingPosition && rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (pendingPosition) {
            setLocalPosition(pendingPosition);
            onPositionChangeRef.current?.(pendingPosition);
            pendingPosition = null;
          }
          rafId = null;
        });
      }
    };

    const handlePointerUp = () => {
      // Cancel pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      // Apply the last update
      if (pendingPosition) {
        setLocalPosition(pendingPosition);
        onPositionChangeRef.current?.(pendingPosition);
      }

      const hadMoved = hasMovedRef.current;
      // Capture the final position before resetting pendingPosition
      const finalPosition = pendingPosition ?? localPositionRef.current;

      // Reset state
      pendingPosition = null;
      setIsDragging(false);
      startPosRef.current = null;
      startMouseRef.current = null;
      hasMovedRef.current = false;

      if (hadMoved) {
        onDragEndRef.current?.(finalPosition);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging]);

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
      // Prevent touch-scrolling from stealing the drag gesture on touch/pen.
      touchAction: 'none' as const,
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
      onPointerDown={handlePointerDown}
    >
      {children}
    </div>
  );
};
