# @pdfviewer/pdfium-wasm

PDFium compiled to WebAssembly using Emscripten. This package provides a high-performance PDF rendering solution for web applications.

## Features

- High-performance PDF rendering using Google's PDFium
- Compiled to WebAssembly for browser compatibility
- Full text extraction support
- Bookmark/outline navigation
- Text search capabilities
- Annotation API support (read/write)
- PDF save/export functionality
- TypeScript support with full type definitions

## Building

### Prerequisites

- Docker Desktop installed and running
- Node.js 18+
- pnpm

### Build Commands

**On Windows (PowerShell):**

```powershell
# Build PDFium WASM using Docker
.\build.ps1
```

**On Linux/macOS:**

```bash
# Build the Docker image
docker build -t pdfium-wasm-builder ./build

# Run the container to compile
mkdir -p wasm
docker run --rm -v "$(pwd)/wasm:/build/output" pdfium-wasm-builder
```

The build process:

1. Creates a Docker container with Emscripten SDK and depot_tools
2. Fetches PDFium source from Google (~10GB download)
3. Builds PDFium for Linux first (to get proper headers/generated files)
4. Compiles the WASM wrapper with Emscripten
5. Outputs `pdfium.js`, `pdfium.wasm`, and `pdfium.d.ts` to the `wasm/` directory

> **Note:** The first build takes a long time (30+ minutes) due to fetching PDFium source.

## Usage

This package exposes the low-level PDFium WASM API. You are responsible for memory management when using these functions.

### Basic Example

```typescript
import { createPdfiumModule, type IPDFiumModule, FPDF_ERR } from '@pdfviewer/pdfium-wasm';

async function loadAndRenderPdf(pdfData: Uint8Array) {
  // Create and initialize the PDFium module
  const pdfium: IPDFiumModule = await createPdfiumModule();

  // Initialize PDFium library
  pdfium._PDFium_Init();

  // Allocate memory for PDF data
  const dataPtr = pdfium._malloc(pdfData.length);
  pdfium.HEAPU8.set(pdfData, dataPtr);

  try {
    // Load the document (0 = no password)
    const doc = pdfium._PDFium_LoadMemDocument(dataPtr, pdfData.length, 0);

    if (!doc) {
      const error = pdfium._PDFium_GetLastError();
      throw new Error(`Failed to load PDF: error code ${error}`);
    }

    // Get page count
    const pageCount = pdfium._PDFium_GetPageCount(doc);
    console.log(`PDF has ${pageCount} pages`);

    // Load first page
    const page = pdfium._PDFium_LoadPage(doc, 0);
    const width = pdfium._PDFium_GetPageWidth(page);
    const height = pdfium._PDFium_GetPageHeight(page);
    console.log(`Page size: ${width} x ${height}`);

    // Render to bitmap
    const scale = 2.0;
    const bitmapWidth = Math.ceil(width * scale);
    const bitmapHeight = Math.ceil(height * scale);

    const bitmap = pdfium._PDFium_BitmapCreate(bitmapWidth, bitmapHeight, 1);
    pdfium._PDFium_BitmapFillRect(bitmap, 0, 0, bitmapWidth, bitmapHeight, 0xffffffff);
    pdfium._PDFium_RenderPageBitmap(bitmap, page, 0, 0, bitmapWidth, bitmapHeight, 0, 0);

    // Get bitmap buffer and create ImageData
    const bufferPtr = pdfium._PDFium_BitmapGetBuffer(bitmap);
    const stride = pdfium._PDFium_BitmapGetStride(bitmap);
    const bufferSize = stride * bitmapHeight;
    const pixelData = new Uint8ClampedArray(pdfium.HEAPU8.buffer, bufferPtr, bufferSize);

    // Convert BGRA to RGBA for canvas
    const imageData = new ImageData(bitmapWidth, bitmapHeight);
    for (let y = 0; y < bitmapHeight; y++) {
      for (let x = 0; x < bitmapWidth; x++) {
        const srcIdx = y * stride + x * 4;
        const dstIdx = (y * bitmapWidth + x) * 4;
        imageData.data[dstIdx] = pixelData[srcIdx + 2]; // R
        imageData.data[dstIdx + 1] = pixelData[srcIdx + 1]; // G
        imageData.data[dstIdx + 2] = pixelData[srcIdx]; // B
        imageData.data[dstIdx + 3] = pixelData[srcIdx + 3]; // A
      }
    }

    // Clean up
    pdfium._PDFium_BitmapDestroy(bitmap);
    pdfium._PDFium_ClosePage(page);
    pdfium._PDFium_CloseDocument(doc);

    return imageData;
  } finally {
    pdfium._free(dataPtr);
    pdfium._PDFium_Destroy();
  }
}
```

### Text Extraction

