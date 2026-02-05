/**
 * Annotation type system using discriminated unions for type safety.
 * Each annotation type has its own specific properties.
 */

export type AnnotationType = 'draw' | 'highlight' | 'text' | 'signature';
export type AnnotationSource = 'native' | 'overlay';

export interface IPoint {
  x: number;
  y: number;
}

export interface IRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Base annotation properties shared by all types
 */
interface IBaseAnnotation {
  id: string;
  source: AnnotationSource;
  pageIndex: number;
  createdAt: number;
}

/**
 * Freehand drawing annotation (ink strokes)
 */
export interface IDrawAnnotation extends IBaseAnnotation {
  type: 'draw';
  points: IPoint[];
  color: string;
  strokeWidth: number;
}

/**
 * Highlight annotation for text selection
 */
export interface IHighlightAnnotation extends IBaseAnnotation {
  type: 'highlight';
  rects: IRect[];
  color: string;
}

/**
 * Text annotation (FreeText in PDF terms)
 */
export interface ITextAnnotation extends IBaseAnnotation {
  type: 'text';
  position: IPoint;
  content: string;
  fontSize: number;
  fontColor: string;
  /** Computed dimensions from text content, updated when text changes */
  dimensions?: { width: number; height: number };
}

/**
 * Signature annotation (image/stamp)
 */
export interface ISignatureAnnotation extends IBaseAnnotation {
  type: 'signature';
  position: IPoint;
  imageDataUrl: string;
  imageRgbaBytes: Uint8Array;
  imageWidthPx: number;
  imageHeightPx: number;
  width: number;
  height: number;
}

/**
 * Discriminated union of all annotation types
 */
export type IAnnotation =
  | IDrawAnnotation
  | IHighlightAnnotation
  | ITextAnnotation
  | ISignatureAnnotation;

/**
 * Type guard for draw annotations
 */
export function isDrawAnnotation(a: IAnnotation): a is IDrawAnnotation {
  return a.type === 'draw';
}

/**
 * Type guard for highlight annotations
 */
export function isHighlightAnnotation(a: IAnnotation): a is IHighlightAnnotation {
  return a.type === 'highlight';
}

/**
 * Type guard for text annotations
 */
export function isTextAnnotation(a: IAnnotation): a is ITextAnnotation {
  return a.type === 'text';
}

/**
 * Type guard for signature annotations
 */
export function isSignatureAnnotation(a: IAnnotation): a is ISignatureAnnotation {
  return a.type === 'signature';
}

/**
 * Helper to generate unique annotation IDs
 */
export function generateAnnotationId(prefix = 'ann'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
