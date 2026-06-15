/**
 * Geometry helpers for freehand strokes.
 */

import type { IPoint } from './types';

/**
 * Smooth a freehand stroke with Chaikin's corner-cutting algorithm.
 *
 * Each iteration replaces every interior corner with two points at the 1/4 and
 * 3/4 positions of its adjacent segments, converging to a smooth quadratic
 * B-spline. The endpoints are preserved so the stroke still starts/ends exactly
 * where drawn. The operation uses only convex combinations of points, so it is
 * affine-invariant — smoothing in CSS-pixel space and then normalizing yields
 * the same result as normalizing first, which is why it can run at stroke-end
 * (CSS coords) and still match the committed page-coordinate geometry.
 *
 * Point count grows ~2x per iteration; 2 iterations is enough to hide the
 * angularity between sampled points while keeping the path small.
 */
export function chaikinSmooth(points: IPoint[], iterations = 2): IPoint[] {
  if (points.length < 3) return points;

  let pts = points;
  for (let iter = 0; iter < iterations; iter++) {
    const out: IPoint[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      out.push({ x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y });
      out.push({ x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}
