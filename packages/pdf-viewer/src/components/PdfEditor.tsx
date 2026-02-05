import React from 'react';
import { useButtons, useRightButtons } from '../utils/getButtons';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { AnnotationContextProvider } from '../providers/AnnotationContextProvider';
import { DownloadDialogProvider } from '../providers/DownloadDialogProvider';
import { Viewer } from './Viewer/Viewer';
import { SidebarInset } from '@pdfviewer/ui/components/sidebar';
import { AppSidebar } from './SideBar/SideBar';
import { Header } from './Header/Header';
import { PdfStateContextProvider } from '@/providers/PdfStateContextProvider';
import { OpenPasswordDialog } from '@/components/PasswordDialog/OpenPasswordDialog';
import { PdfPasswordError } from '@pdfviewer/controller';
import { FormContextProvider } from '@/providers/FormContextProvider';

export interface IPdfEditorProps {
  file: File;
}

/**
 * Inner component that uses the download dialog context.
 * Separated to ensure hooks are called within the DownloadDialogProvider.
 */
const PdfEditorContent: React.FC<{
  file: File;
  isFileLoaded: boolean;
  pageCount: number;
  loadError: string | null;
}> = ({ file, isFileLoaded, pageCount, loadError }) => {
  const buttons = useButtons();
  const rightButtons = useRightButtons();

  const renderContent = () => {
    if (loadError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="text-red-600 font-semibold mb-2">Error loading PDF</div>
          <div className="text-slate-600 text-sm">{loadError}</div>
        </div>
      );
    }
    if (!isFileLoaded) {
      return <div className="flex items-center justify-center h-full">Loading PDF...</div>;
    }
    return <Viewer pageCount={pageCount} />;
  };

  return (
    <>
      <AppSidebar />
      <SidebarInset className="bg-[#e2e8f061] h-svh min-h-0 overflow-hidden">
        <Header fileName={file.name} centerButtons={buttons} rightButtons={rightButtons} />
        <div className="flex-1 min-h-0">{renderContent()}</div>
      </SidebarInset>
    </>
  );
};

export const PdfEditor: React.FC<IPdfEditorProps> = ({ file }) => {
  const { controller } = usePdfController();
  const [isFileLoaded, setIsFileLoaded] = React.useState(false);
  const [pageCount, setPageCount] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const loadRunIdRef = React.useRef(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const attemptLoad = React.useCallback(
    async (password?: string) => {
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const runId = ++loadRunIdRef.current;

      setIsLoading(true);
      setIsFileLoaded(false);
      setPageCount(0);
      setLoadError(null);

      try {
        await controller.loadFile(file, { signal: abortController.signal, password });
        if (!abortController.signal.aborted && runId === loadRunIdRef.current) {
          setPageCount(controller.getPageCount());
          setIsFileLoaded(true);
          setIsPasswordDialogOpen(false);
          setPasswordError(null);
        }
      } catch (error) {
        if (!abortController.signal.aborted && runId === loadRunIdRef.current) {
          const isPasswordError =
            error instanceof PdfPasswordError ||
            (typeof error === 'object' && error !== null && 'isPasswordError' in error);

          if (isPasswordError) {
            const message =
              error instanceof Error ? error.message : 'Password required to open this PDF.';
            setPasswordError(message);
            setIsPasswordDialogOpen(true);
          } else {
            const message = error instanceof Error ? error.message : 'Failed to load PDF';
            setLoadError(message);
            console.error('PDF load error:', error);
          }
        }
      } finally {
        if (!abortController.signal.aborted && runId === loadRunIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [controller, file],
  );

  React.useEffect(() => {
    void attemptLoad();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [attemptLoad]);

  const handlePasswordDialogOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) {
        setIsPasswordDialogOpen(true);
        return;
      }
      setIsPasswordDialogOpen(false);
      if (!isFileLoaded) {
        setLoadError(passwordError ?? 'Password required to open this PDF.');
      }
      setPasswordError(null);
    },
    [isFileLoaded, passwordError],
  );

  const handlePasswordSubmit = React.useCallback(
    (password: string) => {
      void attemptLoad(password);
    },
    [attemptLoad],
  );

  const handlePasswordErrorClear = React.useCallback(() => {
    setPasswordError(null);
  }, []);

  return (
    <PdfStateContextProvider>
      <FormContextProvider>
        <AnnotationContextProvider>
          <DownloadDialogProvider fileName={file.name}>
            <PdfEditorContent
              file={file}
              isFileLoaded={isFileLoaded}
              pageCount={pageCount}
              loadError={loadError}
            />
            <OpenPasswordDialog
              open={isPasswordDialogOpen}
              onOpenChange={handlePasswordDialogOpenChange}
              onSubmit={handlePasswordSubmit}
              error={passwordError}
              isProcessing={isLoading}
              onClearError={handlePasswordErrorClear}
            />
          </DownloadDialogProvider>
        </AnnotationContextProvider>
      </FormContextProvider>
    </PdfStateContextProvider>
  );
};
