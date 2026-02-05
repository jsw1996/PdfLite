import { PDFDocument } from 'pdf-lib-with-encrypt';
import type { IFormField } from '@pdfviewer/controller';

type FormValue = string | boolean;

interface IFormValueEntry {
  field: IFormField;
  value: FormValue;
}

function resolveRadioExportValue(field: IFormField): string | null {
  if (field.exportValue?.trim() && field.exportValue.trim().toLowerCase() !== 'off') {
    return field.exportValue;
  }
  if (field.controlIndex != null && field.controlIndex >= 0) {
    return String(field.controlIndex + 1);
  }
  if (field.value?.trim() && field.value.trim().toLowerCase() !== 'off') {
    return field.value;
  }
  return null;
}

export async function applyFormValues(
  pdfBytes: Uint8Array,
  entries: IFormValueEntry[],
): Promise<Uint8Array> {
  if (entries.length === 0) return pdfBytes;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();

  const handledNames = new Set<string>();
  const radioGroups = new Map<string, { entries: IFormValueEntry[]; selectedId: string }>();

  for (const entry of entries) {
    const name = entry.field.name || entry.field.id;
    if (!name) continue;

    if (entry.field.type === 'radio') {
      const selectedId = typeof entry.value === 'string' ? entry.value : '';
      const group = radioGroups.get(name);
      if (group) {
        group.entries.push(entry);
        if (selectedId) group.selectedId = selectedId;
      } else {
        radioGroups.set(name, { entries: [entry], selectedId });
      }
      continue;
    }

    if (handledNames.has(name)) continue;
    handledNames.add(name);

    try {
      if (entry.field.type === 'checkbox') {
        const checkbox = form.getCheckBox(name);
        if (entry.value === true) checkbox.check();
        else checkbox.uncheck();
        continue;
      }

      if (entry.field.type === 'combo') {
        const dropdown = form.getDropdown(name);
        if (typeof entry.value === 'string') dropdown.select(entry.value);
        continue;
      }

      if (entry.field.type === 'list') {
        const list = form.getOptionList(name);
        if (typeof entry.value === 'string') list.select(entry.value);
        continue;
      }

      if (entry.field.type === 'text') {
        const textField = form.getTextField(name);
        textField.setText(typeof entry.value === 'string' ? entry.value : '');
        continue;
      }
    } catch (error) {
      console.warn('applyFormValues: failed to set field', name, error);
    }
  }

  radioGroups.forEach((group, name) => {
    if (!group.selectedId) return;
    const selected = group.entries.find((entry) => entry.field.id === group.selectedId);
    if (!selected) return;
    const exportValue = resolveRadioExportValue(selected.field);
    if (!exportValue) return;
    try {
      const radioGroup = form.getRadioGroup(name);
      radioGroup.select(exportValue);
    } catch (error) {
      console.warn('applyFormValues: failed to set radio group', name, error);
    }
  });

  return await pdfDoc.save();
}
