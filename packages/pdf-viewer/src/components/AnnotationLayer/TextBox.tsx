import { cn } from '@pdfviewer/ui/lib/utils';
import type { IPoint } from '../../../../controller/dist/PdfController';
import React from 'react';

export const TextBox = ({ value, pos }: { value: string; pos: IPoint }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isReadonly, setIsReadonly] = React.useState(false);
  const [position, setPosition] = React.useState<IPoint>(pos);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragOffset = React.useRef<IPoint>({ x: 0, y: 0 });

  const className = cn(
    'field-sizing-content resize-none absolute max-w-[stretch] max-h-[stretch] overflow-hidden caret-black focus:border focus:border-[#a200ff] focus:outline-none focus:border-dashed min-w-[50px]',
    isDragging && 'cursor-grabbing',
    isReadonly && 'cursor-grab select-none',
    !isReadonly && 'cursor-text',
  );

  // auto focus on mount
  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isReadonly) return;
    e.preventDefault();
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(e.clientX - dragOffset.current.x, 0),
        y: Math.max(e.clientY - dragOffset.current.y, 0),
      });
    },
    [isDragging],
  );

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleClick = () => {
    if (isReadonly) {
      textareaRef.current?.focus();
    }
  };

  const onDoubleClick = () => {
    setIsReadonly(false);
    textareaRef.current?.focus();
  };

  return (
    <textarea
      onBlur={() => setIsReadonly(true)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      readOnly={isReadonly}
      ref={textareaRef}
      className={className}
      style={{ left: position.x, top: position.y }}
      defaultValue={value}
    />
  );
};
