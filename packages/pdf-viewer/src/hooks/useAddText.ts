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
        createdAt: Date.now(),
      };
      addAnnotation(annotation);
      setSelectedTool(null);
    },
    [selectedTool, addAnnotation, pageElement, pageIndex, setSelectedTool],
  );

  useEffect(() => {
    if (!pageElement) return;

    pageElement.addEventListener('click', handleClick);

    return () => {
      pageElement.removeEventListener('click', handleClick);
    };
  }, [pageElement, handleClick]);
};
