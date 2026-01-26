import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TooltipButton } from '@pdfviewer/ui/components/tooltipButton';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePdfController } from '@/providers/PdfControllerContextProvider';

export interface IPageStepperProps {
  pageCount: number;
  onJumpToPage: (pageIndex: number) => void;
}

export const PageStepper: React.FC<IPageStepperProps> = ({ pageCount, onJumpToPage }) => {
  const { currentPage } = usePdfController();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(String(currentPage + 1));
  }, [currentPage]);

  const canPrev = currentPage > 0;
  const canNext = currentPage + 1 < pageCount;

  const clampPageIndex = useCallback(
    (idx: number) => Math.min(pageCount - 1, Math.max(0, idx)),
    [pageCount],
  );

  const onPrev = useCallback(() => {
    if (!canPrev) return;
    onJumpToPage(clampPageIndex(currentPage - 1));
  }, [canPrev, clampPageIndex, currentPage, onJumpToPage]);

  const onNext = useCallback(() => {
    if (!canNext) return;
    onJumpToPage(clampPageIndex(currentPage + 1));
  }, [canNext, clampPageIndex, currentPage, onJumpToPage]);

  const parsedDraft = useMemo(() => {
    const n = Number(draft);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }, [draft]);

  const commitDraft = useCallback(() => {
    if (!parsedDraft) return;
    onJumpToPage(clampPageIndex(parsedDraft - 1));
  }, [clampPageIndex, onJumpToPage, parsedDraft]);

  return (
    <div className="flex m-0">
      <TooltipButton title="Previous Page" variant="ghost" onClick={onPrev} disabled={!canPrev}>
        <ChevronLeft />
      </TooltipButton>
      <div className="font-medium self-center flex items-center">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
          }}
          className="w-10 text-center outline-none border border-border rounded px-1 py-0.5 bg-background text-foreground"
          inputMode="numeric"
        />
        <span className="mx-1">/</span>
        <span>{pageCount}</span>
      </div>
      <TooltipButton title="Next Page" variant="ghost" onClick={onNext} disabled={!canNext}>
        <ChevronRight />
      </TooltipButton>
    </div>
  );
};