```typescript
import { createPdfiumModule } from '@pdfviewer/pdfium-wasm';

async function extractText(pdfium: IPDFiumModule, page: number): Promise<string> {
  const textPage = pdfium._PDFium_LoadPageText(page);
  const charCount = pdfium._PDFium_GetPageCharCount(textPage);

  // Allocate buffer for text (UTF-16, 2 bytes per char + null terminator)
  const bufferSize = (charCount + 1) * 2;
  const buffer = pdfium._malloc(bufferSize);

  try {
    pdfium._PDFium_GetPageText(textPage, buffer, bufferSize);
    const text = pdfium.UTF16ToString(buffer);
    return text;
  } finally {
    pdfium._free(buffer);
    pdfium._PDFium_ClosePageText(textPage);
  }
}
```

### Text Search

```typescript
import { createPdfiumModule } from '@pdfviewer/pdfium-wasm';

function searchText(pdfium: IPDFiumModule, textPage: number, searchTerm: string) {
  // Allocate buffer for search term (UTF-16)
  const termBytes = (searchTerm.length + 1) * 2;
  const termPtr = pdfium._malloc(termBytes);
  pdfium.stringToUTF16(searchTerm, termPtr, termBytes);

  try {
    // Start search (flags: 0 = default, startIndex: 0)
    const searchHandle = pdfium._PDFium_FindStart(textPage, termPtr, 0, 0);
    const results: Array<{ charIndex: number; count: number }> = [];

    while (pdfium._PDFium_FindNext(searchHandle)) {
      const charIndex = pdfium._PDFium_GetSchResultIndex(searchHandle);
      const count = pdfium._PDFium_GetSchCount(searchHandle);
      results.push({ charIndex, count });
    }

    pdfium._PDFium_FindClose(searchHandle);
    return results;
  } finally {
    pdfium._free(termPtr);
  }
}
```

### Save PDF with Annotations

```typescript
import { createPdfiumModule, FPDF_ANNOTATION_SUBTYPE } from '@pdfviewer/pdfium-wasm';

async function saveModifiedPdf(pdfium: IPDFiumModule, doc: number): Promise<Uint8Array> {
  // Save to memory (flags: 0 = default)
  const size = pdfium._PDFium_SaveToMemory(doc, 0);

  if (size === 0) {
    throw new Error('Failed to save PDF');
  }

  const bufferPtr = pdfium._PDFium_GetSaveBuffer();
  const savedData = new Uint8Array(size);
  savedData.set(pdfium.HEAPU8.subarray(bufferPtr, bufferPtr + size));

  // Free the save buffer
  pdfium._PDFium_FreeSaveBuffer();

  return savedData;
}
```

## API Reference

### Exports

The package exports the following:

#### Functions

- `createPdfiumModule(): Promise<IPDFiumModule>` - Creates and returns an initialized PDFium WASM module

#### Interfaces

- `IPDFiumModule` - The main PDFium module interface with all WASM functions

#### Enums

- `FPDF_ERR` - Error codes returned by `_PDFium_GetLastError()`
  - `SUCCESS` (0) - No error
  - `UNKNOWN` (1) - Unknown error
  - `FILE` (2) - File not found or could not be opened
  - `FORMAT` (3) - File not in PDF format or corrupted
  - `PASSWORD` (4) - Password required or incorrect password
  - `SECURITY` (5) - Unsupported security scheme
  - `PAGE` (6) - Page not found or content error

- `FPDF_ANNOTATION_SUBTYPE` - Annotation type constants (TEXT, LINK, HIGHLIGHT, INK, etc.)

- `FPDFANNOT_COLORTYPE` - Annotation color types (COLOR, INTERIORCOLOR)

- `FPDF_ANNOT_APPEARANCEMODE` - Appearance modes (NORMAL, ROLLOVER, DOWN)

- `FPDF_OBJECT_TYPE` - PDF object types (BOOLEAN, NUMBER, STRING, etc.)

- `FPDF_ANNOT_FLAG` - Annotation flags (HIDDEN, PRINT, READONLY, etc.)

### IPDFiumModule Methods

#### Core Document Functions

| Method                                                | Description               |
| ----------------------------------------------------- | ------------------------- |
| `_PDFium_Init()`                                      | Initialize PDFium library |
| `_PDFium_Destroy()`                                   | Destroy PDFium library    |
| `_PDFium_LoadMemDocument(dataPtr, size, passwordPtr)` | Load PDF from memory      |
| `_PDFium_CloseDocument(doc)`                          | Close a document          |
| `_PDFium_GetPageCount(doc)`                           | Get number of pages       |
| `_PDFium_LoadPage(doc, pageIndex)`                    | Load a page               |
| `_PDFium_ClosePage(page)`                             | Close a page              |
| `_PDFium_GetPageWidth(page)`                          | Get page width in points  |
| `_PDFium_GetPageHeight(page)`                         | Get page height in points |
| `_PDFium_GetLastError()`                              | Get last error code       |

#### Rendering Functions

