import type { IToolButton } from './ToolButton.type';
import { Search } from 'lucide-react';

export const SearchButton: () => IToolButton = () => {
  return {
    name: 'Search',
    icon: Search,
    type: 'button',
    groupIndex: 0,
  };
};
