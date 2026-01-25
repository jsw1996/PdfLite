/**
 * Type declaration for the Emscripten-generated pdfium.js module
 */

import type { IPDFiumModule } from '../src/index';

/**
 * Factory function that creates and initializes a PDFium WASM module
 */
declare function createPdfiumModule(): Promise<IPDFiumModule>;

export = createPdfiumModule;
export default createPdfiumModule;
