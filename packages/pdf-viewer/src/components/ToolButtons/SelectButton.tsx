import type { IToolButton } from './ToolButton.type';
import { MousePointer2 } from 'lucide-react';

export const SelectButtonId = 'select';

export const SelectButton: () => IToolButton = () => {
  return {
    id: SelectButtonId,
    name: 'Select',
    icon: MousePointer2,
    type: 'toggle',
    groupIndex: 0,
  };
};
