import type { IToolButton } from './ToolButton.type';
import { MousePointer2 } from 'lucide-react';

export const SelectButton: () => IToolButton = () => {
  return {
    name: 'Select',
    icon: MousePointer2,
    type: 'button',
    groupIndex: 0,
  };
};
