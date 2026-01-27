import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { PdfEditor } from './components/PdfEditor';
import { SidebarProvider } from '@pdfviewer/ui/components/sidebar';
import type { CSSProperties } from 'react';
import { PdfControllerContextProvider } from './providers/PdfControllerContextProvider';
import { ThemeContextProvider } from './providers/ThemeContextProvider';

function App() {
  const [isFileOpened, setIsFileOpened] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);

  const onFileSelected = (file: File) => {
    setFile(file);
    setIsFileOpened(true);
  };

  return !isFileOpened ? (
    <LandingPage onFileSelect={onFileSelected} />
  ) : (
    <ThemeContextProvider>
      <PdfControllerContextProvider>
        <SidebarProvider style={{ '--sidebar-width': '12rem' } as CSSProperties}>
          <PdfEditor file={file!} />
        </SidebarProvider>
      </PdfControllerContextProvider>
    </ThemeContextProvider>
  );
}

export default App;
