export enum AnnotationType {
  DRAW = 'draw',
  HIGHLIGHT = 'highlight',
}

export type AnnotationShape = 'stroke' | 'polygon';
export type AnnotationSource = 'native' | 'overlay';

export interface IPoint {
  x: number;
  y: number;
}

export interface IAnnotation {
  id: string;
  type: AnnotationType;
  shape: AnnotationShape;
  source: AnnotationSource;
  pageIndex: number;
  points: IPoint[];
  color: string;
  strokeWidth: number;
  createdAt: number;
}
