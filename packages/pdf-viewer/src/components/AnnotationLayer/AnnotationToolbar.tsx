import React, { type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@pdfviewer/ui/lib/utils';

/**
 * Shared icon-button styling for annotation toolbars (text, signature, …).
 * Kept here so every annotation toolbar renders identical-looking controls.
 */
export const toolbarIconBtn =
  'flex h-7 w-7 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-foreground/10';

/** Thin vertical separator between toolbar control groups. */
export const ToolbarDivider: React.FC = () => <div className="mx-0.5 h-5 w-px bg-border/60" />;

export interface IToolbarDeleteButtonProps {
  onDelete: () => void;
  /** Accessible label (defaults to a generic "Delete"). */
  label?: string;
}

/**
 * Reusable destructive delete button shared across annotation toolbars.
 * `onMouseDown` preventDefault keeps focus on the active editor (e.g. a text
 * box's textarea) so toggling controls doesn't blur it; harmless elsewhere.
 */
export const ToolbarDeleteButton: React.FC<IToolbarDeleteButtonProps> = ({
  onDelete,
  label = 'Delete',
}) => (
  <button
    type="button"
    className={cn(toolbarIconBtn, 'hover:bg-destructive/15 hover:text-destructive')}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onDelete}
    aria-label={label}
  >
    <Trash2 size={15} />
  </button>
);

export interface IAnnotationToolbarProps {
  /** Render above or below the annotation box, depending on available room. */
  placement: 'above' | 'below';
  children: ReactNode;
}

/**
 * Floating toolbar shell shared by selectable annotation overlays. Provides the
 * popover chrome and above/below placement; consumers supply the controls.
 * Pointer/click events are stopped so interacting with the toolbar never starts
 * a drag or deselects the underlying annotation box.
 */
export const AnnotationToolbar: React.FC<IAnnotationToolbarProps> = ({ placement, children }) => (
  <div
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
    className={cn(
      'absolute left-0 z-1001 flex items-center gap-1 rounded-lg border border-border/60',
      'bg-popover/95 p-1 shadow-md backdrop-blur-sm',
      placement === 'above' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
    )}
    style={{ cursor: 'default' }}
  >
    {children}
  </div>
);
