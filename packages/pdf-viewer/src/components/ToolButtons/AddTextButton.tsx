import type { IToolButton } from './ToolButton.type';
import { Type } from 'lucide-react';

export const AddTextButton: () => IToolButton = () => {
  return {
    id: 'text',
    name: 'Add Text',
    icon: Type,
    type: 'toggle',
    groupIndex: 1,
  };
};
