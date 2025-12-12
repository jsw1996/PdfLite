import React from 'react';
import { ToolBar } from './Toolbar/Toolbar';
import { getButtons } from '../utils/getButtons';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { CanvasLayer } from './CanvasLayer/CanvasLayer';
import { SidebarInset } from '@pdfviewer/ui/components/sidebar';
import { AppSidebar } from './SideBar/SideBar';

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

      <SidebarInset>
        <ToolBar buttons={buttons} />
        {!isFileLoaded ? <div>Loading PDF...</div> : <CanvasLayer pageIndex={0} scale={1.5} />}
      </SidebarInset>
    </>
  );
};
