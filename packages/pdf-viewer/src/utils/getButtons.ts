import type { IToolButton } from '@/components/ToolButtons/ToolButton.type';
import { PageViewButton } from '../components/ToolButtons/PageViewButton';
import { SelectButton } from '../components/ToolButtons/SelectButton';
import { HighlightButton } from '../components/ToolButtons/HighlightButton';
import { DrawButton } from '../components/ToolButtons/DrawButton';
import { AddTextButton } from '../components/ToolButtons/AddTextButton';
import { SignatureButton } from '../components/ToolButtons/SignatureButton';
import { PrintButton } from '@/components/ToolButtons/PrintButton';
import { useDownloadButton } from '@/components/ToolButtons/DownloadButton';
import { useThemeToggleButton } from '@/components/ToolButtons/ThemeToggleButton';

/**
 * Custom hook that returns the center toolbar buttons.
 * Named with 'use' prefix as it uses hooks internally (useSidebarTriggerButton).
 */
export const useButtons = (): IToolButton[] => {
  return [
    // Group 0
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
  const downloadButton = useDownloadButton();
  return [downloadButton, PrintButton(), themeToggleButton];
};

/**
 * @deprecated Use useRightButtons instead. This exists for backward compatibility.
 */
export const getRightButtons = useRightButtons;
