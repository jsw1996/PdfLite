import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { IFormField } from '@pdfviewer/controller';
import { usePdfController } from './PdfControllerContextProvider';

type FormValue = string | boolean;

interface IFormContextValue {
  registerFields: (fields: IFormField[]) => void;
  getValue: (field: IFormField) => FormValue | undefined;
  setValue: (field: IFormField, value: FormValue) => void;
  getFormValuesSnapshot: () => { field: IFormField; value: FormValue }[];
  commitFormValues: () => void;
}

const FormContext = createContext<IFormContextValue | null>(null);

export function useFormContext(): IFormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error('useFormContext must be used within FormContextProvider');
  return ctx;
}

function getFieldStorageKey(field: IFormField): string {
  if (field.type === 'radio') return field.name || field.id;
  if (field.type === 'checkbox') return field.id;
  return field.name || field.id;
}

function getDefaultValue(field: IFormField): FormValue {
  if (field.type === 'checkbox') {
    return Boolean(field.isChecked);
  }
  if (field.type === 'radio') {
    return field.isChecked ? field.id : '';
  }
  if (field.type === 'combo' || field.type === 'list') {
    return (field.value || field.options?.find((o) => o.selected)?.label) ?? '';
  }
  return field.value || '';
}

export function FormContextProvider({ children }: { children: React.ReactNode }) {
  const { controller } = usePdfController();
  const [values, setValues] = useState<Map<string, FormValue>>(new Map());
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  const fieldMetaRef = useRef<Map<string, IFormField>>(new Map());
  const fieldKeyByIdRef = useRef<Map<string, string>>(new Map());

  const registerFields = useCallback((fields: IFormField[]) => {
    if (!fields.length) return;

    setValues((prev) => {
      let next = prev;
      let changed = false;

      for (const field of fields) {
        fieldMetaRef.current.set(field.id, field);
        const key = getFieldStorageKey(field);
        fieldKeyByIdRef.current.set(field.id, key);

        const hasKey = next.has(key);
        if (!hasKey) {
          if (!changed) {
            next = new Map(prev);
            changed = true;
          }
          next.set(key, getDefaultValue(field));
        } else if (field.type === 'radio' && field.isChecked) {
          const currentValue = next.get(key);
          if (!currentValue) {
            if (!changed) {
              next = new Map(prev);
              changed = true;
            }
            next.set(key, field.id);
          }
        }
      }

      return changed ? next : prev;
    });
  }, []);

  const getValue = useCallback(
    (field: IFormField) => {
      const key = fieldKeyByIdRef.current.get(field.id) ?? getFieldStorageKey(field);
      return values.get(key);
    },
    [values],
  );

  const setValue = useCallback((field: IFormField, value: FormValue) => {
    const key = fieldKeyByIdRef.current.get(field.id) ?? getFieldStorageKey(field);
    setValues((prev) => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const getFormValuesSnapshot = useCallback(() => {
    const snapshot: { field: IFormField; value: FormValue }[] = [];
    fieldMetaRef.current.forEach((field) => {
      const key = fieldKeyByIdRef.current.get(field.id) ?? getFieldStorageKey(field);
      const value = values.get(key);
      if (value == null) return;
      snapshot.push({ field, value });
    });
    return snapshot;
  }, [values]);

  const commitFormValues = useCallback(() => {
    if (dirtyKeys.size === 0) return;

    fieldMetaRef.current.forEach((field) => {
      const key = fieldKeyByIdRef.current.get(field.id) ?? getFieldStorageKey(field);
      if (!dirtyKeys.has(key)) return;
      const value = values.get(key);
      if (value == null) return;

      if (field.type === 'pushbutton' || field.type === 'signature') {
        return;
      }

      controller.setFormFieldValue(field, value);
    });

    setDirtyKeys(new Set());
  }, [controller, dirtyKeys, values]);

  const contextValue = useMemo<IFormContextValue>(
    () => ({
      registerFields,
      getValue,
      setValue,
      getFormValuesSnapshot,
      commitFormValues,
    }),
    [registerFields, getValue, setValue, getFormValuesSnapshot, commitFormValues],
  );

  return <FormContext.Provider value={contextValue}>{children}</FormContext.Provider>;
}
