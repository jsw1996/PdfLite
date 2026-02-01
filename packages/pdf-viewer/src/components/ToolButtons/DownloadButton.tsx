import { Download } from 'lucide-react';
import type { IToolButton } from './ToolButton.type';
import { useDownloadDialog } from '@/providers/DownloadDialogProvider';

/**
 * Hook that returns the Download button configuration.
 * Opens a dialog allowing users to optionally add password protection before downloading.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useDownloadButton = (): IToolButton => {
  const { openDownloadDialog } = useDownloadDialog();

  return {
    id: 'download',
    name: 'Download',
    icon: Download,
    type: 'button',
    groupIndex: 0,
    onClick: () => {
      openDownloadDialog();
    },
  };
};

/**
 * @deprecated Use useDownloadButton instead. This exists for backward compatibility
 * and provides direct download without password protection dialog.
 */
export const DownloadButton: () => IToolButton = () => {
  return {
    id: 'download',
    name: 'Download',
    icon: Download,
    type: 'button',
    groupIndex: 0,
    onClick: (pdfController, commitAnnotations) => {
      commitAnnotations();
      pdfController.downloadPdf();
    },
  };
};
