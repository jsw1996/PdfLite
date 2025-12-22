import { useEffect, useRef } from 'react';

/**
 * Hook that preserves scroll position when zooming in/out.
 * Adjusts the scroll position proportionally so the same content stays centered.
 *
 * @param scale - The current zoom scale
 */
export const usePreserveScrollOnZoom = (scale: number): void => {
  const prevScaleRef = useRef(scale);

  useEffect(() => {
    if (prevScaleRef.current === scale) return;

    // The scroll happens on document.documentElement (html element)
    const scrollContainer = document.documentElement;

    const prevScale = prevScaleRef.current;
    const scaleRatio = scale / prevScale;

    // Get the center point of the viewport relative to the scroll container
    const viewportCenterY = scrollContainer.scrollTop + scrollContainer.clientHeight / 2;
    const viewportCenterX = scrollContainer.scrollLeft + scrollContainer.clientWidth / 2;

    // Calculate new scroll position to keep the same content centered
    const newScrollTop = viewportCenterY * scaleRatio - scrollContainer.clientHeight / 2;
    const newScrollLeft = viewportCenterX * scaleRatio - scrollContainer.clientWidth / 2;

    // Apply the new scroll position
    scrollContainer.scrollTop = Math.max(0, newScrollTop);
    scrollContainer.scrollLeft = Math.max(0, newScrollLeft);

    prevScaleRef.current = scale;
  }, [scale]);
};
