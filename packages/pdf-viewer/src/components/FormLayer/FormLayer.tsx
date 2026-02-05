import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { IFormField } from '@pdfviewer/controller';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { usePdfScale } from '@/providers/PdfStateContextProvider';
import { useFormContext } from '@/providers/FormContextProvider';
import { clampFinite } from '@/utils/shared';

export interface IFormLayerProps {
  pdfCanvas: HTMLCanvasElement | null;
  containerEl: HTMLElement | null;
  pageIndex: number;
}

interface ILayerMetrics {
  top: number;
  left: number;
  cssWidth: number;
  cssHeight: number;
}

function computeMetrics(
  pdfCanvas: HTMLCanvasElement | null,
  containerEl: HTMLElement | null,
): ILayerMetrics | null {
  if (!pdfCanvas || !containerEl) return null;
  const rect = pdfCanvas.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  const top = rect.top - containerRect.top;
  const left = rect.left - containerRect.left;

  return {
    top: clampFinite(top, 0),
    left: clampFinite(left, 0),
    cssWidth: clampFinite(rect.width, 0),
    cssHeight: clampFinite(rect.height, 0),
  };
}

const stopEvent = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

export const FormLayer: React.FC<IFormLayerProps> = ({ pdfCanvas, containerEl, pageIndex }) => {
  const { controller } = usePdfController();
  const { scale } = usePdfScale();
  const { registerFields, getValue, setValue } = useFormContext();

  const fields = useMemo<IFormField[]>(
    () => controller.listFormFields(pageIndex, { scale: 1 }),
    [controller, pageIndex],
  );

  useEffect(() => {
    registerFields(fields);
  }, [fields, registerFields]);

  const [metricsVersion, setMetricsVersion] = useState(0);
  const metrics = useMemo(() => {
    void metricsVersion;
    return computeMetrics(pdfCanvas, containerEl);
  }, [pdfCanvas, containerEl, metricsVersion]);

  const updateMetrics = useCallback(() => {
    setMetricsVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!pdfCanvas) return;
    const ro = new ResizeObserver(() => updateMetrics());
    ro.observe(pdfCanvas);
    window.addEventListener('resize', updateMetrics);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [pdfCanvas, updateMetrics]);

  const layerStyle = useMemo<React.CSSProperties>(() => {
    if (!metrics) return { display: 'none' };
    return {
      position: 'absolute',
      top: metrics.top,
      left: metrics.left,
      width: metrics.cssWidth,
      height: metrics.cssHeight,
      zIndex: 30,
      pointerEvents: 'none',
    };
  }, [metrics]);

  if (!metrics || fields.length === 0) return null;

  return (
    <div style={layerStyle} data-slot="form-layer">
      {fields.map((field) => {
        const left = field.rect.left * scale;
        const top = field.rect.top * scale;
        const width = field.rect.width * scale;
        const height = field.rect.height * scale;

        if (width < 2 || height < 2) return null;

        const baseFontSize =
          field.fontSize && field.fontSize > 0
            ? field.fontSize * scale
            : Math.max(8, height * 0.7);

        const commonStyle: React.CSSProperties = {
          position: 'absolute',
          left,
          top,
          width,
          height,
          boxSizing: 'border-box',
          fontSize: baseFontSize,
          lineHeight: 1.1,
          padding: '2px 4px',
          borderRadius: 2,
          border: '1px solid rgba(59, 130, 246, 0.35)',
          background: 'rgba(255, 255, 255, 0.65)',
          color: '#111827',
          cursor: 'text',
          pointerEvents: 'auto',
        };

        if (field.type === 'checkbox') {
          const checked = (getValue(field) as boolean | undefined) ?? Boolean(field.isChecked);
          return (
            <input
              key={field.id}
              type="checkbox"
              checked={checked}
              disabled={field.isReadOnly}
              aria-label={field.name || 'Checkbox'}
              style={{
                position: 'absolute',
                left,
                top,
                width,
                height,
                pointerEvents: 'auto',
                cursor: 'pointer',
                accentColor: '#2563eb',
              }}
              onChange={(e) => setValue(field, e.target.checked)}
              onPointerDown={stopEvent}
              onClick={stopEvent}
            />
          );
        }

        if (field.type === 'radio') {
          const value = getValue(field);
          const activeValue = typeof value === 'string' ? value : '';
          const checked = activeValue ? activeValue === field.id : Boolean(field.isChecked);

          return (
            <input
              key={field.id}
              type="radio"
              name={field.name || field.id}
              checked={checked}
              disabled={field.isReadOnly}
              aria-label={field.name || 'Radio'}
              style={{
                position: 'absolute',
                left,
                top,
                width,
                height,
                pointerEvents: 'auto',
                cursor: 'pointer',
                accentColor: '#2563eb',
              }}
              onChange={(e) => {
                if (!e.target.checked) return;
                setValue(field, field.id);
              }}
              onPointerDown={stopEvent}
              onClick={stopEvent}
            />
          );
        }

        if (field.type === 'combo' && field.isEditable) {
          const value =
            (getValue(field) as string | undefined) ||
            field.value ||
            field.options?.find((o) => o.selected)?.label ||
            '';
          const listId = `form-combo-${field.id}`;

          return (
            <React.Fragment key={field.id}>
              <input
                type="text"
                list={listId}
                value={value}
                disabled={field.isReadOnly}
                aria-label={field.name || 'Combo'}
                style={commonStyle}
                onChange={(e) => setValue(field, e.target.value)}
                onPointerDown={stopEvent}
                onClick={stopEvent}
              />
              <datalist id={listId}>
                {field.options?.map((opt, index) => (
                  <option key={`${field.id}-opt-${index}`} value={opt.label} />
                ))}
              </datalist>
            </React.Fragment>
          );
        }

        if (field.type === 'combo' || field.type === 'list') {
          const value =
            (getValue(field) as string | undefined) ||
            field.value ||
            field.options?.find((o) => o.selected)?.label ||
            '';

          return (
            <select
              key={field.id}
              value={value}
              disabled={field.isReadOnly}
              aria-label={field.name || 'Select'}
              style={commonStyle}
              onChange={(e) => setValue(field, e.target.value)}
              onPointerDown={stopEvent}
              onClick={stopEvent}
            >
              {field.options?.map((opt, index) => (
                <option key={`${field.id}-opt-${index}`} value={opt.label}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
        }

        if (field.type === 'pushbutton') {
          return (
            <button
              key={field.id}
              type="button"
              disabled
              aria-label={field.name || 'Button'}
              style={{
                ...commonStyle,
                cursor: 'default',
                background: 'rgba(226, 232, 240, 0.75)',
              }}
              onPointerDown={stopEvent}
              onClick={stopEvent}
            >
              {field.name || 'Button'}
            </button>
          );
        }

        if (field.type === 'signature') {
          return (
            <div
              key={field.id}
              aria-label={field.name || 'Signature'}
              style={{
                ...commonStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.max(8, height * 0.5),
                color: '#475569',
              }}
            >
              Signature
            </div>
          );
        }

        const textValue =
          (getValue(field) as string | undefined) ??
          field.value ??
          '';

        if (field.isMultiline) {
          return (
            <textarea
              key={field.id}
              value={textValue}
              disabled={field.isReadOnly}
              aria-label={field.name || 'Text field'}
              style={{ ...commonStyle, resize: 'none' }}
              onChange={(e) => setValue(field, e.target.value)}
              onPointerDown={stopEvent}
              onClick={stopEvent}
            />
          );
        }

        return (
          <input
            key={field.id}
            type={field.isPassword ? 'password' : 'text'}
            value={textValue}
            disabled={field.isReadOnly}
            aria-label={field.name || 'Text field'}
            style={commonStyle}
            onChange={(e) => setValue(field, e.target.value)}
            onPointerDown={stopEvent}
            onClick={stopEvent}
          />
        );
      })}
    </div>
  );
};
