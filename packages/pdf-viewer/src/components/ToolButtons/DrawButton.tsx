import type { IToolButton } from './ToolButton.type';
import { Brush } from 'lucide-react';

export const DrawButton: () => IToolButton = () => {
  return {
    id: 'draw',
    name: 'Draw',
    icon: Brush,
    type: 'toggle',
    groupIndex: 1,
  };
};

export const DrawButtonId = 'draw';
