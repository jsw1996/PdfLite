import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { PasswordProtectionDialog } from '@/components/DownloadDialog/PasswordProtectionDialog';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { useAnnotation } from '@/providers/AnnotationContextProvider';
import { encryptPdf } from '@/utils/pdfEncrypt';

interface IDownloadDialogContextValue {
  openDownloadDialog: () => void;
}

const DownloadDialogContext = createContext<IDownloadDialogContextValue | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export function useDownloadDialog(): IDownloadDialogContextValue {
  const ctx = useContext(DownloadDialogContext);
  if (!ctx) {
    throw new Error('useDownloadDialog must be used within DownloadDialogProvider');
  }
  return ctx;
}

interface IDownloadDialogProviderProps {
  children: ReactNode;
  fileName?: string;
}

export function DownloadDialogProvider({
  children,
  fileName = 'document.pdf',
}: IDownloadDialogProviderProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { controller } = usePdfController();
  const { commitAnnotations } = useAnnotation();

  const openDownloadDialog = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const handleDownload = useCallback(
    async (options: {
      enablePassword: boolean;
      password?: string;
      permissions?: {
        printing: boolean;
        copying: boolean;
        modifying: boolean;
      };
    }) => {
      try {
        setIsProcessing(true);

        // Commit any pending annotations first
        commitAnnotations();

        // Export the PDF bytes
        let pdfBytes = controller.exportPdfBytes();

        // If password protection is enabled, encrypt the PDF
        if (options.enablePassword && options.password) {
          pdfBytes = await encryptPdf(pdfBytes, {
            userPassword: options.password,
            permissions: options.permissions
              ? {
                  printing: options.permissions.printing,
                  copying: options.permissions.copying,
                  modifying: options.permissions.modifying,
                  annotating: options.permissions.modifying,
                }
              : undefined,
          });
        }

        // Trigger download - create a copy with standard ArrayBuffer for Blob compatibility
        const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);

        // Close the dialog
        setIsDialogOpen(false);
      } catch (error) {
        console.error('Failed to download PDF:', error);
        alert('Failed to download PDF. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    },
    [controller, fileName, commitAnnotations],
  );

  const value = useMemo<IDownloadDialogContextValue>(
    () => ({
      openDownloadDialog,
    }),
    [openDownloadDialog],
  );

  return (
    <DownloadDialogContext.Provider value={value}>
      {children}
      <PasswordProtectionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onDownload={(options) => void handleDownload(options)}
        isProcessing={isProcessing}
      />
    </DownloadDialogContext.Provider>
  );
}
