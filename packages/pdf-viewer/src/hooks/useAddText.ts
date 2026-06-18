import { useAnnotation } from '../providers/AnnotationContextProvider';
import {
  type ITextAnnotation,
  generateAnnotationId,
  TEXT_ANNOTATION_DEFAULTS,
} from '../annotations';
import { useEffect, useCallback } from 'react';

export const useAddText = (pageElement: HTMLDivElement | null, pageIndex: number) => {
  const { selectedTool, addAnnotation, setSelectedTool } = useAnnotation();

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (selectedTool !== 'text') return;
      if (!pageElement) return;
      // Ignore clicks landing on an existing text box (e.g. selecting/editing
      // one) — otherwise the tool would drop a new box on top of it.
      if ((e.target as HTMLElement).closest('.text-annotation-box')) return;
      // Ignore clicks that conclude a text-selection drag — otherwise selecting
      // page text while the text tool is active would drop an empty box.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().length > 0) return;
      const rect = pageElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top - TEXT_ANNOTATION_DEFAULTS.FONT_SIZE / 2; // offset by half font size

      const annotation: ITextAnnotation = {
        id: generateAnnotationId('text'),
        type: 'text',
        source: 'overlay',
        pageIndex,
        position: { x, y },
        content: '',
        fontSize: TEXT_ANNOTATION_DEFAULTS.FONT_SIZE,
        fontColor: TEXT_ANNOTATION_DEFAULTS.FONT_COLOR,
        fontWeight: 'normal',
        fontStyle: 'normal',
        createdAt: Date.now(),
      };
      addAnnotation(annotation);
      // Tool stays active so the user can drop multiple boxes in a row.
    },
    [selectedTool, addAnnotation, pageElement, pageIndex],
  );

  useEffect(() => {
    if (!pageElement) return;

    pageElement.addEventListener('click', handleClick);

    return () => {
      pageElement.removeEventListener('click', handleClick);
    };
  }, [pageElement, handleClick]);

  // While the tool is active, Escape exits it (back to normal pointer mode).
  // When the user is typing inside a box, the box's own Escape handler takes
  // precedence (we ignore Escape originating from an editable element).
  useEffect(() => {
    if (selectedTool !== 'text') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      const isEditing = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement;
      if (isEditing) return;
      setSelectedTool(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedTool, setSelectedTool]);
};
