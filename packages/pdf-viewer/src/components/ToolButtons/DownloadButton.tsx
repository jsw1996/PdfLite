import { Download } from 'lucide-react';
import type { IToolButton } from './ToolButton.type';
import type { PdfController } from '@pdfviewer/controller';

export const DownloadButton: () => IToolButton = () => {
  return {
    id: 'download',
    name: 'Download',
    icon: Download,
    type: 'button',
    groupIndex: 0,
    onClick: (pdfController: PdfController, commitAnnotations: () => void) => {
      commitAnnotations();
      pdfController.downloadPdf();
    },
  };
};
