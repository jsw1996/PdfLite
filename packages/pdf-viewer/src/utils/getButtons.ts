import type { IToolButton } from '@/components/ToolButtons/ToolButton.type';
import { PageViewButton } from '../components/ToolButtons/PageViewButton';
import { SelectButton } from '../components/ToolButtons/SelectButton';
import { SearchButton } from '../components/ToolButtons/SearchButton';
import { HighlightButton } from '../components/ToolButtons/HighlightButton';
import { DrawButton } from '../components/ToolButtons/DrawButton';
import { AddTextButton } from '../components/ToolButtons/AddTextButton';

export const getButtons: () => IToolButton[] = () => {
  return [
    // Group 0
    PageViewButton(),
    SelectButton(),
    SearchButton(),
    // Group 1
    HighlightButton(),
    DrawButton(),
    AddTextButton(),
  ];
};
