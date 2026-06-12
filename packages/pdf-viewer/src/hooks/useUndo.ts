import { useEditHistory } from '@/providers/EditHistoryContextProvider';
import { useEffect } from 'react';

export const useUndo = () => {
  const { undo, redo } = useEditHistory();
  useEffect(() => {
    // Listen for undo event (ctrl+z / cmd+z)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')) return;

      // Don't hijack native undo while the user is editing text. Targets such as
      // inputs, textareas, contentEditable regions and selects own Ctrl/Cmd+Z.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }

      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [redo, undo]);
};
