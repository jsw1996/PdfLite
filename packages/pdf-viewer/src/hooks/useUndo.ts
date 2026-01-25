import { useAnnotation } from '@/providers/AnnotationContextProvider';
import { useEffect } from 'react';

export const useUndo = () => {
  const { popAnnotation } = useAnnotation();
  useEffect(() => {
    // Listen for undo event (ctrl+z / cmd+z)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        popAnnotation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [popAnnotation]);
};
