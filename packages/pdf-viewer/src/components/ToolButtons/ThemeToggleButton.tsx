import { Moon, Sun } from 'lucide-react';
import type { IToolButton } from './ToolButton.type';
import { useTheme } from '@/providers/ThemeContextProvider';

/**
 * Custom hook that returns a theme toggle button for the toolbar.
 * Uses hooks internally (useTheme), so must follow React hooks rules.
 */
export const useThemeToggleButton = (): IToolButton => {
  const { theme, toggleTheme } = useTheme();

  return {
    id: 'theme-toggle',
    name: theme === 'light' ? 'Dark Mode' : 'Light Mode',
    icon: theme === 'light' ? Moon : Sun,
    type: 'button',
    groupIndex: 0,
    onClick: () => {
      toggleTheme();
    },
  };
};
