/**
 * PDFium WebAssembly Module Type Definitions
 */

export interface PDFiumModule {
  _PDFium_Init(): number;
  _PDFium_Destroy(): void;
  _PDFium_LoadMemDocument(dataPtr: number, size: number, passwordPtr: number): number;
  _PDFium_CloseDocument(doc: number): void;
  _PDFium_GetPageCount(doc: number): number;
  _PDFium_LoadPage(doc: number, pageIndex: number): number;
  _PDFium_ClosePage(page: number): void;
  _PDFium_GetPageWidth(page: number): number;
  _PDFium_GetPageHeight(page: number): number;
  _PDFium_RenderPageBitmap(page: number, width: number, height: number, rotate: number): number;
  _PDFium_FreeBuffer(buffer: number): void;
  _PDFium_LoadPageText(page: number): number;
  _PDFium_ClosePageText(textPage: number): void;
  _PDFium_GetPageCharCount(textPage: number): number;
  _PDFium_GetPageText(textPage: number, buffer: number, bufferLen: number): number;
  _PDFium_GetLastError(): number;
  _PDFium_GetMetaText(doc: number, tag: number, buffer: number, bufferLen: number): number;
  _PDFium_GetFirstBookmark(doc: number): number;
  _PDFium_GetNextBookmark(doc: number, bookmark: number): number;
  _PDFium_GetFirstChildBookmark(doc: number, bookmark: number): number;
  _PDFium_GetBookmarkTitle(bookmark: number, buffer: number, bufferLen: number): number;
  _PDFium_GetBookmarkDest(doc: number, bookmark: number): number;
  _PDFium_GetDestPageIndex(doc: number, dest: number): number;
  _PDFium_Malloc(size: number): number;
  _PDFium_Free(ptr: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  ccall(name: string, returnType: string, argTypes: string[], args: any[]): any;
  cwrap(name: string, returnType: string, argTypes: string[]): (...args: any[]) => any;
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;
  UTF16ToString(ptr: number): string;
  stringToUTF16(str: string, buffer: number, maxBytes: number): void;
  stringToUTF8(str: string, buffer: number, maxBytes: number): void;
  lengthBytesUTF8(str: string): number;
}

declare function createPDFiumModule(): Promise<PDFiumModule>;
export default createPDFiumModule;
