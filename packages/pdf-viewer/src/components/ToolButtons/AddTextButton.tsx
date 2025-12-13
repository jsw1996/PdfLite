import type { IToolButton } from './ToolButton.type';
import { PenLine } from 'lucide-react';

export const AddTextButton: () => IToolButton = () => {
  return {
    name: 'Add Text',
    icon: PenLine,
    type: 'button',
    groupIndex: 1,
  };
};
