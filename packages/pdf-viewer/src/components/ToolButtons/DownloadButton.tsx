import { Download } from 'lucide-react';
import type { IToolButton } from './ToolButton.type';

export const DownloadButton: () => IToolButton = () => {
  return {
    id: 'download',
    name: 'Download',
    icon: Download,
    type: 'button',
    groupIndex: 0,
  };
};
