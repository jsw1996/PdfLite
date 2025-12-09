/**
 * ESM wrapper for the Emscripten-generated pdfium.js
 * This re-exports the module factory function for proper ESM compatibility
 */

import * as pdfiumModule from '../wasm/pdfium.js';

// The pdfium.js uses module.exports = createPDFiumModule
// When imported as ESM, bundlers may handle this differently
const createPDFiumModule = (pdfiumModule as any).default ?? pdfiumModule;

export default createPDFiumModule;
export { createPDFiumModule };
