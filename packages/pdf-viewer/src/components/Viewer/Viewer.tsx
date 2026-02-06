// Viewer.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ViewerPage } from './ViewerPage';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { PageControlBar } from '../PageControlBar/PageControlBar';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { useUndo } from '../../hooks/useUndo';
import { useCurrentPageTracker } from '../../hooks/useCurrentPageTracker';
import { OBSERVER_CONFIG, VIEWER_CONFIG } from '@/utils/config';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const PAGE_GAP_PX = 16; // Matches previous mb-4 spacing on pages

interface IZoomAnchor {
  index: number;
  withinPageUnscaled: number;
}

interface IPendingWheelAnchor {
  anchor: IZoomAnchor;
  pointerY: number;
  scale: number;
}

interface IPreviewIntent {
  pointerX: number;
  pointerY: number;
  scale: number;
}

export interface IViewerProps {
  /** Total number of pages in the PDF document */
  pageCount: number;
}

export const Viewer: React.FC<IViewerProps> = ({ pageCount }) => {
  const { goToPage, controller, registerScrollToIndex } = usePdfController();
  const { scale, setScale } = usePdfState();

  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);

  useUndo();

  const pageHeights = useMemo(() => {
    if (pageCount <= 0) return [];
    const heights = new Array<number>(pageCount);
    for (let i = 0; i < pageCount; i += 1) {
      const dim = controller.getPageDimension(i);
      heights[i] = dim.height;
    }
    return heights;
  }, [controller, pageCount]);

  const baseCumHeights = useMemo(() => {
    const cumulative = new Array<number>(pageCount + 1);
    cumulative[0] = 0;
    for (let i = 0; i < pageCount; i += 1) {
      cumulative[i + 1] = cumulative[i] + (pageHeights[i] ?? 0);
    }
    return cumulative;
  }, [pageCount, pageHeights]);

  const estimateSize = useCallback(
    (index: number) => (pageHeights[index] ?? 0) * scale + PAGE_GAP_PX,
    [pageHeights, scale],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns functions that React Compiler won't memoize
  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize,
    overscan: 3,
  });

  const totalSizeForScale = useCallback(
    (zoom: number) => baseCumHeights[pageCount] * zoom + pageCount * PAGE_GAP_PX,
    [baseCumHeights, pageCount],
  );

  const getScaledStart = useCallback(
    (index: number, zoom: number) => baseCumHeights[index] * zoom + index * PAGE_GAP_PX,
    [baseCumHeights],
  );

  const findPageIndexAtY = useCallback(
    (yPx: number, zoom: number) => {
      if (pageCount <= 0) return 0;
      const y = Math.max(0, yPx);
      let lo = 0;
      let hi = pageCount - 1;
      let idx = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const start = getScaledStart(mid, zoom);
        const end = start + (pageHeights[mid] ?? 0) * zoom;
        if (y < start) {
          hi = mid - 1;
        } else if (y > end) {
          idx = mid;
          lo = mid + 1;
        } else {
          idx = mid;
          break;
        }
      }
      return idx;
    },
    [getScaledStart, pageCount, pageHeights],
  );

  const getAnchorFromY = useCallback(
    (yPx: number, zoom: number): IZoomAnchor => {
      if (pageCount <= 0 || zoom <= 0) return { index: 0, withinPageUnscaled: 0 };
      const index = findPageIndexAtY(yPx, zoom);
      const start = getScaledStart(index, zoom);
      const pageHeightScaled = (pageHeights[index] ?? 0) * zoom;
      const withinPagePx = clamp(yPx - start, 0, pageHeightScaled);
      const withinPageUnscaled = pageHeightScaled > 0 ? withinPagePx / zoom : 0;
      return { index, withinPageUnscaled };
    },
    [findPageIndexAtY, getScaledStart, pageCount, pageHeights],
  );

  const applyZoomAnchor = useCallback(
    (anchor: IZoomAnchor, zoom: number, pointerY: number) => {
      const el = scrollElementRef.current;
      if (!el) return;
      const start = getScaledStart(anchor.index, zoom);
      const targetY = start + anchor.withinPageUnscaled * zoom;
      const maxScrollTop = Math.max(0, totalSizeForScale(zoom) - el.clientHeight);
      el.scrollTop = clamp(targetY - pointerY, 0, maxScrollTop);
    },
    [getScaledStart, totalSizeForScale],
  );

  // Register scrollToIndex handler with context for goToPage support
  useEffect(() => {
    registerScrollToIndex((index: number) => {
      virtualizer.scrollToIndex(index, { align: 'center' });
    });
  }, [registerScrollToIndex, virtualizer]);

  // Track current page using Intersection Observer for accurate scroll sync
  const handlePageChange = useCallback(
    (page: number) => {
      goToPage(page, { scrollIntoView: false, scrollIntoPreview: true });
    },
    [goToPage],
  );

  const { registerPageElement } = useCurrentPageTracker({
    pageCount,
    onPageChange: handlePageChange,
    root: scrollContainer,
    rootMargin: OBSERVER_CONFIG.ROOT_MARGIN,
    threshold: OBSERVER_CONFIG.VISIBILITY_THRESHOLD,
  });

  const handleScrollRef = useCallback((ref: HTMLDivElement | null) => {
    scrollElementRef.current = ref;
    setScrollContainer(ref);
  }, []);

  // Keep scale in a ref so wheel handler doesn't rebind every render
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const prevScaleRef = useRef(scale);
  const pendingWheelRef = useRef<IPendingWheelAnchor | null>(null);
  const previewScaleRef = useRef<number | null>(null);
  const previewIntentRef = useRef<IPreviewIntent | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const [previewTransform, setPreviewTransform] = useState<string | null>(null);
  const [pinnedIndices, setPinnedIndices] = useState<number[]>([]);

  // Ctrl + Mouse Wheel zoom: preserve the exact doc point under the cursor
  useEffect(() => {
    const el = scrollContainer;
    if (!el) return;

    const applyPreviewTransform = (intent: IPreviewIntent) => {
      const layoutScale = scaleRef.current;
      const ratio = layoutScale > 0 ? intent.scale / layoutScale : 1;
      const x = el.scrollLeft + intent.pointerX;
      const y = el.scrollTop + intent.pointerY;
      const translateX = x * (1 - ratio);
      const rawTranslateY = y * (1 - ratio);
      // Clamp Y so first page sticks to top:
      // - Zoom in (ratio > 1): translateY is negative, clamp to 0
      // - Zoom out (ratio < 1): if already at top, don't translate
      const translateY = ratio >= 1 ? rawTranslateY : el.scrollTop === 0 ? 0 : rawTranslateY;
      setPreviewTransform(`translate(${translateX}px, ${translateY}px) scale(${ratio})`);
    };

    const schedulePreview = () => {
      if (previewRafRef.current != null) return;
      previewRafRef.current = window.requestAnimationFrame(() => {
        previewRafRef.current = null;
        if (!previewIntentRef.current) return;
        applyPreviewTransform(previewIntentRef.current);
      });
    };

    const scheduleCommit = () => {
      if (commitTimerRef.current != null) {
        window.clearTimeout(commitTimerRef.current);
      }
      commitTimerRef.current = window.setTimeout(() => {
        commitTimerRef.current = null;
        const targetScale = previewScaleRef.current ?? scaleRef.current;
        if (targetScale === scaleRef.current) {
          previewScaleRef.current = null;
          pendingWheelRef.current = null;
          setPinnedIndices([]);
          setPreviewTransform(null);
          return;
        }
        const currentItems = virtualizer.getVirtualItems();
        const pinned = currentItems.map((item) => item.index);
        setPinnedIndices(pinned);
        setScale(targetScale);
      }, VIEWER_CONFIG.WHEEL_COMMIT_MS);
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const pointerX = el.clientWidth / 2;
      const pointerY = e.clientY - rect.top;
      const delta = e.deltaY < 0 ? VIEWER_CONFIG.WHEEL_ZOOM_STEP : -VIEWER_CONFIG.WHEEL_ZOOM_STEP;

      const baseScale = previewScaleRef.current ?? scaleRef.current;
      const next = clamp(baseScale + delta, VIEWER_CONFIG.MIN_SCALE, VIEWER_CONFIG.MAX_SCALE);
      if (next === baseScale) return;

      previewScaleRef.current = next;
      previewIntentRef.current = { pointerX, pointerY, scale: next };
      schedulePreview();

      const y = el.scrollTop + pointerY;
      const anchor = getAnchorFromY(y, scaleRef.current);
      pendingWheelRef.current = { anchor, pointerY, scale: next };
      scheduleCommit();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (previewRafRef.current != null) {
        window.cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
      if (commitTimerRef.current != null) {
        window.clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
    };
  }, [getAnchorFromY, scrollContainer, setScale, virtualizer]);

  // Non-wheel zooms (buttons, shortcuts): anchor to viewport center
  useLayoutEffect(() => {
    if (scale === prevScaleRef.current) return;
    const oldScale = prevScaleRef.current;
    prevScaleRef.current = scale;

    const pending = pendingWheelRef.current;
    if (pending?.scale === scale) {
      pendingWheelRef.current = null;
      previewScaleRef.current = null;
      virtualizer.measure();
      applyZoomAnchor(pending.anchor, scale, pending.pointerY);
      requestAnimationFrame(() => applyZoomAnchor(pending.anchor, scale, pending.pointerY));
      setPreviewTransform(null);
      requestAnimationFrame(() => setPinnedIndices([]));
      return;
    }

    const el = scrollElementRef.current;
    if (!el) return;
    const pointerY = el.clientHeight / 2;
    const y = el.scrollTop + pointerY;
    const anchor = getAnchorFromY(y, oldScale);
    virtualizer.measure();
    applyZoomAnchor(anchor, scale, pointerY);
  }, [applyZoomAnchor, getAnchorFromY, scale, virtualizer]);

  const itemContent = useCallback(
    (index: number) => <ViewerPage pageIndex={index} registerPageElement={registerPageElement} />,
    [registerPageElement],
  );

  const virtualItems = virtualizer.getVirtualItems();
  const mergedItems = useMemo(() => {
    const itemsByIndex = new Map<number, { index: number; start: number; size: number }>();
    for (const item of virtualItems) {
      itemsByIndex.set(item.index, { index: item.index, start: item.start, size: item.size });
    }
    for (const idx of pinnedIndices) {
      if (idx < 0 || idx >= pageCount) continue;
      if (itemsByIndex.has(idx)) continue;
      const size = (pageHeights[idx] ?? 0) * scale + PAGE_GAP_PX;
      const start = getScaledStart(idx, scale);
      itemsByIndex.set(idx, { index: idx, start, size });
    }
    return Array.from(itemsByIndex.values()).sort((a, b) => a.index - b.index);
  }, [getScaledStart, pageCount, pageHeights, pinnedIndices, scale, virtualItems]);

  return (
    <div className="h-full relative">
      <div
        ref={handleScrollRef}
        className="h-full overflow-auto"
        data-slot="viewer-scroll-container"
        style={{ overflowAnchor: 'none' }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
            transform: previewTransform ?? undefined,
            transformOrigin: previewTransform ? '0 0' : undefined,
            willChange: previewTransform ? 'transform' : undefined,
          }}
        >
          {mergedItems.map((virtualRow) => (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {itemContent(virtualRow.index)}
              <div style={{ height: PAGE_GAP_PX }} />
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-6 z-50 pointer-events-none flex justify-center w-[stretch]">
        <div className="pointer-events-auto margin">
          <PageControlBar
            pageCount={pageCount}
            onJumpToPage={(target) => {
              goToPage(target, { scrollIntoView: true, scrollIntoPreview: true });
            }}
          />
        </div>
      </div>
    </div>
  );
};
