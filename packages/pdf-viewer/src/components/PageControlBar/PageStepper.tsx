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
    <div className="flex items-center gap-1">
      <TooltipButton
        title="Previous Page"
        variant="ghost"
        onClick={onPrev}
        disabled={!canPrev}
        className="w-8 h-8 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors duration-200 disabled:opacity-40"
      >
        <ChevronLeft className="w-4 h-4" />
      </TooltipButton>
      <div className="font-medium flex items-center gap-1.5 text-sm">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
          }}
          className="w-10 text-center outline-none border border-border/50 rounded-lg px-1.5 py-1 bg-secondary/50 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
          inputMode="numeric"
        />
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{pageCount}</span>
      </div>
      <TooltipButton
        title="Next Page"
        variant="ghost"
        onClick={onNext}
        disabled={!canNext}
        className="w-8 h-8 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors duration-200 disabled:opacity-40"
      >
        <ChevronRight className="w-4 h-4" />
      </TooltipButton>
    </div>
  );
};
