import type { CSSProperties } from 'react';

import { SidebarProvider } from '@pdfviewer/ui/components/sidebar';

import { ErrorBoundary } from './ErrorBoundary';
import { PdfEditor } from './PdfEditor';
import { PdfControllerContextProvider } from '../providers/PdfControllerContextProvider';
import { ThemeContextProvider } from '../providers/ThemeContextProvider';

interface IPdfEditorRouteProps {
  file: File;
}

export function PdfEditorRoute({ file }: IPdfEditorRouteProps) {
  return (
    <ErrorBoundary>
      <ThemeContextProvider>
        <PdfControllerContextProvider>
          <SidebarProvider
            defaultOpen={false}
            style={{ '--sidebar-width': '16rem' } as CSSProperties}
          >
            <PdfEditor file={file} />
          </SidebarProvider>
        </PdfControllerContextProvider>
      </ThemeContextProvider>
    </ErrorBoundary>
  );
}