| Method                                                                                | Description               |
| ------------------------------------------------------------------------------------- | ------------------------- |
| `_PDFium_BitmapCreate(width, height, alpha)`                                          | Create a bitmap           |
| `_PDFium_BitmapDestroy(bitmap)`                                                       | Destroy a bitmap          |
| `_PDFium_BitmapFillRect(bitmap, left, top, width, height, color)`                     | Fill bitmap with color    |
| `_PDFium_RenderPageBitmap(bitmap, page, startX, startY, sizeX, sizeY, rotate, flags)` | Render page to bitmap     |
| `_PDFium_BitmapGetBuffer(bitmap)`                                                     | Get bitmap buffer pointer |
| `_PDFium_BitmapGetStride(bitmap)`                                                     | Get bitmap stride         |

#### Text Functions

| Method                                             | Description                 |
| -------------------------------------------------- | --------------------------- |
| `_PDFium_LoadPageText(page)`                       | Load text page              |
| `_PDFium_ClosePageText(textPage)`                  | Close text page             |
| `_PDFium_GetPageCharCount(textPage)`               | Get character count         |
| `_PDFium_GetPageText(textPage, buffer, bufferLen)` | Get page text               |
| `_PDFium_GetCharBox(textPage, charIndex, ...)`     | Get character bounding box  |
| `_PDFium_GetUnicode(textPage, charIndex)`          | Get character Unicode value |
| `_PDFium_GetFontSize(textPage, charIndex)`         | Get character font size     |

#### Search Functions

| Method                                                     | Description                |
| ---------------------------------------------------------- | -------------------------- |
| `_PDFium_FindStart(textPage, findWhat, flags, startIndex)` | Start text search          |
| `_PDFium_FindNext(searchHandle)`                           | Find next occurrence       |
| `_PDFium_FindPrev(searchHandle)`                           | Find previous occurrence   |
| `_PDFium_GetSchResultIndex(searchHandle)`                  | Get result character index |
| `_PDFium_GetSchCount(searchHandle)`                        | Get result character count |
| `_PDFium_FindClose(searchHandle)`                          | Close search handle        |

#### Annotation Functions

| Method                                           | Description              |
| ------------------------------------------------ | ------------------------ |
| `_FPDFPage_GetAnnotCount_W(page)`                | Get annotation count     |
| `_FPDFPage_GetAnnot_W(page, index)`              | Get annotation at index  |
| `_FPDFPage_CreateAnnot_W(page, subtype)`         | Create new annotation    |
| `_FPDFPage_RemoveAnnot_W(page, index)`           | Remove annotation        |
| `_FPDFAnnot_GetSubtype_W(annot)`                 | Get annotation subtype   |
| `_FPDFAnnot_GetRect_W(annot, rectPtr)`           | Get annotation rectangle |
| `_FPDFAnnot_SetRect_W(annot, rectPtr)`           | Set annotation rectangle |
| `_FPDFAnnot_GetColor_W(annot, type, ...)`        | Get annotation color     |
| `_FPDFAnnot_SetColor_W(annot, type, r, g, b, a)` | Set annotation color     |

#### Save Functions

| Method                             | Description              |
| ---------------------------------- | ------------------------ |
| `_PDFium_SaveToMemory(doc, flags)` | Save document to memory  |
| `_PDFium_GetSaveBuffer()`          | Get saved buffer pointer |
| `_PDFium_GetSaveBufferSize()`      | Get saved buffer size    |
| `_PDFium_FreeSaveBuffer()`         | Free saved buffer        |

#### Memory Functions

| Method                 | Description              |
| ---------------------- | ------------------------ |
| `_malloc(size)`        | Allocate memory          |
| `_free(ptr)`           | Free memory              |
| `_PDFium_Malloc(size)` | PDFium memory allocation |
| `_PDFium_Free(ptr)`    | PDFium memory free       |

#### Emscripten Runtime

| Property/Method                        | Description                      |
| -------------------------------------- | -------------------------------- |
| `HEAPU8`                               | Unsigned 8-bit heap view         |
| `HEAP32`                               | Signed 32-bit heap view          |
| `HEAPF32`                              | 32-bit float heap view           |
| `getValue(ptr, type)`                  | Read value from memory           |
| `setValue(ptr, value, type)`           | Write value to memory            |
| `UTF8ToString(ptr)`                    | Convert UTF-8 pointer to string  |
| `UTF16ToString(ptr)`                   | Convert UTF-16 pointer to string |
| `stringToUTF8(str, buffer, maxBytes)`  | Write string as UTF-8            |
| `stringToUTF16(str, buffer, maxBytes)` | Write string as UTF-16           |

## Memory Management

When working with PDFium WASM, always follow these rules:

1. **Allocate with `_malloc`** - Use `pdfium._malloc(size)` to allocate memory
2. **Free in finally blocks** - Always use `pdfium._free(ptr)` in finally blocks
3. **Close handles** - Always close page, document, and text handles when done
4. **Copy data if needed** - WASM memory can be invalidated; copy data you need to keep

```typescript
const ptr = pdfium._malloc(size);
try {
  // Use allocated memory
} finally {
  pdfium._free(ptr);
}
```

## License

Apache-2.0 (same as PDFium)
