import React, { useRef, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export interface IResizableProps {
  /** Initial width */
  width: number;
  /** Initial height */
  height: number;
  /** Initial position (used to calculate position changes when resizing) */
  position?: { x: number; y: number };
  /** Whether resizing is enabled (default: true) */
  enabled?: boolean;
  /** Whether selection is required before resizing (default: false) */
  requireSelection?: boolean;
  /** Whether the component is selected */
  isSelected?: boolean;
  /** Minimum width (default: 20) */
  minWidth?: number;
  /** Minimum height (default: 20) */
  minHeight?: number;
  /** Callback when size changes */
  onSizeChange?: (size: { width: number; height: number }) => void;
  /** Callback when position changes (position changes when resizing from certain directions) */
  onPositionChange?: (position: { x: number; y: number }) => void;
  /** Callback when resize starts */
  onResizeStart?: () => void;
  /** Callback when resize ends */
  onResizeEnd?: (size: { width: number; height: number }) => void;
  /** Child components */
  children: ReactNode;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Custom class name */
  className?: string;
  /** Style for resize handles */
  handleStyle?: React.CSSProperties;
  /** Whether to show resize handles (default: true) */
  showHandles?: boolean;
}

/**
 * Resizable component: Provides resize functionality, wrapped child components can be resized by dragging edges and corners
 */
export const Resizable: React.FC<IResizableProps> = ({
  width,
  height,
  position = { x: 0, y: 0 },
  enabled = true,
  requireSelection = false,
  isSelected = false,
  minWidth = 20,
  minHeight = 20,
  onSizeChange,
  onPositionChange,
  onResizeStart,
  onResizeEnd,
  children,
  style,
  className,
  handleStyle,
  showHandles = true,
}) => {
  const [localSize, setLocalSize] = useState({ width, height });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const startSizeRef = useRef<{ width: number; height: number } | null>(null);
  // Pointer start plus client->layout scale (1 unless an ancestor uses CSS transform: scale()).
  const startMouseRef = useRef<{ x: number; y: number; scaleX: number; scaleY: number } | null>(
    null,
  );

  // Latest-callback / latest-value refs so the resize effect can depend only
  // on `isResizing` + `resizeHandle`. Otherwise every setLocalSize mid-gesture
  // (or any parent re-render that changes a callback identity) rebinds the
  // window mousemove/mouseup listeners — which drops in-flight pointer events.
  const localSizeRef = useRef(localSize);
  useEffect(() => {
    localSizeRef.current = localSize;
  }, [localSize]);
  const minWidthRef = useRef(minWidth);
  useEffect(() => {
    minWidthRef.current = minWidth;
  }, [minWidth]);
  const minHeightRef = useRef(minHeight);
  useEffect(() => {
    minHeightRef.current = minHeight;
  }, [minHeight]);
  const onSizeChangeRef = useRef(onSizeChange);
  useEffect(() => {
    onSizeChangeRef.current = onSizeChange;
  }, [onSizeChange]);
  const onPositionChangeRef = useRef(onPositionChange);
  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);
  const onResizeEndRef = useRef(onResizeEnd);
  useEffect(() => {
    onResizeEndRef.current = onResizeEnd;
  }, [onResizeEnd]);

  // Sync size from props (only when not resizing)
  useEffect(() => {
    if (!isResizing && (localSize.width !== width || localSize.height !== height)) {
      setLocalSize({ width, height });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, isResizing]);

  // Handle pointer down on resize handle (mouse, touch, and pen)
  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      if (!target.classList.contains('resize-handle')) return;

      // Don't handle if selection is required but not selected
      if (requireSelection && !isSelected) {
        return;
      }

      const handle = target.dataset.handle as ResizeHandle;
      if (!handle) return;

      setResizeHandle(handle);
      setIsResizing(true);
      // Record initial position and size
      startPosRef.current = { ...position };
      startSizeRef.current = { ...localSize };
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      const scaleX =
        container && rect && container.offsetWidth > 0 ? rect.width / container.offsetWidth : 1;
      const scaleY =
        container && rect && container.offsetHeight > 0 ? rect.height / container.offsetHeight : 1;
      startMouseRef.current = {
        x: e.clientX,
        y: e.clientY,
        scaleX: scaleX || 1,
        scaleY: scaleY || 1,
      };

      e.preventDefault();
      e.stopPropagation();

      onResizeStart?.();
    },
    [enabled, requireSelection, isSelected, localSize, position, onResizeStart],
  );

  // Handle resizing
  useEffect(() => {
    if (!isResizing || !resizeHandle) return;

    let rafId: number | null = null;
    let pendingSize: { width: number; height: number } | null = null;
    let pendingPosition: { x: number; y: number } | null = null;

    const handlePointerMove = (e: PointerEvent) => {
      if (!startMouseRef.current || !startSizeRef.current || !startPosRef.current) return;

      // Convert client-space movement to layout space via the scale factor.
      const deltaX = (e.clientX - startMouseRef.current.x) / startMouseRef.current.scaleX;
      const deltaY = (e.clientY - startMouseRef.current.y) / startMouseRef.current.scaleY;
      let newWidth = startSizeRef.current.width;
      let newHeight = startSizeRef.current.height;
      let newX = startPosRef.current.x;
      let newY = startPosRef.current.y;
      const minW = minWidthRef.current;
      const minH = minHeightRef.current;

      // Calculate new size and position based on resize handle
      switch (resizeHandle) {
        case 'se':
          newWidth = Math.max(minW, startSizeRef.current.width + deltaX);
          newHeight = Math.max(minH, startSizeRef.current.height + deltaY);
          break;
        case 'sw':
          newWidth = Math.max(minW, startSizeRef.current.width - deltaX);
          newHeight = Math.max(minH, startSizeRef.current.height + deltaY);
          newX = startPosRef.current.x + (startSizeRef.current.width - newWidth);
          break;
        case 'ne':
          newWidth = Math.max(minW, startSizeRef.current.width + deltaX);
          newHeight = Math.max(minH, startSizeRef.current.height - deltaY);
          newY = startPosRef.current.y + (startSizeRef.current.height - newHeight);
          break;
        case 'nw':
          newWidth = Math.max(minW, startSizeRef.current.width - deltaX);
          newHeight = Math.max(minH, startSizeRef.current.height - deltaY);
          newX = startPosRef.current.x + (startSizeRef.current.width - newWidth);
          newY = startPosRef.current.y + (startSizeRef.current.height - newHeight);
          break;
        case 'e':
          newWidth = Math.max(minW, startSizeRef.current.width + deltaX);
          break;
        case 'w':
          newWidth = Math.max(minW, startSizeRef.current.width - deltaX);
          newX = startPosRef.current.x + (startSizeRef.current.width - newWidth);
          break;
        case 's':
          newHeight = Math.max(minH, startSizeRef.current.height + deltaY);
          break;
        case 'n':
          newHeight = Math.max(minH, startSizeRef.current.height - deltaY);
          newY = startPosRef.current.y + (startSizeRef.current.height - newHeight);
          break;
      }

      pendingSize = { width: newWidth, height: newHeight };
      if (newX !== startPosRef.current.x || newY !== startPosRef.current.y) {
        pendingPosition = { x: newX, y: newY };
      }

      // Use requestAnimationFrame to throttle updates
      if (pendingSize && rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (pendingSize) {
            setLocalSize(pendingSize);
            onSizeChangeRef.current?.(pendingSize);
            pendingSize = null;
          }
          if (pendingPosition) {
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
      if (pendingSize) {
        setLocalSize(pendingSize);
        onSizeChangeRef.current?.(pendingSize);
      }
      if (pendingPosition) {
        onPositionChangeRef.current?.(pendingPosition);
      }

      // Capture the final size before resetting pendingSize
      const finalSize = pendingSize ?? localSizeRef.current;

      // Reset state
      pendingSize = null;
      pendingPosition = null;
      setIsResizing(false);
      setResizeHandle(null);
      startPosRef.current = null;
      startSizeRef.current = null;
      startMouseRef.current = null;

      onResizeEndRef.current?.(finalSize);
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
  }, [isResizing, resizeHandle]);

  const defaultHandleStyle = useMemo(() => {
    return {
      position: 'absolute' as const,
      width: '8px',
      height: '8px',
      backgroundColor: '#3b82f6',
      border: '1px solid white',
      borderRadius: '50%',
      zIndex: 1001,
      // Prevent touch-scroll from stealing the resize gesture on touch/pen.
      touchAction: 'none' as const,
      ...handleStyle,
    };
  }, [handleStyle]);

  const resizeHandles = useMemo(() => {
    if (!showHandles || !enabled || (requireSelection && !isSelected)) {
      return [];
    }

    const handles: {
      handle: ResizeHandle;
      style: React.CSSProperties;
    }[] = [
      {
        handle: 'nw',
        style: {
          ...defaultHandleStyle,
          top: '-4px',
          left: '-4px',
          cursor: 'nwse-resize',
        },
      },
      {
        handle: 'ne',
        style: {
          ...defaultHandleStyle,
          top: '-4px',
          right: '-4px',
          cursor: 'nesw-resize',
        },
      },
      {
        handle: 'sw',
        style: {
          ...defaultHandleStyle,
          bottom: '-4px',
          left: '-4px',
          cursor: 'nesw-resize',
        },
      },
      {
        handle: 'se',
        style: {
          ...defaultHandleStyle,
          bottom: '-4px',
          right: '-4px',
          cursor: 'nwse-resize',
        },
      },
      {
        handle: 'n',
        style: {
          ...defaultHandleStyle,
          top: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          cursor: 'ns-resize',
        },
      },
      {
        handle: 's',
        style: {
          ...defaultHandleStyle,
          bottom: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          cursor: 'ns-resize',
        },
      },
      {
        handle: 'e',
        style: {
          ...defaultHandleStyle,
          right: '-4px',
          top: '50%',
          transform: 'translateY(-50%)',
          cursor: 'ew-resize',
        },
      },
      {
        handle: 'w',
        style: {
          ...defaultHandleStyle,
          left: '-4px',
          top: '50%',
          transform: 'translateY(-50%)',
          cursor: 'ew-resize',
        },
      },
    ];
    return handles;
  }, [showHandles, enabled, requireSelection, isSelected, defaultHandleStyle]);

  const containerStyle = useMemo(() => {
    return {
      width: `${localSize.width}px`,
      height: `${localSize.height}px`,
      position: 'relative' as const,
      ...style,
    };
  }, [localSize.width, localSize.height, style]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      onPointerDown={handleResizePointerDown}
    >
      {children}
      {resizeHandles.map(({ handle, style: handleStyleProp }) => (
        <div key={handle} className="resize-handle" data-handle={handle} style={handleStyleProp} />
      ))}
    </div>
  );
};
