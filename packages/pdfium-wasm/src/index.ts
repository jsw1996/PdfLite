/**
 * PDFium WebAssembly Module
 * TypeScript wrapper for the compiled PDFium WASM module
 */

import * as pdfiumModule from '../wasm/pdfium.js';

/**
 * PDFium Module interface - the raw WASM module exports
 */
export interface PDFiumModule {
  // Lifecycle
  _PDFium_Init(): number;
  _PDFium_Destroy(): void;
  
  // Document operations
  _PDFium_LoadMemDocument(dataPtr: number, size: number, passwordPtr: number): number;
  _PDFium_CloseDocument(doc: number): void;
  _PDFium_GetPageCount(doc: number): number;
  
  // Page operations
  _PDFium_LoadPage(doc: number, pageIndex: number): number;
  _PDFium_ClosePage(page: number): void;
  _PDFium_GetPageWidth(page: number): number;
  _PDFium_GetPageHeight(page: number): number;
  
  // Rendering
  _PDFium_RenderPageBitmap(bitmap: number, page: number, start_x: number, start_y: number, size_x: number, size_y: number, rotate: number, flags: number): void;
  _PDFium_BitmapCreate(width: number, height: number, alpha: number): number;
  _PDFium_BitmapDestroy(bitmap: number): void;
  _PDFium_BitmapFillRect(bitmap: number, left: number, top: number, width: number, height: number, color: number): void;
  _PDFium_BitmapGetBuffer(bitmap: number): number;
  _PDFium_BitmapGetStride(bitmap: number): number;
  _PDFium_FreeBuffer(buffer: number): void;
  
  // Text extraction
  _PDFium_LoadPageText(page: number): number;
  _PDFium_ClosePageText(textPage: number): void;
  _PDFium_GetPageCharCount(textPage: number): number;
  _PDFium_GetPageText(textPage: number, buffer: number, bufferLen: number): number;
  
  // Error handling
  _PDFium_GetLastError(): number;
  
  // Metadata
  _PDFium_GetMetaText(doc: number, tag: number, buffer: number, bufferLen: number): number;
  
  // Bookmarks
  _PDFium_GetFirstBookmark(doc: number): number;
  _PDFium_GetNextBookmark(doc: number, bookmark: number): number;
  _PDFium_GetFirstChildBookmark(doc: number, bookmark: number): number;
  _PDFium_GetBookmarkTitle(bookmark: number, buffer: number, bufferLen: number): number;
  _PDFium_GetBookmarkDest(doc: number, bookmark: number): number;
  _PDFium_GetDestPageIndex(doc: number, dest: number): number;
  
  // Memory management
  _PDFium_Malloc(size: number): number;
  _PDFium_Free(ptr: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  
  // Emscripten runtime
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  ccall(name: string, returnType: string, argTypes: string[], args: unknown[]): unknown;
  cwrap(name: string, returnType: string, argTypes: string[]): (...args: unknown[]) => unknown;
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;
  UTF16ToString(ptr: number): string;
  stringToUTF16(str: string, buffer: number, maxBytes: number): void;
}

// Get the factory function from the module (handles ESM/CJS interop)
const createPDFiumModuleFactory = (pdfiumModule as { default?: () => Promise<PDFiumModule> }).default ?? pdfiumModule;

/**
 * Create and initialize a PDFium WASM module instance
 * @returns Promise that resolves to an initialized PDFiumModule
 */
export async function createPdfiumModule(): Promise<PDFiumModule> {
  const module = await (createPDFiumModuleFactory as () => Promise<PDFiumModule>)();
  return module;
}

// Export the factory function as default for convenience
export default createPdfiumModule;
