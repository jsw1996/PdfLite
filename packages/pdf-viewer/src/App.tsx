import { useEffect, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { PdfEditor } from './components/PdfEditor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SidebarProvider } from '@pdfviewer/ui/components/sidebar';
import type { CSSProperties } from 'react';
import { PdfControllerContextProvider } from './providers/PdfControllerContextProvider';
import { ThemeContextProvider } from './providers/ThemeContextProvider';
import { ThirdPartyNoticesPage } from './components/ThirdPartyNoticesPage';

type AppRoute = 'app' | 'licenses';

function getAppRoute(): AppRoute {
  if (typeof window === 'undefined') return 'app';
  return window.location.hash === '#licenses' ? 'licenses' : 'app';
}

function App() {
  const [route, setRoute] = useState<AppRoute>(getAppRoute);
  const [isFileOpened, setIsFileOpened] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const handleHashChange = () => setRoute(getAppRoute());

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const onFileSelected = (file: File) => {
    setFile(file);
    setIsFileOpened(true);
  };

  const onCloseLicenses = () => {
    setRoute('app');
    if (window.location.hash === '#licenses') {
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  };

  if (route === 'licenses') {
    return (
      <ThemeContextProvider>
        <ThirdPartyNoticesPage onBack={onCloseLicenses} />
      </ThemeContextProvider>
    );
  }

  return !isFileOpened ? (
    <LandingPage onFileSelect={onFileSelected} />
  ) : (
    <ErrorBoundary>
      <ThemeContextProvider>
        <PdfControllerContextProvider>
          <SidebarProvider
            defaultOpen={false}
            style={{ '--sidebar-width': '16rem' } as CSSProperties}
          >
            <PdfEditor file={file!} />
          </SidebarProvider>
        </PdfControllerContextProvider>
      </ThemeContextProvider>
    </ErrorBoundary>
  );
}

export default App;
