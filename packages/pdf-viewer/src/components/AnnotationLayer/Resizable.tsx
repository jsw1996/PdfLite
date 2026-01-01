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
  const startMouseRef = useRef<{ x: number; y: number } | null>(null);

  // Sync size from props (only when not resizing)
  useEffect(() => {
    if (!isResizing && (localSize.width !== width || localSize.height !== height)) {
      setLocalSize({ width, height });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, isResizing]);

  // Handle mouse down on resize handle
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
      startMouseRef.current = { x: e.clientX, y: e.clientY };

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

    const handleMouseMove = (e: MouseEvent) => {
      if (!startMouseRef.current || !startSizeRef.current || !startPosRef.current) return;

      const deltaX = e.clientX - startMouseRef.current.x;
      const deltaY = e.clientY - startMouseRef.current.y;
      let newWidth = startSizeRef.current.width;
      let newHeight = startSizeRef.current.height;
      let newX = startPosRef.current.x;
      let newY = startPosRef.current.y;

      // Calculate new size and position based on resize handle
      switch (resizeHandle) {
        case 'se':
          newWidth = Math.max(minWidth, startSizeRef.current.width + deltaX);
          newHeight = Math.max(minHeight, startSizeRef.current.height + deltaY);
          break;
        case 'sw':
          newWidth = Math.max(minWidth, startSizeRef.current.width - deltaX);
          newHeight = Math.max(minHeight, startSizeRef.current.height + deltaY);
          newX = startPosRef.current.x + (startSizeRef.current.width - newWidth);
          break;
        case 'ne':
          newWidth = Math.max(minWidth, startSizeRef.current.width + deltaX);
          newHeight = Math.max(minHeight, startSizeRef.current.height - deltaY);
          newY = startPosRef.current.y + (startSizeRef.current.height - newHeight);
          break;
        case 'nw':
          newWidth = Math.max(minWidth, startSizeRef.current.width - deltaX);
          newHeight = Math.max(minHeight, startSizeRef.current.height - deltaY);
          newX = startPosRef.current.x + (startSizeRef.current.width - newWidth);
          newY = startPosRef.current.y + (startSizeRef.current.height - newHeight);
          break;
        case 'e':
          newWidth = Math.max(minWidth, startSizeRef.current.width + deltaX);
          break;
        case 'w':
          newWidth = Math.max(minWidth, startSizeRef.current.width - deltaX);
          newX = startPosRef.current.x + (startSizeRef.current.width - newWidth);
          break;
        case 's':
          newHeight = Math.max(minHeight, startSizeRef.current.height + deltaY);
          break;
        case 'n':
          newHeight = Math.max(minHeight, startSizeRef.current.height - deltaY);
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
            onSizeChange?.(pendingSize);
            pendingSize = null;
          }
          if (pendingPosition) {
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
      if (pendingSize) {
        setLocalSize(pendingSize);
        onSizeChange?.(pendingSize);
        pendingSize = null;
      }
      if (pendingPosition) {
        onPositionChange?.(pendingPosition);
        pendingPosition = null;
      }

      const finalSize = pendingSize ?? localSize;

      setIsResizing(false);
      setResizeHandle(null);
      startPosRef.current = null;
      startSizeRef.current = null;
      startMouseRef.current = null;

      onResizeEnd?.(finalSize);
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
  }, [
    isResizing,
    resizeHandle,
    localSize,
    minWidth,
    minHeight,
    onSizeChange,
    onPositionChange,
    onResizeEnd,
  ]);

  const defaultHandleStyle = useMemo(() => {
    return {
      position: 'absolute' as const,
      width: '8px',
      height: '8px',
      backgroundColor: '#3b82f6',
      border: '1px solid white',
      borderRadius: '50%',
      zIndex: 1001,
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
      onMouseDown={handleResizeMouseDown}
    >
      {children}
      {resizeHandles.map(({ handle, style: handleStyleProp }) => (
        <div key={handle} className="resize-handle" data-handle={handle} style={handleStyleProp} />
      ))}
    </div>
  );
};
