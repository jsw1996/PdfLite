import React, { useMemo } from 'react';

interface IPdfStateContext {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  scale: number;
  setScale: (scale: number) => void;
  rotation: number;
  setRotation: (rotation: number) => void;
}

const PdfStateContext = React.createContext<IPdfStateContext | null>(null);

export const PdfStateContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPage, setCurrentPage] = React.useState(0);
  const [scale, setScale] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(
    () => ({
      currentPage,
      setCurrentPage,
      scale,
      setScale,
      rotation,
      setRotation,
    }),
    [currentPage, scale, rotation],
  );

  return <PdfStateContext.Provider value={value}>{children}</PdfStateContext.Provider>;
};

export const usePdfState = (): IPdfStateContext => {
  const ctx = React.useContext(PdfStateContext);
  if (!ctx) throw new Error('usePdfState must be used within PdfStateContextProvider');
  return ctx;
};
