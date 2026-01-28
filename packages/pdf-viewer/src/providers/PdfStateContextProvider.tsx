import React, { useCallback, useMemo } from 'react';

// ============================================================================
// Scale Context - for zoom level (isolated to prevent cascading re-renders)
// ============================================================================
interface IPdfScaleContext {
  scale: number;
  setScale: (scale: number) => void;
}

const PdfScaleContext = React.createContext<IPdfScaleContext | null>(null);

export const usePdfScale = (): IPdfScaleContext => {
  const ctx = React.useContext(PdfScaleContext);
  if (!ctx) throw new Error('usePdfScale must be used within PdfStateContextProvider');
  return ctx;
};

// ============================================================================
// Page Context - for current page tracking (isolated)
// ============================================================================
interface IPdfPageContext {
  currentPage: number;
  setCurrentPage: (page: number) => void;
}

const PdfPageContext = React.createContext<IPdfPageContext | null>(null);

export const usePdfPage = (): IPdfPageContext => {
  const ctx = React.useContext(PdfPageContext);
  if (!ctx) throw new Error('usePdfPage must be used within PdfStateContextProvider');
  return ctx;
};

// ============================================================================
// Rotation Context - for page rotation (isolated)
// ============================================================================
interface IPdfRotationContext {
  rotation: number;
  setRotation: (rotation: number) => void;
}

const PdfRotationContext = React.createContext<IPdfRotationContext | null>(null);

export const usePdfRotation = (): IPdfRotationContext => {
  const ctx = React.useContext(PdfRotationContext);
  if (!ctx) throw new Error('usePdfRotation must be used within PdfStateContextProvider');
  return ctx;
};

// ============================================================================
// Combined Provider - wraps all three contexts
// ============================================================================
export const PdfStateContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPage, setCurrentPageState] = React.useState(0);
  const [scale, setScaleState] = React.useState(1);
  const [rotation, setRotationState] = React.useState(0);

  // Stable setter functions via useCallback
  const setCurrentPage = useCallback((page: number) => setCurrentPageState(page), []);
  const setScale = useCallback((s: number) => setScaleState(s), []);
  const setRotation = useCallback((r: number) => setRotationState(r), []);

  // Memoize each context value separately to prevent unnecessary re-renders
  const scaleValue = useMemo<IPdfScaleContext>(() => ({ scale, setScale }), [scale, setScale]);
  const pageValue = useMemo<IPdfPageContext>(
    () => ({ currentPage, setCurrentPage }),
    [currentPage, setCurrentPage],
  );
  const rotationValue = useMemo<IPdfRotationContext>(
    () => ({ rotation, setRotation }),
    [rotation, setRotation],
  );

  return (
    <PdfScaleContext.Provider value={scaleValue}>
      <PdfPageContext.Provider value={pageValue}>
        <PdfRotationContext.Provider value={rotationValue}>{children}</PdfRotationContext.Provider>
      </PdfPageContext.Provider>
    </PdfScaleContext.Provider>
  );
};

// ============================================================================
// Legacy hook for backwards compatibility
// Components should migrate to specific hooks for better performance:
// - usePdfScale() - for scale only
// - usePdfPage() - for currentPage only
// - usePdfRotation() - for rotation only
// ============================================================================
interface IPdfStateContext {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  scale: number;
  setScale: (scale: number) => void;
  rotation: number;
  setRotation: (rotation: number) => void;
}

export const usePdfState = (): IPdfStateContext => {
  const { scale, setScale } = usePdfScale();
  const { currentPage, setCurrentPage } = usePdfPage();
  const { rotation, setRotation } = usePdfRotation();

  return { currentPage, setCurrentPage, scale, setScale, rotation, setRotation };
};
