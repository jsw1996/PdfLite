import { Printer } from 'lucide-react';
import type { IToolButton } from './ToolButton.type';

export const PrintButton: () => IToolButton = () => {
  return {
    id: 'print',
    name: 'Print',
    icon: Printer,
    type: 'button',
    groupIndex: 0,
  };
};

export const PrintButtonId = 'print';
