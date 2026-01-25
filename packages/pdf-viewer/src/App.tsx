import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { PdfEditor } from './components/PdfEditor';
import { SidebarProvider } from '@pdfviewer/ui/components/sidebar';
import type { CSSProperties } from 'react';
import { PdfControllerContextProvider } from './providers/PdfControllerContextProvider';

function App() {
  const [isFileOpened, setIsFileOpened] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);

  const onFileSelected = (file: File) => {
    console.log('File selected:', file);
    setFile(file);
    setIsFileOpened(true);
  };

  return !isFileOpened ? (
    <LandingPage onFileSelect={onFileSelected} />
  ) : (
    <PdfControllerContextProvider>
      <SidebarProvider style={{ '--sidebar-width': '12rem' } as CSSProperties}>
        <PdfEditor file={file!} />
      </SidebarProvider>
    </PdfControllerContextProvider>
  );
}

export default App;
