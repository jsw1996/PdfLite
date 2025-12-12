/// <reference lib="dom" />
import { type PDFiumModule, createPdfiumModule } from '@pdfviewer/pdfium-wasm';

export interface IRenderOptions {
  pageIndex?: number;
  scale?: number;
}

export interface IPdfController {
  ensureInitialized(): Promise<void>;
  loadFile(file: File): Promise<void>;
  renderPdf(canvas: HTMLCanvasElement, options?: IRenderOptions): void;
  getPageCount(): number;
  destroy(): void;
}

export class PdfController implements IPdfController {
  private pdfiumModule: PDFiumModule | null = null;
  private docPtr: number | null = null;
  private dataPtr: number | null = null;

  public async ensureInitialized(): Promise<void> {
    if (!this.pdfiumModule) {
      this.pdfiumModule = await createPdfiumModule();
      this.pdfiumModule._PDFium_Init();
    }
  }

  public destroy(): void {
    if (this.pdfiumModule) {
      if (this.docPtr) {
        this.pdfiumModule._PDFium_CloseDocument(this.docPtr);
        this.docPtr = null;
      }
      if (this.dataPtr) {
        this.pdfiumModule._free(this.dataPtr);
        this.dataPtr = null;
      }
    }
  }

  public async loadFile(file: File): Promise<void> {
    await this.ensureInitialized();
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Allocate memory and copy PDF data
    if (this.pdfiumModule) {
      const dataPtr = this.pdfiumModule._malloc(data.length);
      this.pdfiumModule.HEAPU8.set(data, dataPtr);

      // Allocate memory for password string (empty password for now)
      const password = ''; // TODO: Add password input support if needed
      const encoder = new TextEncoder();
      const passwordBytes = encoder.encode(password);
      const passwordBytesSize = passwordBytes.length + 1; // +1 for null terminator
      const passwordPtr = this.pdfiumModule._malloc(passwordBytesSize);
      this.pdfiumModule.HEAPU8.set(passwordBytes, passwordPtr);
      this.pdfiumModule.HEAPU8[passwordPtr + passwordBytes.length] = 0; // null terminator

      // Load the document
      const docPtr = this.pdfiumModule._PDFium_LoadMemDocument(dataPtr, data.length, passwordPtr);
      this.pdfiumModule._free(passwordPtr);

      if (!docPtr) {
        this.pdfiumModule._free(dataPtr);
        const errorCode = this.pdfiumModule._PDFium_GetLastError();
        throw new Error(`Failed to load PDF (error code: ${errorCode})`);
      }

      // Store pointers for later use
      this.docPtr = docPtr;
      this.dataPtr = dataPtr;
      return Promise.resolve();
    }
  }

  public getPageCount(): number {
    if (!this.pdfiumModule || !this.docPtr) {
      return 0;
    }
    return this.pdfiumModule._PDFium_GetPageCount(this.docPtr);
  }

  public renderPdf(canvas: HTMLCanvasElement, options: IRenderOptions = {}): void {
    if (!this.pdfiumModule || !this.docPtr) {
      throw new Error('PDF not loaded. Call loadFile() first.');
    }

    const { pageIndex = 0, scale = 1.0 } = options;
    const pdfium = this.pdfiumModule;

    // Load the page
    const pagePtr = pdfium._PDFium_LoadPage(this.docPtr, pageIndex);
    if (!pagePtr) {
      throw new Error(`Failed to load page ${pageIndex}`);
    }

    try {
      // Get page dimensions
      const pageWidth = pdfium._PDFium_GetPageWidth(pagePtr);
      const pageHeight = pdfium._PDFium_GetPageHeight(pagePtr);

      // Calculate scaled dimensions
      const width = Math.floor(pageWidth * scale);
      const height = Math.floor(pageHeight * scale);

      // Set canvas size
      canvas.width = width;
      canvas.height = height;

      // Create bitmap
      const bitmapPtr = pdfium._PDFium_BitmapCreate(width, height, 1);
      if (!bitmapPtr) {
        throw new Error('Failed to create bitmap');
      }

      try {
        // Fill with white background (BGRA format: 0xffffffff)
        pdfium._PDFium_BitmapFillRect(bitmapPtr, 0, 0, width, height, 0xffffffff);

        // Render page to bitmap
        // flags: 0 = normal rendering
        pdfium._PDFium_RenderPageBitmap(bitmapPtr, pagePtr, 0, 0, width, height, 0, 0);

        // Get bitmap buffer
        const bufferPtr = pdfium._PDFium_BitmapGetBuffer(bitmapPtr);
        const stride = pdfium._PDFium_BitmapGetStride(bitmapPtr);

        // Copy bitmap data to canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas 2D context');
        }

        const imageData = ctx.createImageData(width, height);
        const src = pdfium.HEAPU8.subarray(bufferPtr, bufferPtr + stride * height);

        // Convert BGRA to RGBA
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const srcIdx = y * stride + x * 4;
            const dstIdx = (y * width + x) * 4;
            imageData.data[dstIdx + 0] = src[srcIdx + 2]; // R <- B
            imageData.data[dstIdx + 1] = src[srcIdx + 1]; // G <- G
            imageData.data[dstIdx + 2] = src[srcIdx + 0]; // B <- R
            imageData.data[dstIdx + 3] = src[srcIdx + 3]; // A <- A
          }
        }

        ctx.putImageData(imageData, 0, 0);
      } finally {
        pdfium._PDFium_BitmapDestroy(bitmapPtr);
      }
    } finally {
      pdfium._PDFium_ClosePage(pagePtr);
    }
  }
}
