import { useSidebar } from '@pdfviewer/ui/components/sidebar';
import type { IToolButton } from './ToolButton.type';
import { PanelLeft } from 'lucide-react';

export const SidebarTriggerButton: () => IToolButton = () => {
  const { toggleSidebar } = useSidebar();

  return {
    name: 'SidebarTrigger',
    icon: <PanelLeft />,
    type: 'button',
    groupIndex: 0,
    onClick: toggleSidebar,
  };
};
