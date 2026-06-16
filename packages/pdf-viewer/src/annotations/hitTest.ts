/**
 * Hit-testing helpers for selecting canvas-rendered annotations.
 */

import type { IDrawAnnotation, IPoint, IRect } from './types';

/** Shortest distance from point `p` to the segment `a`–`b`. */
function pointToSegmentDistance(p: IPoint, a: IPoint, b: IPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  // Degenerate segment (a === b): fall back to point distance.
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Extra picking slop (in the same px space as the points) added to half the stroke width. */
const HIT_PADDING = 4;

/** True if point `p` lands on the stroke, within a tolerance derived from its width. */
export function isPointOnDrawStroke(p: IPoint, annotation: IDrawAnnotation): boolean {
  const { points, strokeWidth } = annotation;
  if (points.length === 0) return false;
  const tolerance = Math.max(strokeWidth / 2, 2) + HIT_PADDING;
  if (points.length === 1) {
    return Math.hypot(p.x - points[0].x, p.y - points[0].y) <= tolerance;
  }
  for (let i = 1; i < points.length; i++) {
    if (pointToSegmentDistance(p, points[i - 1], points[i]) <= tolerance) return true;
  }
  return false;
}

/**
 * Return the id of the topmost draw stroke under `p`, or null. Iterates last
 * (visually on top) first so overlapping strokes pick the one drawn most recently.
 */
export function hitTestDrawAnnotations(p: IPoint, annotations: IDrawAnnotation[]): string | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (isPointOnDrawStroke(p, annotations[i])) return annotations[i].id;
  }
  return null;
}

/** Axis-aligned bounding box of a stroke, expanded by half its width. */
export function drawAnnotationBounds(annotation: IDrawAnnotation): IRect {
  const { points, strokeWidth } = annotation;
  if (points.length === 0) return { left: 0, top: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }
  const pad = strokeWidth / 2;
  return {
    left: minX - pad,
    top: minY - pad,
    width: maxX - minX + strokeWidth,
    height: maxY - minY + strokeWidth,
  };
}
