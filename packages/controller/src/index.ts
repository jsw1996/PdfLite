export type ControllerVersion = '0.1.0';

export const CONTROLLER_VERSION: ControllerVersion = '0.1.0';

export {
  PdfController,
  PdfPasswordError,
  type IPdfController,
  type IPageDimension,
  type IRenderOptions,
  type ITextRect,
  type IPageTextContent,
  type IEditableTextObject,
  type IReflowLineUpdate,
  type ITextEditResult,
  type ISearchResult,
  type IFormField,
  type IFormFieldOption,
  type FormFieldType,
} from './PdfController';

export type {
  IPdfDest,
  IPdfOutlineNode,
  IUserBookmark,
  IOutlineControllerDraft,
} from './outlineTypes';
