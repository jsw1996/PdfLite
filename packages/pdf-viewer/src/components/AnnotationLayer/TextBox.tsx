import { cn } from '@pdfviewer/ui/lib/utils';
import type { IPoint, ITextAnnotation } from '../../annotations';
import React from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';

export interface ITextBoxProps {
  id: string;
  content: string;
  position: IPoint;
  fontSize: number;
  fontColor: string;
}

type Mode = 'editing' | 'selected' | 'idle';

export const TextBox = ({ id, content, position, fontSize, fontColor }: ITextBoxProps) => {
  const { updateAnnotation } = useAnnotation();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = React.useState<Mode>('editing');
  const [localPosition, setLocalPosition] = React.useState<IPoint>(position);
  const [isDragging, setIsDragging] = React.useState(false);

  const className = cn(
    'field-sizing-content resize-none absolute max-w-[stretch] max-h-[stretch] overflow-hidden caret-black focus:border focus:border-[#a200ff] focus:outline-none focus:border-dashed min-w-[50px] bg-transparent',
    mode === 'editing' && 'cursor-text',
    mode === 'selected' && !isDragging && 'cursor-grab',
    isDragging && 'cursor-grabbing select-none',
  );

  // Auto focus on mount
  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Sync position from props
  React.useEffect(() => {
    setLocalPosition(position);
  }, [position]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'selected') return;

    const offset = {
      x: e.clientX - localPosition.x,
      y: e.clientY - localPosition.y,
    };
    let currentPos = localPosition;
    let dragged = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragged) {
        dragged = true;
        setIsDragging(true);
      }
      currentPos = {
        x: Math.max(moveEvent.clientX - offset.x, 0),
        y: Math.max(moveEvent.clientY - offset.y, 0),
      };
      setLocalPosition(currentPos);
    };

    const handleMouseUp = () => {
      if (dragged) {
        const rect = textareaRef.current?.getBoundingClientRect();
        updateAnnotation(id, {
          position: currentPos,
          dimensions: rect ? { width: rect.width, height: rect.height } : undefined,
        } as Partial<ITextAnnotation>);
        setIsDragging(false);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleClick = () => {
    if (isDragging) return;

    if (mode === 'idle') {
      setMode('selected');
    } else if (mode === 'selected') {
      setMode('editing');
      textareaRef.current?.focus();
    }
  };

  const handleBlur = () => {
    setMode('idle');
    const newContent = textareaRef.current?.value ?? '';
    if (newContent !== content) {
      updateAnnotation(id, { content: newContent } as Partial<ITextAnnotation>);
    }
  };

  return (
    <textarea
      ref={textareaRef}
      readOnly={mode !== 'editing'}
      className={className}
      style={{
        left: localPosition.x,
        top: localPosition.y,
        fontSize: `${fontSize}px`,
        color: fontColor,
      }}
      defaultValue={content}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onBlur={handleBlur}
    />
  );
};
