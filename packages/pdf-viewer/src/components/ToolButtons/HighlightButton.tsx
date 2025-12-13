import { Highlighter } from 'lucide-react';
import type { IToolButton } from './ToolButton.type';

export const HighlightButton: () => IToolButton = () => {
  return {
    name: 'Highlight',
    icon: Highlighter,
    type: 'button',
    groupIndex: 1,
  };
};
