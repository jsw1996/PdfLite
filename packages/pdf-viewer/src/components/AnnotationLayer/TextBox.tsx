import { cn } from '@pdfviewer/ui/lib/utils';
import type { IPoint } from '../../../../controller/dist/PdfController';
import React from 'react';
export const TextBox = ({ value, pos }: { value: string; pos: IPoint }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const className = cn('field-sizing-content resize-none absolute w-[stretch] overflow-hidden');
  // auto focus on mount
  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  return (
    <textarea
      ref={textareaRef}
      className={className}
      style={{ left: pos.x, top: pos.y }}
      defaultValue={value}
    />
  );
};
