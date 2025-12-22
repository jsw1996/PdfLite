import type { IToolButton } from '@/components/ToolButtons/ToolButton.type';
import { PageViewButton } from '../components/ToolButtons/PageViewButton';
import { SelectButton } from '../components/ToolButtons/SelectButton';
import { SearchButton } from '../components/ToolButtons/SearchButton';
import { HighlightButton } from '../components/ToolButtons/HighlightButton';
import { DrawButton } from '../components/ToolButtons/DrawButton';
import { AddTextButton } from '../components/ToolButtons/AddTextButton';
import { SidebarTriggerButton } from '@/components/ToolButtons/SidebarTriggerButton';
import { PrintButton } from '@/components/ToolButtons/PrintButton';
import { DownloadButton } from '@/components/ToolButtons/DownloadButton';

export const getButtons: () => IToolButton[] = () => {
  return [
    // Group 0
    SidebarTriggerButton(),
    PageViewButton(),
    SelectButton(),
    SearchButton(),
    // Group 1
    HighlightButton(),
    DrawButton(),
    AddTextButton(),
  ];
};

export const getRightButtons: () => IToolButton[] = () => {
  return [DownloadButton(), PrintButton()];
};
