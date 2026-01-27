import { Input } from '@pdfviewer/ui/components/input';
import { Button } from '@pdfviewer/ui/components/button';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Separator } from '@pdfviewer/ui/components/separator';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import type { ISearchResult } from '@pdfviewer/controller';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { useId } from 'react';
import { SEARCH_CONFIG } from '@/utils/config';

export const SearchBar = () => {
  const scale = usePdfState().scale;
  const [value, setValue] = useState<string>('');
  const [debouncedValue, setDebouncedValue] = useState<string>('');
  const { controller, goToPage } = usePdfController();
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Debounce the search value
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value.trim());
    }, SEARCH_CONFIG.SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const matches: ISearchResult[] = useMemo(() => {
    if (!debouncedValue) return [];
    return controller.searchText(debouncedValue, { scale });
  }, [controller, debouncedValue, scale]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const searchBoxId = useId();
  // CSS-escape the useId() result for use in querySelector
  const escapedSearchBoxId = useMemo(() => CSS.escape(searchBoxId), [searchBoxId]);

  // Handler to update value and reset index
  const handleValueChange = useCallback((newValue: string) => {
    setValue(newValue);
    setCurrentIndex(0);
  }, []);

  const drawHighlight = useCallback(
    (index: number) => {
      // Clean up previous highlight
      if (highlightRef.current) {
        highlightRef.current.remove();
        highlightRef.current = null;
      }

      if (matches.length === 0 || index < 0 || index >= matches.length) return;
      const match: ISearchResult = matches[index];
      if (!match.rects || match.rects.length === 0) return;

      // Scroll to page first - this triggers viewport observer and rendering
      goToPage(match.pageIndex, {
        scrollIntoView: true,
        scrollIntoPreview: true,
      });

      // Helper function to draw the highlight with retry logic
      const performHighlight = (retryCount = 0) => {
        const maxRetries = 20; // Max 20 retries (~1 second)
        const retryDelay = 50; // 50ms between retries

        // Calculate bounding rect from all match rects
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

        // Try to find the text layer (waits for page to render)
        const pageContainer = document.querySelector(
          `[data-slot="viewer-page-container-${match.pageIndex}"] .text-layer`,
        );

        if (pageContainer) {
          // Found it! Create and append highlight
          const highlightDiv = document.createElement('div');
          highlightDiv.style.position = 'absolute';
          highlightDiv.style.left = `${rect.left}px`;
          highlightDiv.style.top = `${rect.top}px`;
          highlightDiv.style.width = `${rect.width}px`;
          highlightDiv.style.height = `${rect.height}px`;
          highlightDiv.style.backgroundColor = SEARCH_CONFIG.HIGHLIGHT_COLOR;
          highlightDiv.style.pointerEvents = 'none';
          highlightDiv.className = 'search-highlight';

          pageContainer.appendChild(highlightDiv);
          highlightRef.current = highlightDiv;

          // Scroll highlight into view
          highlightDiv.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center',
          });
        } else if (retryCount < maxRetries) {
          // Text layer not ready yet, retry after delay
          setTimeout(() => performHighlight(retryCount + 1), retryDelay);
        }
      };

      // Wait for page to scroll and render, then highlight
      setTimeout(() => performHighlight(), 100);
    },
    [matches, goToPage],
  );

  // Cleanup highlight on unmount or when value is cleared
  useEffect(() => {
    return () => {
      if (highlightRef.current) {
        highlightRef.current.remove();
        highlightRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        const input = document.querySelector(`#${escapedSearchBoxId}`);
        if (input instanceof HTMLInputElement) {
          input.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [escapedSearchBoxId]);

  // Draw highlight when index changes or when matches change
  useEffect(() => {
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
          placeholder="Find in document..."
          value={value}
          onChange={(e) => handleValueChange(e.target.value)}
          className="pr-28 rounded-xl bg-secondary/50 border border-border dark:border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 placeholder:text-muted-foreground/60"
          id={searchBoxId}
        />
        {value && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-muted-foreground">
            <Separator orientation="vertical" className="mx-2 !h-5 bg-border/50" />
            <span className="px-1 text-xs font-medium tabular-nums">
              {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : '0/0'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors duration-200"
              onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : matches.length - 1))}
              disabled={matches.length === 0}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors duration-200"
              onClick={() => setCurrentIndex((prev) => (prev < matches.length - 1 ? prev + 1 : 0))}
              disabled={matches.length === 0}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </span>
        )}
      </div>
    </div>
  );
};
