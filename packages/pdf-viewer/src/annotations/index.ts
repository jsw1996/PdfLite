/**
 * Annotations module - centralized exports for annotation system
 */

// Types
export {
  type AnnotationType,
  type AnnotationSource,
  type IPoint,
  type IRect,
  type IAnnotation,
  type IDrawAnnotation,
  type IHighlightAnnotation,
  type ISignatureAnnotation,
  isDrawAnnotation,
  isHighlightAnnotation,
  isSignatureAnnotation,
  generateAnnotationId,
} from './types';

// Geometry
export { chaikinSmooth } from './smoothing';
export { hitTestDrawAnnotations, isPointOnDrawStroke, drawAnnotationBounds } from './hitTest';

// Constants
export {
  ANNOTATION_COLORS,
  ANNOTATION_STROKE_WIDTH,
  DRAW_TOOL_DEFAULTS,
  DRAW_COLOR_PRESETS,
  DRAW_STROKE_WIDTH_PRESETS,
  HIGHLIGHT_TOOL_DEFAULTS,
  HIGHLIGHT_COLOR_PRESETS,
  ANNOTATION_TIMING,
} from './constants';

// Handlers
export {
  type ICanvasMetrics,
  type IAnnotationHandler,
  drawHandler,
  highlightHandler,
  getHandler,
  normalizeAnnotation,
  denormalizeAnnotation,
  renderAnnotation,
  commitAnnotation,
  rectsToBoundingBox,
} from './handlers';
