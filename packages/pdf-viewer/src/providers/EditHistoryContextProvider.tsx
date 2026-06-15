import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export interface IEditCommand {
  label: string;
  undo: () => void;
  redo: () => void;
  coalesceKey?: string;
  coalesceMs?: number;
}

interface IHistoryEntry {
  command: IEditCommand;
  createdAt: number;
}

interface IEditHistoryContextValue {
  run: (command: IEditCommand) => void;
  record: (command: IEditCommand) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const EditHistoryContext = createContext<IEditHistoryContextValue | null>(null);

export function useEditHistory(): IEditHistoryContextValue {
  const ctx = useContext(EditHistoryContext);
  if (!ctx) throw new Error('useEditHistory must be used within EditHistoryContextProvider');
  return ctx;
}

export function EditHistoryContextProvider({ children }: { children: React.ReactNode }) {
  const [undoStack, setUndoStack] = useState<IHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<IHistoryEntry[]>([]);
  const undoStackRef = useRef(undoStack);
  const redoStackRef = useRef(redoStack);

  const setUndoEntries = useCallback((updater: (prev: IHistoryEntry[]) => IHistoryEntry[]) => {
    setUndoStack((prev) => {
      const next = updater(prev);
      undoStackRef.current = next;
      return next;
    });
  }, []);

  const setRedoEntries = useCallback((updater: (prev: IHistoryEntry[]) => IHistoryEntry[]) => {
    setRedoStack((prev) => {
      const next = updater(prev);
      redoStackRef.current = next;
      return next;
    });
  }, []);

  const record = useCallback(
    (command: IEditCommand) => {
      const now = Date.now();
      setUndoEntries((prev) => {
        const last = prev[prev.length - 1];
        const coalesceMs = command.coalesceMs ?? 0;
        if (
          last &&
          command.coalesceKey &&
          last.command.coalesceKey === command.coalesceKey &&
          coalesceMs > 0 &&
          now - last.createdAt <= coalesceMs
        ) {
          return [
            ...prev.slice(0, -1),
            {
              command: {
                ...command,
                undo: last.command.undo,
              },
              createdAt: now,
            },
          ];
        }
        return [...prev, { command, createdAt: now }];
      });
      setRedoEntries(() => []);
    },
    [setRedoEntries, setUndoEntries],
  );

  const run = useCallback(
    (command: IEditCommand) => {
      command.redo();
      record(command);
    },
    [record],
  );

  const undo = useCallback(() => {
    const entry = undoStackRef.current[undoStackRef.current.length - 1];
    if (!entry) return;
    entry.command.undo();
    setUndoEntries((prev) => prev.slice(0, -1));
    setRedoEntries((prev) => [...prev, entry]);
  }, [setRedoEntries, setUndoEntries]);

  const redo = useCallback(() => {
    const entry = redoStackRef.current[redoStackRef.current.length - 1];
    if (!entry) return;
    entry.command.redo();
    setRedoEntries((prev) => prev.slice(0, -1));
    setUndoEntries((prev) => [...prev, { ...entry, createdAt: Date.now() }]);
  }, [setRedoEntries, setUndoEntries]);

  const value = useMemo<IEditHistoryContextValue>(
    () => ({
      run,
      record,
      undo,
      redo,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    }),
    [run, record, undo, redo, undoStack.length, redoStack.length],
  );

  return <EditHistoryContext.Provider value={value}>{children}</EditHistoryContext.Provider>;
}
