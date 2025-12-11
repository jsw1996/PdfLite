import { createPdfiumModule, type PDFiumModule } from '@pdfviewer/pdfium-wasm';
import { Button } from '@pdfviewer/ui/components/button';
import { useCallback, useRef, useState } from 'react';

interface DocumentHandle {
  ptr: number;
  pageCount: number;
  dataPtr: number;
}

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moduleRef = useRef<PDFiumModule | null>(null);
  const documentRef = useRef<DocumentHandle | null>(null);

  // Initialize PDFium module
  const ensureInitialized = useCallback(async () => {
    if (moduleRef.current) return moduleRef.current;

    setLoading(true);
    setError(null);
    try {
      const module = await createPdfiumModule();
      // Initialize the PDFium library
      module._PDFium_Init();
      moduleRef.current = module;
      return module;
    } catch (err) {
      setError(`Failed to initialize PDFium: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load PDF file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const module = await ensureInitialized();
    if (!module) return;

    setLoading(true);
    setError(null);

    try {
      // Close previous document
      if (documentRef.current) {
        module._PDFium_CloseDocument(documentRef.current.ptr);
        module._free(documentRef.current.dataPtr);
        documentRef.current = null;
      }

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // Allocate memory and copy PDF data
      const dataPtr = module._malloc(data.length);
      module.HEAPU8.set(data, dataPtr);

      // Allocate memory for password string (empty password for now)
      const password = ''; // TODO: Add password input support if needed
      const encoder = new TextEncoder();
      const passwordBytes = encoder.encode(password);
      const passwordBytesSize = passwordBytes.length + 1; // +1 for null terminator
      const passwordPtr = module._malloc(passwordBytesSize);
      module.HEAPU8.set(passwordBytes, passwordPtr);
      module.HEAPU8[passwordPtr + passwordBytes.length] = 0; // null terminator

      // Load the document
      const docPtr = module._PDFium_LoadMemDocument(dataPtr, data.length, passwordPtr);
      module._free(passwordPtr);

      if (!docPtr) {
        module._free(dataPtr);
        const errorCode = module._PDFium_GetLastError();
        throw new Error(`Failed to load PDF (error code: ${errorCode})`);
      }

      const pages = module._PDFium_GetPageCount(docPtr);
      documentRef.current = { ptr: docPtr, pageCount: pages, dataPtr };

      setPageCount(pages);
      setCurrentPage(1);

      // Render first page
      renderPage(module, docPtr, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Render a page to canvas
  const renderPage = (module: PDFiumModule, docPtr: number, pageIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const pagePtr = module._PDFium_LoadPage(docPtr, pageIndex);
      if (!pagePtr) {
        throw new Error('Failed to load page');
      }

      const width = module._PDFium_GetPageWidth(pagePtr);
      const height = module._PDFium_GetPageHeight(pagePtr);
      const scale = 2; // Scale for better quality

      const renderWidth = Math.floor(width * scale);
      const renderHeight = Math.floor(height * scale);

      // Create bitmap with alpha channel
      const bitmap = module._PDFium_BitmapCreate(renderWidth, renderHeight, 1);
      if (!bitmap) {
        module._PDFium_ClosePage(pagePtr);
        throw new Error('Failed to create bitmap');
      }

      // Fill with white background (0xFFFFFFFF = white with full alpha)
      module._PDFium_BitmapFillRect(bitmap, 0, 0, renderWidth, renderHeight, 0xffffffff);

      // Render page to bitmap (flags: FPDF_ANNOT = 0x01)
      module._PDFium_RenderPageBitmap(bitmap, pagePtr, 0, 0, renderWidth, renderHeight, 0, 0x01);

      // Get buffer pointer and stride
      const bufferPtr = module._PDFium_BitmapGetBuffer(bitmap);
      const stride = module._PDFium_BitmapGetStride(bitmap);

      // Copy pixel data and convert BGRA to RGBA
      const rowBytes = renderWidth * 4;
      const pixelData = new Uint8ClampedArray(rowBytes * renderHeight);

      for (let y = 0; y < renderHeight; y++) {
        const srcOffset = bufferPtr + y * stride;
        const dstOffset = y * rowBytes;

        for (let x = 0; x < renderWidth; x++) {
          const srcIdx = srcOffset + x * 4;
          const dstIdx = dstOffset + x * 4;
          // BGRA to RGBA: swap B and R channels
          pixelData[dstIdx + 0] = module.HEAPU8[srcIdx + 2]; // R <- B
          pixelData[dstIdx + 1] = module.HEAPU8[srcIdx + 1]; // G <- G
          pixelData[dstIdx + 2] = module.HEAPU8[srcIdx + 0]; // B <- R
          pixelData[dstIdx + 3] = module.HEAPU8[srcIdx + 3]; // A <- A
        }
      }

      // Destroy the bitmap
      module._PDFium_BitmapDestroy(bitmap);

      // Create ImageData and draw to canvas
      const imageData = new ImageData(pixelData, renderWidth, renderHeight);

      canvas.width = renderWidth;
      canvas.height = renderHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(imageData, 0, 0);
      }

      // Cleanup
      module._PDFium_ClosePage(pagePtr);
    } catch (err) {
      setError(`Failed to render page: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Page navigation
  const goToPage = (page: number) => {
    if (!moduleRef.current || !documentRef.current) return;
    if (page < 1 || page > pageCount) return;

    setCurrentPage(page);
    renderPage(moduleRef.current, documentRef.current.ptr, page - 1);
  };

  return (
    <div className="pdf-viewer">
      <h1>PDF Viewer</h1>

      <div className="controls">
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => {
            void handleFileChange(e);
          }}
          disabled={loading}
        />
      </div>

      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error">{error}</div>}

      {pageCount > 0 && (
        <div className="navigation">
          <Button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            ← Previous
          </Button>
          <span>
            Page {currentPage} of {pageCount}
          </span>
          <Button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount}>
            Next →
          </Button>
        </div>
      )}

      <div className="canvas-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export default App;
