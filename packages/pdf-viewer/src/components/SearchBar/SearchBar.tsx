import { Input } from '@pdfviewer/ui/components/input';
import { Button } from '@pdfviewer/ui/components/button';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Separator } from '@pdfviewer/ui/components/separator';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import type { ISearchResult } from '@pdfviewer/controller';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { useId } from 'react';

export const SearchBar = () => {
  const scale = usePdfState().scale;
  const [value, setValue] = useState<string>('');
  const pdfController = usePdfController();
  const matches: ISearchResult[] = useMemo(() => {
    if (!value.trim()) return [];
    return pdfController.controller.searchText(value, { scale });
  }, [pdfController.controller, value, scale]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const searchBoxId = useId();

  // Handler to update value and reset index
  const handleValueChange = useCallback((newValue: string) => {
    setValue(newValue);
    setCurrentIndex(0);
  }, []);

  const drawHighlight = useCallback(
    (index: number) => {
      if (matches.length === 0 || index < 0 || index >= matches.length) return;
      const match: ISearchResult = matches[index];
      if (!match.rects || match.rects.length === 0) return;

      let minLeft = match.rects[0].left;
      let minTop = match.rects[0].top;
      let maxRight = match.rects[0].left + match.rects[0].width;
      let maxBottom = match.rects[0].top + match.rects[0].height;

      for (let i = 1; i < match.rects.length; i++) {
        minLeft = Math.min(minLeft, match.rects[i].left);
        minTop = Math.min(minTop, match.rects[i].top);
        maxRight = Math.max(maxRight, match.rects[i].left + match.rects[i].width);
        maxBottom = Math.max(maxBottom, match.rects[i].top + match.rects[i].height);
      }

      const rect = {
        left: minLeft,
        top: minTop,
        width: maxRight - minLeft,
        height: maxBottom - minTop,
      };
      // create the element
      const highlightDiv = document.createElement('div');
      highlightDiv.style.position = 'absolute';
      highlightDiv.style.left = `${rect.left}px`;
      highlightDiv.style.top = `${rect.top}px`;
      highlightDiv.style.width = `${rect.width}px`;
      highlightDiv.style.height = `${rect.height}px`;
      highlightDiv.style.backgroundColor = 'rgba(248, 196, 72, 0.4)';
      highlightDiv.style.pointerEvents = 'none';
      highlightDiv.className = 'search-highlight';
      // append to the page container
      const pageContainer = document.querySelector(
        `[data-slot="viewer-page-container-${match.pageIndex}"] .text-layer`,
      );
      if (pageContainer) {
        pageContainer.appendChild(highlightDiv);
        // scroll into view
        highlightDiv.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    },
    [matches],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        const input = document.querySelector(`#${searchBoxId}`) as HTMLInputElement | undefined;
        input?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchBoxId]);

  // Clear previous highlights and draw new one
  useEffect(() => {
    // Remove existing search highlights
    document.querySelectorAll('.search-highlight').forEach((el) => el.remove());
    drawHighlight(currentIndex);
  }, [currentIndex, drawHighlight, scale]);

  return (
    <div className="w-full max-w-xs space-y-2">
      <div className="relative">
        <Input
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && e.shiftKey) {
              setCurrentIndex((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
            } else if (e.key === 'Enter') {
              setCurrentIndex((prev) => (prev < matches.length - 1 ? prev + 1 : 0));
            }
          }}
          type="text"
          placeholder="Find in document"
          value={value}
          onChange={(e) => handleValueChange(e.target.value)}
          className="pr-9"
          id={searchBoxId}
        />
        {value && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500">
            <Separator orientation="vertical" className="mx-2 !h-6" />
            <span className="px-1">
              {matches.length > 0 ? `${currentIndex + 1} / ${matches.length}` : '0 / 0'}
            </span>
            <Button
              variant="ghost"
              className="px-[2px]!"
              onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : matches.length - 1))}
              disabled={matches.length === 0}
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              className="px-[2px]!"
              onClick={() => setCurrentIndex((prev) => (prev < matches.length - 1 ? prev + 1 : 0))}
              disabled={matches.length === 0}
            >
              <ChevronDown />
            </Button>
          </span>
        )}
      </div>
    </div>
  );
};
