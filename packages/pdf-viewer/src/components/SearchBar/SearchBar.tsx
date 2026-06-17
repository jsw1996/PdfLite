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
  // Tracks the pending highlight-retry timer so a new navigation cancels any
  // in-flight retry chain from a previous index (avoids overlapping draws).
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Page-space (scale = 1) bounding box of the currently drawn match. Lets a
  // zoom-only reposition update the existing highlight's geometry in place,
  // without re-running the navigation/scroll path.
  const currentMatchBoxRef = useRef<{
    minLeft: number;
    minTop: number;
    maxRight: number;
    maxBottom: number;
  } | null>(null);
  // Scale read through a ref so drawHighlight stays referentially stable across
  // zoom. If drawHighlight depended on `scale`, the navigation effect would
  // re-fire on every zoom tick and re-scroll the page (the leftward shift).
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Debounce the search value
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value.trim());
    }, SEARCH_CONFIG.SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  // Search in page-space coordinates (scale = 1) so the expensive full-document
  // scan only re-runs when the query changes, not on every zoom. The resulting
  // rects are scaled to the current zoom level locally when drawing the highlight.
  const matches: ISearchResult[] = useMemo(() => {
    if (!debouncedValue) return [];
    return controller.searchText(debouncedValue);
  }, [controller, debouncedValue]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Clamp against the latest results: navigation can advance currentIndex past a
  // stale `matches` array before a new scan lands. Derived (not stored) so we
  // don't setState inside an effect.
  const safeIndex = matches.length === 0 ? 0 : Math.min(currentIndex, matches.length - 1);
  const searchBoxId = useId();
  // CSS-escape the useId() result for use in querySelector
  const escapedSearchBoxId = useMemo(() => CSS.escape(searchBoxId), [searchBoxId]);

  // Handler to update value and reset index
  const handleValueChange = useCallback((newValue: string) => {
    setValue(newValue);
    setCurrentIndex(0);
  }, []);

  const goToNextMatch = useCallback(() => {
    setCurrentIndex(safeIndex < matches.length - 1 ? safeIndex + 1 : 0);
  }, [safeIndex, matches.length]);

  const goToPrevMatch = useCallback(() => {
    setCurrentIndex(safeIndex > 0 ? safeIndex - 1 : matches.length - 1);
  }, [safeIndex, matches.length]);

  const drawHighlight = useCallback(
    (index: number) => {
      // Cancel any in-flight retry chain from a previous navigation.
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
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

        // Remember the page-space box so a later zoom can reposition this same
        // highlight in place (see the scale-reposition effect) instead of
        // re-running navigation, which would re-scroll the page sideways.
        currentMatchBoxRef.current = { minLeft, minTop, maxRight, maxBottom };

        // Rects are in page-space (scale = 1); scale to the current zoom level.
        const currentScale = scaleRef.current;
        const rect = {
          left: minLeft * currentScale,
          top: minTop * currentScale,
          width: (maxRight - minLeft) * currentScale,
          height: (maxBottom - minTop) * currentScale,
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

          // Scroll highlight into view. Use inline:'nearest' (not 'center') so
          // the viewer's horizontal scroll is only nudged when the match is
          // actually off-screen horizontally. inline:'center' would re-center
          // every match, yanking the whole page (canvas + text) sideways away
          // from its mx-auto resting position whenever zoomed wider than the
          // viewport — perceived as the text shifting left.
          highlightDiv.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest',
          });
        } else if (retryCount < maxRetries) {
          // Text layer not ready yet, retry after delay
          highlightTimerRef.current = setTimeout(
            () => performHighlight(retryCount + 1),
            retryDelay,
          );
        }
      };

      // Wait for page to scroll and render, then highlight
      highlightTimerRef.current = setTimeout(() => performHighlight(), 100);
    },
    [matches, goToPage],
  );

  // Cleanup highlight on unmount or when value is cleared
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
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

  // Draw + scroll when the match index changes or a new search lands. Crucially
  // this does NOT depend on `scale`: zoom must not re-run the navigation/scroll
  // path (that re-scrolling is what shifted the page sideways).
  useEffect(() => {
    drawHighlight(safeIndex);
  }, [safeIndex, drawHighlight]);

  // Zoom only: reposition the existing highlight in place. No scrollIntoView /
  // goToPage, so changing zoom never drags the page horizontally. The highlight
  // div lives inside the page-space text layer (origin at top-left), so scaling
  // its page-space box by the new zoom keeps it aligned with the canvas.
  useEffect(() => {
    const div = highlightRef.current;
    const box = currentMatchBoxRef.current;
    if (!div || !box) return;
    div.style.left = `${box.minLeft * scale}px`;
    div.style.top = `${box.minTop * scale}px`;
    div.style.width = `${(box.maxRight - box.minLeft) * scale}px`;
    div.style.height = `${(box.maxBottom - box.minTop) * scale}px`;
  }, [scale]);

  return (
    <div className="w-full max-w-xs space-y-2">
      <div className="relative w-full">
        <Input
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && e.shiftKey) {
              goToPrevMatch();
            } else if (e.key === 'Enter') {
              goToNextMatch();
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
            <Separator
              orientation="vertical"
              className="mx-2 !h-5 bg-border/50 dark:bg-foreground/25"
            />
            <span className="px-1 text-xs font-medium tabular-nums">
              {matches.length > 0 ? `${safeIndex + 1}/${matches.length}` : '0/0'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 rounded-lg hover:bg-primary/10 hover:text-primary-emphasis transition-colors duration-200"
              onClick={goToPrevMatch}
              disabled={matches.length === 0}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 rounded-lg hover:bg-primary/10 hover:text-primary-emphasis transition-colors duration-200"
              onClick={goToNextMatch}
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
