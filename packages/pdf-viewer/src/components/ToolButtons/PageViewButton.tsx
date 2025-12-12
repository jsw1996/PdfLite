import { BookOpen } from 'lucide-react';
import type { IToolButton } from './ToolButton.type';

export const PageViewButton: () => IToolButton = () => {
  return {
    name: 'Page View',
    icon: <BookOpen />,
    type: 'button',
    groupIndex: 0,
  };
};
