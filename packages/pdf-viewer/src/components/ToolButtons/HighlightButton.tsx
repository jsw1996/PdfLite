import { Highlighter } from 'lucide-react';
import type { IToolButton } from './ToolButton.type';

export const HighlightButton: () => IToolButton = () => {
  return {
    id: 'highlight',
    name: 'Highlight',
    icon: Highlighter,
    type: 'toggle',
    groupIndex: 1,
  };
};

export const HighlightButtonId = 'highlight';
