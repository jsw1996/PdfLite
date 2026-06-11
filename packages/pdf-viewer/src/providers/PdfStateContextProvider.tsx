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
// Combined Provider - wraps scale + rotation contexts
//
// NOTE: current-page tracking lives in PdfControllerContextProvider
// (usePdfController().currentPage / goToPage), which is the single source of
// truth. Do not reintroduce page state here.
// ============================================================================
export const PdfStateContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scale, setScaleState] = React.useState(1);
  const [rotation, setRotationState] = React.useState(0);

  // Stable setter functions via useCallback
  const setScale = useCallback((s: number) => setScaleState(s), []);
  const setRotation = useCallback((r: number) => setRotationState(r), []);

  // Memoize each context value separately to prevent unnecessary re-renders
  const scaleValue = useMemo<IPdfScaleContext>(() => ({ scale, setScale }), [scale, setScale]);
  const rotationValue = useMemo<IPdfRotationContext>(
    () => ({ rotation, setRotation }),
    [rotation, setRotation],
  );

  return (
    <PdfScaleContext.Provider value={scaleValue}>
      <PdfRotationContext.Provider value={rotationValue}>{children}</PdfRotationContext.Provider>
    </PdfScaleContext.Provider>
  );
};

// ============================================================================
// Legacy aggregate hook for backwards compatibility.
// Components should migrate to the specific hooks for better performance:
// - usePdfScale() - for scale only
// - usePdfRotation() - for rotation only
// ============================================================================
interface IPdfStateContext {
  scale: number;
  setScale: (scale: number) => void;
  rotation: number;
  setRotation: (rotation: number) => void;
}

export const usePdfState = (): IPdfStateContext => {
  const { scale, setScale } = usePdfScale();
  const { rotation, setRotation } = usePdfRotation();

  return { scale, setScale, rotation, setRotation };
};
