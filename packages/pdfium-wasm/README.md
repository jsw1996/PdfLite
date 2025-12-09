# @pdfviewer/pdfium-wasm

PDFium compiled to WebAssembly using Emscripten. This package provides a high-performance PDF rendering solution for web applications.

## Features

- 🚀 High-performance PDF rendering using Google's PDFium
- 📦 Compiled to WebAssembly for browser compatibility
- 📝 Full text extraction support
- 🔖 Bookmark/outline navigation
- 🔍 Text search capabilities
- 💪 TypeScript support with full type definitions

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
mkdir -p dist
docker run --rm -v "$(pwd)/dist:/build/output" pdfium-wasm-builder
```

The build process:
1. Creates a Docker container with Emscripten SDK and depot_tools
2. Fetches PDFium source from Google (~10GB download)
3. Builds PDFium for Linux first (to get proper headers/generated files)
4. Compiles the WASM wrapper with Emscripten
5. Outputs `pdfium.js`, `pdfium.wasm`, and `pdfium.d.ts` to the `dist/` directory

> **Note:** The first build takes a long time (30+ minutes) due to fetching PDFium source.

## Usage

### Basic Example

```typescript
import { initPDFium, PDFDocumentWrapper, PageRotation } from '@pdfviewer/pdfium-wasm';

async function renderPdf() {
  // Initialize PDFium (call once at app startup)
  await initPDFium();

  // Load a PDF document
  const doc = await PDFDocumentWrapper.loadFromUrl('/sample.pdf');

  // Get page count
  console.log(`Pages: ${doc.getPageCount()}`);

  // Render first page at 2x scale
  const imageData = doc.renderPage(0, 2.0);

  // Draw to canvas
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);

  // Clean up
  doc.close();
}
```

### Text Extraction

```typescript
const text = doc.getPageText(0);
console.log(text);
```

### Get Document Metadata

```typescript
const metadata = doc.getMetadata();
console.log(`Title: ${metadata.title}`);
console.log(`Author: ${metadata.author}`);
```

### Bookmarks/Outline

```typescript
const outline = doc.getOutline();

function printBookmarks(items: BookmarkItem[], indent = 0) {
  for (const item of items) {
    console.log(' '.repeat(indent) + `${item.title} (page ${item.pageIndex})`);
    printBookmarks(item.children, indent + 2);
  }
}

printBookmarks(outline);
```

### Loading from Different Sources

```typescript
// From URL
const doc1 = await PDFDocumentWrapper.loadFromUrl('/sample.pdf');

// From File input
const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
const doc2 = await PDFDocumentWrapper.loadFromFile(fileInput.files![0]);

// From ArrayBuffer/Uint8Array
const response = await fetch('/sample.pdf');
const buffer = await response.arrayBuffer();
const doc3 = await PDFDocumentWrapper.load(new Uint8Array(buffer));

// With password
const doc4 = await PDFDocumentWrapper.load(data, 'password123');
```

## API Reference

### `initPDFium(moduleFactory?)`

Initializes the PDFium WASM module. Must be called before using any PDFium functions.

```typescript
await initPDFium();
```

### `destroyPDFium()`

Destroys the PDFium library and frees resources.

### `PDFDocumentWrapper`

Main class for working with PDF documents.

**Static Methods:**
- `load(data: Uint8Array, password?: string)` - Load from bytes
- `loadFromFile(file: File, password?: string)` - Load from File object
- `loadFromUrl(url: string, password?: string)` - Load from URL

**Instance Methods:**
- `getPageCount()` - Get number of pages
- `getPageInfo(index)` - Get page dimensions
- `renderPage(index, scale?, rotation?)` - Render page to ImageData
- `renderPageToCanvas(index, canvas, options?)` - Render to canvas
- `getPageText(index)` - Extract text from page
- `getMetadata()` - Get document metadata
- `getOutline()` - Get bookmarks/outline
- `close()` - Close the document
- `isOpen()` - Check if document is open

### `PageRotation`

Enum for page rotation:
- `NONE` (0°)
- `CW_90` (90° clockwise)
- `CW_180` (180°)
- `CW_270` (270° clockwise)

### `PDFiumError`

Enum for error codes:
- `SUCCESS`
- `UNKNOWN`
- `FILE` - File not found
- `FORMAT` - Invalid PDF format
- `PASSWORD` - Wrong password
- `SECURITY` - Unsupported security
- `PAGE` - Page error

## Low-Level API

For advanced use cases, you can access the raw WASM functions:

```typescript
import createPDFiumModule from '@pdfviewer/pdfium-wasm/pdfium';

const module = await createPDFiumModule();

// Initialize
module._PDFium_Init();

// Load document (you need to manage memory manually)
const dataPtr = module._malloc(pdfData.length);
module.HEAPU8.set(pdfData, dataPtr);
const doc = module._PDFium_LoadMemDocument(dataPtr, pdfData.length, 0);

// ... work with document ...

// Cleanup
module._PDFium_CloseDocument(doc);
module._free(dataPtr);
module._PDFium_Destroy();
```

## License

Apache-2.0 (same as PDFium)
