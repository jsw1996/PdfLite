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
  type ITextAnnotation,
  type ISignatureAnnotation,
  isDrawAnnotation,
  isHighlightAnnotation,
  isTextAnnotation,
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
  TEXT_ANNOTATION_DEFAULTS,
  TEXT_COLOR_PRESETS,
  ANNOTATION_TIMING,
} from './constants';

// Handlers
export {
  type ICanvasMetrics,
  type IAnnotationHandler,
  type ICommitContext,
  drawHandler,
  highlightHandler,
  textHandler,
  getHandler,
  normalizeAnnotation,
  denormalizeAnnotation,
  renderAnnotation,
  commitAnnotation,
  rectsToBoundingBox,
} from './handlers';
