import type { IToolButton } from './ToolButton.type';
import { Brush } from 'lucide-react';

export const DrawButton: () => IToolButton = () => {
  return {
    name: 'Draw',
    icon: Brush,
    type: 'button',
    groupIndex: 1,
  };
};
