import { lazy, Suspense, useEffect, useState } from 'react';

import { LandingPage } from './components/LandingPage';

const PdfEditorRoute = lazy(() =>
  import('./components/PdfEditorRoute').then((module) => ({
    default: module.PdfEditorRoute,
  })),
);

const ThirdPartyNoticesRoute = lazy(() =>
  import('./components/ThirdPartyNoticesRoute').then((module) => ({
    default: module.ThirdPartyNoticesRoute,
  })),
);

type AppRoute = 'app' | 'licenses';

function getAppRoute(): AppRoute {
  if (typeof window === 'undefined') return 'app';
  return window.location.hash === '#licenses' ? 'licenses' : 'app';
}

function AppLoadingFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex items-center gap-3" role="status" aria-live="polite">
        <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </div>
  );
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
      <Suspense fallback={<AppLoadingFallback label="Opening notices..." />}>
        <ThirdPartyNoticesRoute onBack={onCloseLicenses} />
      </Suspense>
    );
  }

  return !isFileOpened ? (
    <LandingPage onFileSelect={onFileSelected} />
  ) : (
    <Suspense fallback={<AppLoadingFallback label="Opening document..." />}>
      <PdfEditorRoute file={file!} />
    </Suspense>
  );
}

export default App;
