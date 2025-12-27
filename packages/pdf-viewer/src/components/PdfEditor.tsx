import React from 'react';
import { getButtons, getRightButtons } from '../utils/getButtons';
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
  const buttons = getButtons();
  const rightButtons = getRightButtons();
  const { controller } = usePdfController();
  const [isFileLoaded, setIsFileLoaded] = React.useState(false);
  const [pageCount, setPageCount] = React.useState(0);
  const loadRunIdRef = React.useRef(0);

  React.useEffect(() => {
    const abortController = new AbortController();
    const runId = ++loadRunIdRef.current;

    // reset UI state for a new load
    setIsFileLoaded(false);
    setPageCount(0);

    const loadPdf = async () => {
      await controller.loadFile(file, { signal: abortController.signal });
      if (!abortController.signal.aborted && runId === loadRunIdRef.current) {
        setPageCount(controller.getPageCount());
        setIsFileLoaded(true);
      }
    };
    void loadPdf();
    return () => {
      abortController.abort();
    };
  }, [controller, file]);

  return (
    <PdfStateContextProvider>
      <AnnotationContextProvider>
        <AppSidebar />
        <SidebarInset className="bg-[#e2e8f061]">
          <Header fileName={file.name} centerButtons={buttons} rightButtons={rightButtons} />
          {!isFileLoaded ? <div>Loading PDF...</div> : <Viewer pageCount={pageCount} />}
        </SidebarInset>
      </AnnotationContextProvider>
    </PdfStateContextProvider>
  );
};
