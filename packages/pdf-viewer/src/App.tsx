import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { PdfEditor } from './components/PdfEditor';
import { ErrorBoundary } from './components/ErrorBoundary';
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
    <ErrorBoundary>
      <ThemeContextProvider>
        <PdfControllerContextProvider>
          <SidebarProvider style={{ '--sidebar-width': '20rem' } as CSSProperties}>
            <PdfEditor file={file!} />
          </SidebarProvider>
        </PdfControllerContextProvider>
      </ThemeContextProvider>
    </ErrorBoundary>
  );
}

export default App;
