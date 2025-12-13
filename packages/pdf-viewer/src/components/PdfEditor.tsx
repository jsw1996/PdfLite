import React from 'react';
import { getButtons } from '../utils/getButtons';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { CanvasLayer } from './CanvasLayer/CanvasLayer';
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
  const loadRunIdRef = React.useRef(0);

  React.useEffect(() => {
    const abortController = new AbortController();
    const runId = ++loadRunIdRef.current;

    // reset UI state for a new load
    setIsFileLoaded(false);

    const loadPdf = async () => {
      await controller.loadFile(file, { signal: abortController.signal });
      if (!abortController.signal.aborted && runId === loadRunIdRef.current) {
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
      <AppSidebar
        currentPage={1}
        onPageClick={(page) => {
          console.log(page);
        }}
      />

      <SidebarInset className="bg-zinc-300">
        {/* <div className="sticky top-0 z-10 bg-white py-2 border-b-1 border-gray-200"> */}
        <Header fileName={file.name} buttons={buttons} />
        {/* </div> */}
        {!isFileLoaded ? <div>Loading PDF...</div> : <CanvasLayer pageIndex={0} scale={1.5} />}
      </SidebarInset>
    </>
  );
};
