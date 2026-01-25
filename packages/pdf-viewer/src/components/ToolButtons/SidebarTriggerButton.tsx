import { useSidebar } from '@pdfviewer/ui/components/sidebar';
import type { IToolButton } from './ToolButton.type';
import { PanelLeft } from 'lucide-react';

/**
 * Custom hook that returns a SidebarTrigger tool button configuration.
 * Named with 'use' prefix as it uses the useSidebar hook internally.
 */
export const useSidebarTriggerButton = (): IToolButton => {
  const { toggleSidebar } = useSidebar();

  return {
    name: 'SidebarTrigger',
    icon: PanelLeft,
    type: 'button',
    groupIndex: 0,
    onClick: toggleSidebar,
  };
};

/**
 * @deprecated Use useSidebarTriggerButton instead. This alias exists for backward compatibility.
 */
export const SidebarTriggerButton = useSidebarTriggerButton;
