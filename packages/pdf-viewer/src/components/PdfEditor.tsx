import React from 'react';
import { useButtons, useRightButtons } from '../utils/getButtons';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { AnnotationContextProvider } from '../providers/AnnotationContextProvider';
import { Viewer } from './Viewer/Viewer';
import { SidebarInset } from '@pdfviewer/ui/components/sidebar';
import { AppSidebar } from './SideBar/SideBar';
import { Header } from './Header/Header';
import { PdfStateContextProvider } from '@/providers/PdfStateContextProvider';

export interface IPdfEditorProps {
  file: File;
}

export const PdfEditor: React.FC<IPdfEditorProps> = ({ file }) => {
  const buttons = useButtons();
  const rightButtons = useRightButtons();
  const { controller } = usePdfController();
  const [isFileLoaded, setIsFileLoaded] = React.useState(false);
  const [pageCount, setPageCount] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const loadRunIdRef = React.useRef(0);

  React.useEffect(() => {
    const abortController = new AbortController();
    const runId = ++loadRunIdRef.current;

    // reset UI state for a new load
    setIsFileLoaded(false);
    setPageCount(0);
    setLoadError(null);

    const loadPdf = async () => {
      try {
        await controller.loadFile(file, { signal: abortController.signal });
        if (!abortController.signal.aborted && runId === loadRunIdRef.current) {
          setPageCount(controller.getPageCount());
          setIsFileLoaded(true);
        }
      } catch (error) {
        if (!abortController.signal.aborted && runId === loadRunIdRef.current) {
          const message = error instanceof Error ? error.message : 'Failed to load PDF';
          setLoadError(message);
          console.error('PDF load error:', error);
        }
      }
    };
    void loadPdf();
    return () => {
      abortController.abort();
    };
  }, [controller, file]);

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
    <PdfStateContextProvider>
      <AnnotationContextProvider>
        <AppSidebar />
        <SidebarInset className="bg-[#e2e8f061]">
          <Header fileName={file.name} centerButtons={buttons} rightButtons={rightButtons} />
          {renderContent()}
        </SidebarInset>
      </AnnotationContextProvider>
    </PdfStateContextProvider>
  );
};
