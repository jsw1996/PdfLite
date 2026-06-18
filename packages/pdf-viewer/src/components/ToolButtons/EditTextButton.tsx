import type { IToolButton } from './ToolButton.type';
import { PencilLine } from 'lucide-react';

export const EditTextButtonId = 'editText';

export const EditTextButton: () => IToolButton = () => ({
  id: EditTextButtonId,
  name: 'Edit Text',
  icon: PencilLine,
  type: 'toggle',
  groupIndex: 1,
});
