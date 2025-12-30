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
  isDrawAnnotation,
  isHighlightAnnotation,
  isTextAnnotation,
  generateAnnotationId,
} from './types';

// Constants
export {
  ANNOTATION_COLORS,
  ANNOTATION_STROKE_WIDTH,
  TEXT_ANNOTATION_DEFAULTS,
  ANNOTATION_TIMING,
} from './constants';

// Handlers
export {
  type ICanvasMetrics,
  type IAnnotationHandler,
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
