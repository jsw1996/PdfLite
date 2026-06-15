import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { PasswordProtectionDialog } from '@/components/DownloadDialog/PasswordProtectionDialog';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { useAnnotation } from '@/providers/AnnotationContextProvider';
import { useFormContext } from '@/providers/FormContextProvider';
import { encryptPdf } from '@/utils/pdfEncrypt';
import { applyFormValues } from '@/utils/applyFormValues';
import { isTextAnnotation } from '@/annotations';
import {
  collectCodepoints,
  subsetEmbeddedFont,
  textNeedsEmbeddedFont,
} from '@/utils/fontEmbedding';

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
  const { commitAnnotationsToPdfium, annotationStack } = useAnnotation();
  const { getFormValuesSnapshot } = useFormContext();

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

        const rollbackBytes = controller.exportPdfBytes();
        let shouldRollbackController = false;
        let embeddedFontPtr = 0;

        try {
          // Non-Latin (e.g. CJK) added text can't render with the base-14
          // Helvetica, so embed a subsetted font for those glyphs. Pure-Latin
          // text keeps the lighter standard-font path.
          const overlayText = annotationStack
            .filter(isTextAnnotation)
            .filter((a) => a.source === 'overlay')
            .map((a) => a.content);
          if (overlayText.some(textNeedsEmbeddedFont)) {
            try {
              const subset = await subsetEmbeddedFont(collectCodepoints(overlayText));
              embeddedFontPtr = controller.loadEmbeddedFont(subset);
            } catch (fontError) {
              // Non-fatal: fall back to the standard font (CJK may be blank).
              console.error('Failed to prepare embedded font for added text:', fontError);
            }
          }

          // Apply pending overlay annotations to PDFium only for this export.
          // React working state remains undoable; the controller is restored
          // after bytes are produced.
          shouldRollbackController = true;
          shouldRollbackController = commitAnnotationsToPdfium({ embeddedFontPtr });

          // Export the PDF bytes
          let pdfBytes = controller.exportPdfBytes();

          // Ensure form values (especially radio groups) are persisted for external viewers.
          const formValues = getFormValuesSnapshot();
          if (formValues.length > 0) {
            pdfBytes = await applyFormValues(pdfBytes, formValues);
          }

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
          // Microtask-revoke: the browser has begun the download by the time
          // `.click()` returns. Avoids both the early-revoke race and the
          // never-revoke leak that `setTimeout(..., 100)` was prone to.
          queueMicrotask(() => URL.revokeObjectURL(url));
        } finally {
          // Release the embedded font while its document is still loaded
          // (the rollback below replaces the document entirely).
          if (embeddedFontPtr) controller.closeFont(embeddedFontPtr);
          if (shouldRollbackController) {
            const rollbackFile = new File([new Uint8Array(rollbackBytes)], fileName, {
              type: 'application/pdf',
            });
            await controller.loadFile(rollbackFile);
          }
        }

        // Close the dialog
        setIsDialogOpen(false);
      } catch (error) {
        console.error('Failed to download PDF:', error);
        alert('Failed to download PDF. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    },
    [controller, fileName, commitAnnotationsToPdfium, getFormValuesSnapshot, annotationStack],
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
