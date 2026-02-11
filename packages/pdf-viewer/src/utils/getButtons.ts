import type { IToolButton } from '@/components/ToolButtons/ToolButton.type';
import { PageViewButton } from '../components/ToolButtons/PageViewButton';
import { SelectButton } from '../components/ToolButtons/SelectButton';
import { HighlightButton } from '../components/ToolButtons/HighlightButton';
import { DrawButton } from '../components/ToolButtons/DrawButton';
import { AddTextButton } from '../components/ToolButtons/AddTextButton';
import { SignatureButton } from '../components/ToolButtons/SignatureButton';
import { EditTextButton } from '../components/ToolButtons/EditTextButton';
import { PrintButton } from '@/components/ToolButtons/PrintButton';
import { useDownloadButton } from '@/components/ToolButtons/DownloadButton';
import { useThemeToggleButton } from '@/components/ToolButtons/ThemeToggleButton';

/** Returns the center toolbar buttons. */
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
    EditTextButton(),
  ];
};

/** Returns the right toolbar buttons. */
export const useRightButtons = (): IToolButton[] => {
  const themeToggleButton = useThemeToggleButton();
  const downloadButton = useDownloadButton();
  return [downloadButton, PrintButton(), themeToggleButton];
};
