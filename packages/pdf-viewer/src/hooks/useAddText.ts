import { useAnnotation } from '../providers/AnnotationContextProvider';
import { AnnotationType } from '../types/annotation';
import { useEffect, useCallback } from 'react';

export const useAddText = (pageElement: HTMLDivElement | null, pageIndex: number) => {
  const { selectedTool, addAnnotation, setSelectedTool } = useAnnotation();

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (selectedTool !== AnnotationType.TEXT) return;
      if (!pageElement) return;
      const rect = pageElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      addAnnotation({
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: AnnotationType.TEXT,
        shape: 'polygon',
        source: 'overlay',
        points: [{ x, y }],
        color: 'black',
        strokeWidth: 0,
        createdAt: Date.now(),
        pageIndex,
        textContent: '',
      });
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
