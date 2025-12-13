import React from 'react';
import { getButtons } from '../utils/getButtons';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { Viewer } from './Viewer/Viewer';
import { SidebarInset } from '@pdfviewer/ui/components/sidebar';
import { AppSidebar } from './SideBar/SideBar';
import { Header } from './Header/Header';

export interface IPdfEditorProps {
  file: File;
}

export const PdfEditor: React.FC<IPdfEditorProps> = ({ file }) => {
  const buttons = getButtons();
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
    <>
      <AppSidebar />
      <SidebarInset className="bg-zinc-300">
        {/* <div className="sticky top-0 z-10 bg-white py-2 border-b-1 border-gray-200"> */}
        <Header fileName={file.name} buttons={buttons} />
        {/* </div> */}
        {!isFileLoaded ? <div>Loading PDF...</div> : <Viewer pageCount={pageCount} scale={1.5} />}
      </SidebarInset>
    </>
  );
};
