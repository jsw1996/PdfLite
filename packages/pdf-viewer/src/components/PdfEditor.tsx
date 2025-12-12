import React from 'react';
import { ToolBar } from './Toolbar/Toolbar';
import { getButtons } from '../utils/getButtons';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { CanvasLayer } from './CanvasLayer/CanvasLayer';

export interface IPdfEditorProps {
  file: File;
}

export const PdfEditor: React.FC<IPdfEditorProps> = ({ file }) => {
  const buttons = getButtons();
  const { controller } = usePdfController();
  const [isFileLoaded, setIsFileLoaded] = React.useState(false);

  React.useEffect(() => {
    const abortController = new AbortController();

    const loadPdf = async () => {
      await controller.loadFile(file);
      if (!abortController.signal.aborted) {
        setIsFileLoaded(true);
      }
    };
    void loadPdf();
    return () => {
      abortController.abort();
    };
  }, [controller, file]);

  return (
    <div>
      <ToolBar buttons={buttons} />
      {!isFileLoaded ? <div>Loading PDF...</div> : <CanvasLayer pageIndex={0} scale={1.5} />}
    </div>
  );
};
