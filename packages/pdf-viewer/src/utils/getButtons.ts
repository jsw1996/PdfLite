import type { IToolButton } from '@/components/ToolButtons/ToolButton.type';
import { PageViewButton } from '../components/ToolButtons/PageViewButton';
import { SelectButton } from '../components/ToolButtons/SelectButton';
import { HighlightButton } from '../components/ToolButtons/HighlightButton';
import { DrawButton } from '../components/ToolButtons/DrawButton';
import { AddTextButton } from '../components/ToolButtons/AddTextButton';
import { SignatureButton } from '../components/ToolButtons/SignatureButton';
import { useSidebarTriggerButton } from '@/components/ToolButtons/SidebarTriggerButton';
import { PrintButton } from '@/components/ToolButtons/PrintButton';
import { DownloadButton } from '@/components/ToolButtons/DownloadButton';
import { useThemeToggleButton } from '@/components/ToolButtons/ThemeToggleButton';

/**
 * Custom hook that returns the center toolbar buttons.
 * Named with 'use' prefix as it uses hooks internally (useSidebarTriggerButton).
 */
export const useButtons = (): IToolButton[] => {
  const sidebarTriggerButton = useSidebarTriggerButton();
  return [
    // Group 0
    sidebarTriggerButton,
    PageViewButton(),
    SelectButton(),
    // Group 1
    HighlightButton(),
    DrawButton(),
    AddTextButton(),
    SignatureButton(),
  ];
};

/**
 * @deprecated Use useButtons instead. This exists for backward compatibility.
 */
export const getButtons = useButtons;

/**
 * Custom hook that returns the right toolbar buttons.
 * Named with 'use' prefix as it uses hooks internally (useThemeToggleButton).
 */
export const useRightButtons = (): IToolButton[] => {
  const themeToggleButton = useThemeToggleButton();
  return [DownloadButton(), PrintButton(), themeToggleButton];
};

/**
 * @deprecated Use useRightButtons instead. This exists for backward compatibility.
 */
export const getRightButtons = useRightButtons;
