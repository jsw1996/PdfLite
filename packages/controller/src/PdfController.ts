/// <reference lib="dom" />
import {
  type IPDFiumModule,
  createPdfiumModule,
  FPDF_ANNOTATION_SUBTYPE,
  FPDFANNOT_COLORTYPE,
} from '@pdfviewer/pdfium-wasm';

/**
 * PDFium render flags for FPDF_RenderPageBitmap
 * These control rendering quality and what content is included
 */
const FPDF_RENDER_FLAGS = {
  /** Render annotations on the page */
  ANNOT: 0x01,
  /** Use LCD text rendering for crisper text on LCD displays */
  LCD_TEXT: 0x02,
  /** Combined flags for high-quality screen rendering */
  DEFAULT: 0x01 | 0x02, // ANNOT + LCD_TEXT
};

export interface IPoint {
  x: number;
  y: number;
}

export interface INativeAnnotation {
  id: string;
  subtype: number;
  // canvas 坐标（像素坐标，和 renderPdf 的 scale 一致）
  shape: 'stroke' | 'polygon';
  points: IPoint[];
  color: { r: number; g: number; b: number; a: number };
  strokeWidth: number;
  /** For LINK annotations: external URI (if present) */
  uri?: string;
  /** For LINK annotations: internal destination page index (0-based) */
  destPageIndex?: number;
}

export interface IRenderOptions {
  pageIndex?: number;
  scale?: number;
  pixelRatio?: number;
  /** AbortSignal for cancelling progressive rendering */
  signal?: AbortSignal;
}

export interface IPageDimension {
  width: number;
  height: number;
}

/** Represents a text rectangle with its content and font properties */
export interface ITextRect {
  /** The actual text content within this rect */
  content: string;
  /** Rect position in page coordinates (top-left origin, unscaled) */
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  /** Font information */
  font: {
    family: string;
    size: number;
  };
}

/** Represents text content for a page */
export interface IPageTextContent {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  textRects: ITextRect[];
}

export interface ISearchResult {
  pageIndex: number;
  matchIndex: number;
  rects: { left: number; top: number; width: number; height: number }[];
  text: string;
}

export interface IPdfController {
  ensureInitialized(): Promise<void>;
  loadFile(file: File, opts?: { signal?: AbortSignal }): Promise<void>;
  /** Render a PDF page to canvas. Supports AbortSignal for cancellation when using progressive rendering. */
  renderPdf(canvas: HTMLCanvasElement, options?: IRenderOptions): Promise<void>;
  getPageDimension(pageIndex: number): IPageDimension;
  listNativeAnnotations(pageIndex: number, opts: { scale: number }): INativeAnnotation[];
  addInkHighlight(pageIndex: number, opts: { scale: number; canvasPoints: IPoint[] }): void;
  addHighlightAnnotation(
    pageIndex: number,
    opts: {
      scale: number;
      canvasRect: { left: number; top: number; width: number; height: number };
    },
  ): void;
  addLinkAnnotation(
    pageIndex: number,
    opts: {
      scale: number;
      canvasRect: { left: number; top: number; width: number; height: number };
      uri: string;
    },
  ): void;
  addTextAnnotation(
    pageIndex: number,
    opts: {
      scale: number;
      canvasRect: { left: number; top: number; width: number; height: number };
      text: string;
      fontSize?: number;
      fontColor?: { r: number; g: number; b: number };
    },
  ): void;
  exportPdfBytes(options?: { flags?: number; version?: number }): Uint8Array;
  downloadPdf(filename?: string, options?: { flags?: number; version?: number }): void;
  getPageCount(): number;
  getPageTextContent(pageIndex: number): IPageTextContent | null;
  destroy(): void;
  setFontMap(map: Record<string, string>): void;
  searchText(text: string, opts?: { scale?: number }): ISearchResult[];
}

export class PdfController implements IPdfController {
  private pdfiumModule: IPDFiumModule | null = null;
  private docPtr: number | null = null;
  private dataPtr: number | null = null;
  private initPromise: Promise<void> | null = null;
  private loadSeq = 0;
  private fontMap = new Map<string, string>();
  private static utf8Decoder = new TextDecoder('utf-8');

  /** Allocate a null-terminated UTF-8 string in WASM memory. Caller must free. */
  private allocUtf8(s: string): number {
    const { pdfium } = this.requireDoc();
    const len = pdfium.lengthBytesUTF8(s) + 1;
    const ptr = pdfium._malloc(len);
    pdfium.stringToUTF8(s, ptr, len);
    return ptr;
  }

  /** Allocate a null-terminated UTF-16LE string in WASM memory. Caller must free. */
  private allocUtf16(s: string): number {
    const { pdfium } = this.requireDoc();
    const len = (s.length + 1) * 2;
    const ptr = pdfium._malloc(len);
    pdfium.stringToUTF16(s, ptr, len);
    return ptr;
  }

  /**
   * Convert a page-coordinate rect to device-coordinate rect.
   * @returns { left, top, width, height } in device coordinates
   */
  private pageRectToDeviceRect(
    pagePtr: number,
    pageLeft: number,
    pageTop: number,
    pageRight: number,
    pageBottom: number,
    deviceWidth: number,
    deviceHeight: number,
  ): { left: number; top: number; width: number; height: number } {
    const { pdfium } = this.requireDoc();
    const deviceXPtr = pdfium._malloc(4);
    const deviceYPtr = pdfium._malloc(4);

    try {
      // Convert top-left corner
      pdfium._PDFium_PageToDevice(
        pagePtr,
        0,
        0,
        deviceWidth,
        deviceHeight,
        0,
        pageLeft,
        pageTop,
        deviceXPtr,
        deviceYPtr,
      );
      const deviceLeft = pdfium.getValue(deviceXPtr, 'i32');
      const deviceTop = pdfium.getValue(deviceYPtr, 'i32');

      // Convert bottom-right corner
      pdfium._PDFium_PageToDevice(
        pagePtr,
        0,
        0,
        deviceWidth,
        deviceHeight,
        0,
        pageRight,
        pageBottom,
        deviceXPtr,
        deviceYPtr,
      );
      const deviceRight = pdfium.getValue(deviceXPtr, 'i32');
      const deviceBottom = pdfium.getValue(deviceYPtr, 'i32');

      return {
        left: Math.min(deviceLeft, deviceRight),
        top: Math.min(deviceTop, deviceBottom),
        width: Math.abs(deviceRight - deviceLeft),
        height: Math.abs(deviceBottom - deviceTop),
      };
    } finally {
      pdfium._free(deviceXPtr);
      pdfium._free(deviceYPtr);
    }
  }

  private readUtf8Z(ptr: number, maxBytes: number): string {
    const { pdfium } = this.requireDoc();
    if (!ptr || maxBytes <= 0) return '';
    const heap = pdfium.HEAPU8;
    const end = Math.min(heap.length, ptr + maxBytes);
    let nul = ptr;
    while (nul < end && heap[nul] !== 0) nul++;
    if (nul <= ptr) return '';
    return PdfController.utf8Decoder.decode(heap.subarray(ptr, nul));
  }

  public setFontMap(map: Record<string, string>): void {
    Object.entries(map).forEach(([family, url]) => {
      this.fontMap.set(family, url);
    });
  }

  private requireDoc(): { pdfium: IPDFiumModule; docPtr: number } {
    const pdfium = this.pdfiumModule;
    const docPtr = this.docPtr;
    if (!pdfium || !docPtr) {
      throw new Error('PDF not loaded. Call loadFile() first.');
    }
    return { pdfium, docPtr };
  }

  private withPage<T>(pageIndex: number, fn: (pdfium: IPDFiumModule, pagePtr: number) => T): T {
    const { pdfium, docPtr } = this.requireDoc();
    const pagePtr = pdfium._PDFium_LoadPage(docPtr, pageIndex);
    if (!pagePtr) throw new Error(`Failed to load page ${pageIndex}`);
    try {
      return fn(pdfium, pagePtr);
    } finally {
      pdfium._PDFium_ClosePage(pagePtr);
    }
  }

  private pageToCanvasPoint(
    pagePtr: number,
    pageW: number,
    pageH: number,
    scale: number,
    x: number,
    y: number,
  ): IPoint {
    const { pdfium } = this.requireDoc();
    // Use PDFium's PageToDevice API for accurate coordinate conversion
    const deviceWidth = Math.round(pageW * scale);
    const deviceHeight = Math.round(pageH * scale);

    const deviceXPtr = pdfium._malloc(4);
    const deviceYPtr = pdfium._malloc(4);
    try {
      pdfium._PDFium_PageToDevice(
        pagePtr,
        0,
        0,
        deviceWidth,
        deviceHeight,
        0, // rotate = 0
        x,
        y,
        deviceXPtr,
        deviceYPtr,
      );
      return {
        x: pdfium.getValue(deviceXPtr, 'i32'),
        y: pdfium.getValue(deviceYPtr, 'i32'),
      };
    } finally {
      pdfium._free(deviceXPtr);
      pdfium._free(deviceYPtr);
    }
  }

  private canvasToPagePoint(
    pagePtr: number,
    pageW: number,
    pageH: number,
    scale: number,
    x: number,
    y: number,
  ): IPoint {
    const { pdfium } = this.requireDoc();
    // Use PDFium's DeviceToPage API for accurate coordinate conversion
    const deviceWidth = Math.round(pageW * scale);
    const deviceHeight = Math.round(pageH * scale);

    const pageXPtr = pdfium._malloc(8); // double
    const pageYPtr = pdfium._malloc(8); // double
    try {
      pdfium._PDFium_DeviceToPage(
        pagePtr,
        0,
        0,
        deviceWidth,
        deviceHeight,
        0, // rotate = 0
        Math.round(x),
        Math.round(y),
        pageXPtr,
        pageYPtr,
      );
      return {
        x: pdfium.getValue(pageXPtr, 'double'),
        y: pdfium.getValue(pageYPtr, 'double'),
      };
    } finally {
      pdfium._free(pageXPtr);
      pdfium._free(pageYPtr);
    }
  }

  // single-flight pattern to ensure only one instance of the PDFium module is created
  public ensureInitialized(): Promise<void> {
    if (this.pdfiumModule) return Promise.resolve();
    this.initPromise ??= (async () => {
      this.pdfiumModule = await createPdfiumModule();
      this.pdfiumModule._PDFium_Init();
    })();
    return this.initPromise;
  }

  private closeCurrentDocument(): void {
    if (!this.pdfiumModule) return;
    if (this.docPtr) {
      this.pdfiumModule._PDFium_CloseDocument(this.docPtr);
      this.docPtr = null;
    }
    if (this.dataPtr) {
      this.pdfiumModule._free(this.dataPtr);
      this.dataPtr = null;
    }
  }

  public destroy(): void {
    // invalidate any in-flight loads
    this.loadSeq++;
    this.closeCurrentDocument();
  }

  public async loadFile(file: File, opts?: { signal?: AbortSignal }): Promise<void> {
    await this.ensureInitialized();
    const pdfium = this.pdfiumModule;
    if (!pdfium) {
      throw new Error('PDFium module not initialized');
    }

    const mySeq = ++this.loadSeq;
    const signal = opts?.signal;
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // If a newer load started while we were awaiting, ignore this one.
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (mySeq !== this.loadSeq) {
      return;
    }

    // Close any previously loaded document before loading a new one.
    this.closeCurrentDocument();

    // Allocate memory and copy PDF data
    const dataPtr = pdfium._malloc(data.length);
    pdfium.HEAPU8.set(data, dataPtr);

    // Allocate memory for password string (empty password for now)
    const password = ''; // TODO: Add password input support if needed
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    const passwordBytesSize = passwordBytes.length + 1; // +1 for null terminator
    const passwordPtr = pdfium._malloc(passwordBytesSize);
    pdfium.HEAPU8.set(passwordBytes, passwordPtr);
    pdfium.HEAPU8[passwordPtr + passwordBytes.length] = 0; // null terminator

    // Load the document
    const docPtr = pdfium._PDFium_LoadMemDocument(dataPtr, data.length, passwordPtr);
    pdfium._free(passwordPtr);

    if (!docPtr) {
      pdfium._free(dataPtr);
      const errorCode = pdfium._PDFium_GetLastError();
      throw new Error(`Failed to load PDF (error code: ${errorCode})`);
    }

    // If aborted or superseded after we loaded docPtr, cleanup and exit.
    if (signal?.aborted || mySeq !== this.loadSeq) {
      pdfium._PDFium_CloseDocument(docPtr);
      pdfium._free(dataPtr);
      return;
    }

    // Store pointers for later use (commit last, to avoid race conditions).
    this.docPtr = docPtr;
    this.dataPtr = dataPtr;
    return;
  }

  public getPageCount(): number {
    if (!this.pdfiumModule || !this.docPtr) {
      return 0;
    }
    return this.pdfiumModule._PDFium_GetPageCount(this.docPtr);
  }

  public getPageDimension(pageIndex: number): IPageDimension {
    if (!this.pdfiumModule || !this.docPtr) {
      throw new Error('PDF not loaded. Call loadFile() first.');
    }

    return this.withPage(pageIndex, (pdfium, pagePtr) => {
      const width = pdfium._PDFium_GetPageWidth(pagePtr);
      const height = pdfium._PDFium_GetPageHeight(pagePtr);
      return { width, height };
    });
  }

  public async renderPdf(canvas: HTMLCanvasElement, options: IRenderOptions = {}): Promise<void> {
    if (!this.pdfiumModule || !this.docPtr) {
      throw new Error('PDF not loaded. Call loadFile() first.');
    }

    const { pageIndex = 0, scale = 1.0, pixelRatio = 1.0, signal } = options;
    const pdfium = this.pdfiumModule;

    // Check if already aborted
    if (signal?.aborted) {
      throw new DOMException('Render aborted', 'AbortError');
    }

    // Load the page
    const pagePtr = pdfium._PDFium_LoadPage(this.docPtr, pageIndex);
    if (!pagePtr) {
      throw new Error(`Failed to load page ${pageIndex} - docPtr: ${this.docPtr}`);
    }

    try {
      // Get page dimensions
      const pageWidth = pdfium._PDFium_GetPageWidth(pagePtr);
      const pageHeight = pdfium._PDFium_GetPageHeight(pagePtr);

      // Calculate logical dimensions (CSS pixels)
      // IMPORTANT: avoid rounding here; rounding changes the effective scale and causes
      // selection/text-layer drift that increases with distance down the page.
      const logicalWidth = pageWidth * scale;
      const logicalHeight = pageHeight * scale;

      // Calculate physical dimensions (Device pixels)
      const width = Math.max(1, Math.round(logicalWidth * pixelRatio));
      const height = Math.max(1, Math.round(logicalHeight * pixelRatio));

      // Set canvas size (physical pixels)
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

        // Use progressive rendering if AbortSignal is provided
        if (signal) {
          await this.renderPageProgressive(pdfium, bitmapPtr, pagePtr, width, height, signal);
        } else {
          // Synchronous render (original behavior for backwards compatibility)
          pdfium._PDFium_RenderPageBitmap(
            bitmapPtr,
            pagePtr,
            0,
            0,
            width,
            height,
            0,
            FPDF_RENDER_FLAGS.DEFAULT,
          );
        }

        // Check if aborted before copying to canvas
        if (signal?.aborted) {
          throw new DOMException('Render aborted', 'AbortError');
        }

        // Get bitmap buffer
        const bufferPtr = pdfium._PDFium_BitmapGetBuffer(bitmapPtr);
        const stride = pdfium._PDFium_BitmapGetStride(bitmapPtr);

        // Copy bitmap data to canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas 2D context');
        }
        // Disable image smoothing for crisp pixel-perfect rendering
        ctx.imageSmoothingEnabled = false;

        const imageData = ctx.createImageData(width, height);
        const dst32 = new Uint32Array(imageData.data.buffer);

        // Convert BGRA to RGBA using Uint32Array for ~10-50x faster performance
        // Fast path: no stride padding and 4-byte aligned memory (common case)
        if (stride === width * 4 && bufferPtr % 4 === 0) {
          const src32 = new Uint32Array(pdfium.HEAPU8.buffer, bufferPtr, width * height);
          for (let i = 0, len = src32.length; i < len; i++) {
            const pixel = src32[i];
            // BGRA -> RGBA: swap R and B, keep G and A in place
            dst32[i] = (pixel & 0xff00ff00) | ((pixel >> 16) & 0xff) | ((pixel & 0xff) << 16);
          }
        } else {
          // Fallback: handle stride padding or unaligned memory
          const src = pdfium.HEAPU8.subarray(bufferPtr, bufferPtr + stride * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const srcIdx = y * stride + x * 4;
              const dstIdx = y * width + x;
              dst32[dstIdx] =
                src[srcIdx + 2] | // R
                (src[srcIdx + 1] << 8) | // G
                (src[srcIdx + 0] << 16) | // B
                (src[srcIdx + 3] << 24); // A
            }
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

  /**
   * Progressive rendering with cancellation support.
   * Renders the page in chunks, yielding to the event loop periodically to check for cancellation.
   */
  private async renderPageProgressive(
    pdfium: IPDFiumModule,
    bitmapPtr: number,
    pagePtr: number,
    width: number,
    height: number,
    signal: AbortSignal,
  ): Promise<void> {
    // FPDF_RENDER_STATUS values (CYCLIC=1, DONE=2, TOBECONTINUED=3, FAILED=4)
    const RENDER_DONE = 2;
    const RENDER_FAILED = 4;

    // Set up abort handler to set the cancel flag
    const onAbort = () => {
      pdfium._PDFium_SetRenderCancelFlag(1);
    };
    signal.addEventListener('abort', onAbort);

    try {
      // Reset cancel flag before starting
      pdfium._PDFium_SetRenderCancelFlag(0);

      // Start progressive rendering
      let status = pdfium._PDFium_RenderPageBitmap_Start(
        bitmapPtr,
        pagePtr,
        0,
        0,
        width,
        height,
        0,
        FPDF_RENDER_FLAGS.DEFAULT,
      );

      // Continue rendering until done, failed, or cancelled
      while (status !== RENDER_DONE && status !== RENDER_FAILED) {
        // Check if aborted
        if (signal.aborted) {
          // Close progressive rendering to release resources
          pdfium._PDFium_RenderPage_Close(pagePtr);
          throw new DOMException('Render aborted', 'AbortError');
        }

        // Yield to event loop to allow UI updates and abort signal processing
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Continue rendering
        status = pdfium._PDFium_RenderPage_Continue(pagePtr);
      }

      // Close progressive rendering
      pdfium._PDFium_RenderPage_Close(pagePtr);

      if (status === RENDER_FAILED) {
        throw new Error('Progressive rendering failed');
      }

      // Check if cancelled during final phase
      if (signal.aborted) {
        throw new DOMException('Render aborted', 'AbortError');
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      // Reset cancel flag
      pdfium._PDFium_SetRenderCancelFlag(0);
    }
  }

  /**
   * Get text content as layout-aware rectangles for a page.
   * Uses FPDFText_CountRects / FPDFText_GetRect / FPDFText_GetBoundedText.
   * Merges adjacent rects on the same line into larger spans.
   */
  public getPageTextContent(pageIndex: number): IPageTextContent | null {
    if (!this.pdfiumModule || !this.docPtr) {
      return null;
    }

    const pdfium = this.pdfiumModule;

    const pagePtr = pdfium._PDFium_LoadPage(this.docPtr, pageIndex);
    if (!pagePtr) {
      return null;
    }

    try {
      const pageWidth = pdfium._PDFium_GetPageWidth(pagePtr);
      const pageHeight = pdfium._PDFium_GetPageHeight(pagePtr);

      const textPagePtr = pdfium._PDFium_LoadPageText(pagePtr);
      if (!textPagePtr) {
        return { pageIndex, pageWidth, pageHeight, textRects: [] };
      }

      try {
        // Build rect list for entire page
        const rectsCount = pdfium._PDFium_CountRects(textPagePtr, 0, -1);

        const textRects: ITextRect[] = [];

        // Allocate output pointers for rect coords (doubles)
        const leftPtr = pdfium._malloc(8);
        const topPtr = pdfium._malloc(8);
        const rightPtr = pdfium._malloc(8);
        const bottomPtr = pdfium._malloc(8);

        // Use page dimensions as device size (1:1 mapping, no scaling here)
        const deviceWidth = Math.round(pageWidth);
        const deviceHeight = Math.round(pageHeight);

        try {
          for (let i = 0; i < rectsCount; i++) {
            const ok = pdfium._PDFium_GetRect(textPagePtr, i, leftPtr, topPtr, rightPtr, bottomPtr);
            if (!ok) {
              continue;
            }

            const left = pdfium.getValue(leftPtr, 'double');
            const top = pdfium.getValue(topPtr, 'double');
            const right = pdfium.getValue(rightPtr, 'double');
            const bottom = pdfium.getValue(bottomPtr, 'double');

            // Convert page rect to device coordinates
            const deviceRect = this.pageRectToDeviceRect(
              pagePtr,
              left,
              top,
              right,
              bottom,
              deviceWidth,
              deviceHeight,
            );

            // Get the text content within this rect (using original page coords)
            const utf16Length = pdfium._PDFium_GetBoundedText(
              textPagePtr,
              left,
              top,
              right,
              bottom,
              0,
              0,
            );

            if (utf16Length <= 0) {
              continue;
            }

            // Allocate buffer for UTF-16 text (+1 for null terminator, *2 for UTF-16)
            const bytesCount = (utf16Length + 1) * 2;
            const textBuffer = pdfium._malloc(bytesCount);

            pdfium._PDFium_GetBoundedText(
              textPagePtr,
              left,
              top,
              right,
              bottom,
              textBuffer,
              utf16Length,
            );

            // Decode UTF-16LE to string
            const u16Array = new Uint16Array(pdfium.HEAPU8.buffer, textBuffer, utf16Length);
            const content = String.fromCharCode(...u16Array);
            pdfium._free(textBuffer);

            if (!content.trim()) {
              continue;
            }

            // Get font info via char index at this position
            const charIndex = pdfium._PDFium_GetCharIndexAtPos(textPagePtr, left, top, 2, 2);

            let fontFamily = '';
            let fontSize = Math.abs(top - bottom);

            if (charIndex >= 0) {
              fontSize = pdfium._PDFium_GetFontSize(textPagePtr, charIndex);

              // Get font name length first
              const fontNameLength = pdfium._PDFium_GetFontInfo(textPagePtr, charIndex, 0, 0, 0);

              if (fontNameLength > 0) {
                const fontBufSize = fontNameLength + 1;
                const fontNameBuffer = pdfium._malloc(fontBufSize);
                const flagsPtr = pdfium._malloc(4);

                pdfium._PDFium_GetFontInfo(
                  textPagePtr,
                  charIndex,
                  fontNameBuffer,
                  fontBufSize,
                  flagsPtr,
                );

                const nameBytes = pdfium.HEAPU8.subarray(
                  fontNameBuffer,
                  fontNameBuffer + fontNameLength,
                );
                fontFamily = new TextDecoder().decode(nameBytes);
                // Remove PDF font subset prefix (e.g., "ABCDEF+")
                fontFamily = fontFamily.replace(/^[A-Z]{6}\+/, '');

                pdfium._free(fontNameBuffer);
                pdfium._free(flagsPtr);
              }
            }

            textRects.push({
              content,
              rect: deviceRect,
              font: {
                family: fontFamily,
                size: fontSize,
              },
            });
          }
        } finally {
          pdfium._free(leftPtr);
          pdfium._free(topPtr);
          pdfium._free(rightPtr);
          pdfium._free(bottomPtr);
        }

        // Merge adjacent rects on the same line with similar font properties
        const mergedRects = this.mergeAdjacentTextRects(textRects);

        return { pageIndex, pageWidth, pageHeight, textRects: mergedRects };
      } finally {
        pdfium._PDFium_ClosePageText(textPagePtr);
      }
    } finally {
      pdfium._PDFium_ClosePage(pagePtr);
    }
  }

  /**
   * Merge adjacent text rects that are on the same line and have similar font properties.
   * This handles PDFs where text is stored character-by-character.
   */
  private mergeAdjacentTextRects(rects: ITextRect[]): ITextRect[] {
    if (rects.length === 0) return [];

    const merged: ITextRect[] = [];
    let current = { ...rects[0] };

    for (let i = 1; i < rects.length; i++) {
      const next = rects[i];

      // Check if rects are on the same line (similar top position)
      const sameBaseline = Math.abs(current.rect.top - next.rect.top) < current.rect.height;

      // Check if horizontally adjacent (with small tolerance for spacing)
      const currentRight = current.rect.left + current.rect.width;
      const gap = next.rect.left - currentRight;
      const isAdjacent = gap < current.font.size * 0.5;

      if (sameBaseline && isAdjacent) {
        // Merge: extend current rect and append content
        current.content += next.content;
        current.rect.width = next.rect.left + next.rect.width - current.rect.left;
        // Extend height to cover both rects
        const currentBottom = current.rect.top + current.rect.height;
        const nextBottom = next.rect.top + next.rect.height;
        const minTop = Math.min(current.rect.top, next.rect.top);
        const maxBottom = Math.max(currentBottom, nextBottom);
        current.rect.top = minTop;
        current.rect.height = maxBottom - minTop;
      } else {
        // Push current and start new
        merged.push(current);
        current = { ...next };
      }
    }

    // Don't forget the last one
    merged.push(current);

    return merged;
  }

  public listNativeAnnotations(pageIndex: number, opts: { scale: number }): INativeAnnotation[] {
    const { scale } = opts;
    const { docPtr } = this.requireDoc();
    return this.withPage(pageIndex, (pdfium, pagePtr) => {
      const pageW = pdfium._PDFium_GetPageWidth(pagePtr);
      const pageH = pdfium._PDFium_GetPageHeight(pagePtr);

      const count = pdfium._FPDFPage_GetAnnotCount_W(pagePtr);
      const out: INativeAnnotation[] = [];

      const rectPtr = pdfium._malloc(4 * 4); // FS_RECTF: left,bottom,right,top float
      const rPtr = pdfium._malloc(4);
      const gPtr = pdfium._malloc(4);
      const bPtr = pdfium._malloc(4);
      const aPtr = pdfium._malloc(4);
      const borderWPtr = pdfium._malloc(4);
      const quadPtr = pdfium._malloc(8 * 4); // FS_QUADPOINTSF: 8 floats

      try {
        for (let i = 0; i < count; i++) {
          const annot = pdfium._FPDFPage_GetAnnot_W(pagePtr, i);
          if (!annot) continue;
          try {
            const subtype = pdfium._FPDFAnnot_GetSubtype_W(annot) as FPDF_ANNOTATION_SUBTYPE;

            // color
            pdfium.setValue(rPtr, 0, 'i32');
            pdfium.setValue(gPtr, 0, 'i32');
            pdfium.setValue(bPtr, 0, 'i32');
            pdfium.setValue(aPtr, 255, 'i32');
            pdfium._FPDFAnnot_GetColor_W(annot, FPDFANNOT_COLORTYPE.COLOR, rPtr, gPtr, bPtr, aPtr);
            const color = {
              r: pdfium.getValue(rPtr, 'i32'),
              g: pdfium.getValue(gPtr, 'i32'),
              b: pdfium.getValue(bPtr, 'i32'),
              a: pdfium.getValue(aPtr, 'i32'),
            };

            // border width
            pdfium.setValue(borderWPtr, 2, 'float');
            pdfium._FPDFAnnot_GetBorder_W(annot, 0, 0, borderWPtr);
            const strokeWidth = pdfium.getValue(borderWPtr, 'float') ?? 2;

            if (subtype === FPDF_ANNOTATION_SUBTYPE.INK) {
              const pathCount = pdfium._FPDFAnnot_GetInkListCount_W(annot);
              for (let p = 0; p < pathCount; p++) {
                // 先用“一个大 buffer”试探读取：length 参数是点数量；这里我们先读 1024 点（够用），返回值会告诉我们实际写入了多少点（若 pdfium 实现如此）
                // 如果以后需要更严谨，可增加“先查长度”的 wrapper。
                const maxPts = 1024;
                const bufPtr = pdfium._malloc(maxPts * 2 * 4); // FS_POINTF * maxPts
                try {
                  const written = pdfium._FPDFAnnot_GetInkListPath_W(annot, p, bufPtr, maxPts);
                  const n = Math.max(0, Math.min(maxPts, written | 0));
                  const pts: IPoint[] = [];
                  for (let k = 0; k < n; k++) {
                    const x = pdfium.HEAPF32[bufPtr / 4 + k * 2 + 0];
                    const y = pdfium.HEAPF32[bufPtr / 4 + k * 2 + 1];
                    pts.push(this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, x, y));
                  }
                  if (pts.length) {
                    out.push({
                      id: `native-${pageIndex}-ink-${i}-${p}`,
                      subtype,
                      shape: 'stroke',
                      points: pts,
                      color,
                      strokeWidth: strokeWidth * scale,
                    });
                  }
                } finally {
                  pdfium._free(bufPtr);
                }
              }
              continue;
            }

            if (subtype === FPDF_ANNOTATION_SUBTYPE.HIGHLIGHT) {
              const has = pdfium._FPDFAnnot_HasAttachmentPoints_W(annot);
              if (!has) continue;
              const qCount = pdfium._FPDFAnnot_CountAttachmentPoints_W(annot);
              for (let q = 0; q < qCount; q++) {
                const ok = pdfium._FPDFAnnot_GetAttachmentPoints_W(annot, q, quadPtr);
                if (!ok) continue;
                const floats = pdfium.HEAPF32.subarray(quadPtr / 4, quadPtr / 4 + 8);

                const quadPoints: IPoint[] = [
                  this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, floats[0], floats[1]), // TL
                  this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, floats[2], floats[3]), // TR
                  this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, floats[6], floats[7]), // BR
                  this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, floats[4], floats[5]), // BL
                ];
                out.push({
                  id: `native-${pageIndex}-hl-${i}-${q}`,
                  subtype,
                  shape: 'polygon',
                  points: quadPoints,
                  color,
                  strokeWidth: 0,
                });
              }
              continue;
            }

            if (subtype === FPDF_ANNOTATION_SUBTYPE.LINK) {
              // Link annotations are usually represented by a rect; action/URI is on the link handle.
              let uri: string | undefined;
              let destPageIndex: number | undefined;

              const link = pdfium._FPDFAnnot_GetLink_W(annot);
              if (link) {
                const action = pdfium._FPDFLink_GetAction_W(link);
                if (action) {
                  // Try URI first (returns required size including NUL)
                  const needed = pdfium._FPDFAction_GetURIPath_W(docPtr, action, 0, 0);
                  if (needed > 1) {
                    const bufPtr = pdfium._malloc(needed);
                    try {
                      pdfium._FPDFAction_GetURIPath_W(docPtr, action, bufPtr, needed);
                      const s = this.readUtf8Z(bufPtr, needed);
                      if (s) uri = s;
                    } finally {
                      pdfium._free(bufPtr);
                    }
                  }

                  // Fallback to destination (internal jump)
                  if (!uri) {
                    const destFromAction = pdfium._FPDFAction_GetDest_W(docPtr, action);
                    if (destFromAction) {
                      const idx = pdfium._PDFium_GetDestPageIndex(docPtr, destFromAction);
                      if (idx >= 0) destPageIndex = idx;
                    }
                  }
                }

                // Some PDFs use link dest directly
                if (!uri && destPageIndex == null) {
                  const dest = pdfium._FPDFLink_GetDest_W(docPtr, link);
                  if (dest) {
                    const idx = pdfium._PDFium_GetDestPageIndex(docPtr, dest);
                    if (idx >= 0) destPageIndex = idx;
                  }
                }
              }

              const gotRect = pdfium._FPDFAnnot_GetRect_W(annot, rectPtr);
              if (!gotRect) continue;
              const f = pdfium.HEAPF32.subarray(rectPtr / 4, rectPtr / 4 + 4);
              const left = f[0];
              const bottom = f[1];
              const right = f[2];
              const top = f[3];
              const poly: IPoint[] = [
                this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, left, top),
                this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, right, top),
                this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, right, bottom),
                this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, left, bottom),
              ];
              out.push({
                id: `native-${pageIndex}-link-${i}`,
                subtype,
                shape: 'polygon',
                points: poly,
                color,
                strokeWidth: 0,
                uri,
                destPageIndex,
              });
              continue;
            }

            // fallback: 尝试用 rect 作为一个 polygon
            const gotRect = pdfium._FPDFAnnot_GetRect_W(annot, rectPtr);
            if (gotRect) {
              const f = pdfium.HEAPF32.subarray(rectPtr / 4, rectPtr / 4 + 4);
              const left = f[0];
              const bottom = f[1];
              const right = f[2];
              const top = f[3];
              const poly: IPoint[] = [
                this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, left, top),
                this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, right, top),
                this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, right, bottom),
                this.pageToCanvasPoint(pagePtr, pageW, pageH, scale, left, bottom),
              ];
              out.push({
                id: `native-${pageIndex}-rect-${i}`,
                subtype,
                shape: 'polygon',
                points: poly,
                color,
                strokeWidth: 0,
              });
            }
          } finally {
            pdfium._FPDFPage_CloseAnnot_W(annot);
          }
        }
      } finally {
        pdfium._free(rectPtr);
        pdfium._free(rPtr);
        pdfium._free(gPtr);
        pdfium._free(bPtr);
        pdfium._free(aPtr);
        pdfium._free(borderWPtr);
        pdfium._free(quadPtr);
      }

      return out;
    });
  }

  public searchText(text: string, opts?: { scale?: number }): ISearchResult[] {
    if (!text) return [];
    const { pdfium } = this.requireDoc();
    const scale = opts?.scale ?? 1;

    const textPtr = this.allocUtf16(text);

    try {
      const results: ISearchResult[] = [];
      const pageCount = this.getPageCount();

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        this.withPage(pageIndex, (pdfium, pagePtr) => {
          const textPagePtr = pdfium._PDFium_LoadPageText(pagePtr);
          if (!textPagePtr) return;

          try {
            // 0 = Case Insensitive
            const searchHandle = pdfium._PDFium_FindStart(textPagePtr, textPtr, 0, 0);
            if (!searchHandle) return;

            try {
              while (pdfium._PDFium_FindNext(searchHandle)) {
                const charIndex = pdfium._PDFium_GetSchResultIndex(searchHandle);
                const charCount = pdfium._PDFium_GetSchCount(searchHandle);

                const pageWidth = pdfium._PDFium_GetPageWidth(pagePtr);
                const pageHeight = pdfium._PDFium_GetPageHeight(pagePtr);

                const rects = this.getTextRects(
                  pagePtr,
                  textPagePtr,
                  charIndex,
                  charCount,
                  pageWidth,
                  pageHeight,
                  scale,
                );

                results.push({
                  pageIndex,
                  matchIndex: results.length,
                  rects,
                  text,
                });
              }
            } finally {
              pdfium._PDFium_FindClose(searchHandle);
            }
          } finally {
            pdfium._PDFium_ClosePageText(textPagePtr);
          }
        });
      }
      return results;
    } finally {
      pdfium._free(textPtr);
    }
  }

  private getTextRects(
    pagePtr: number,
    textPagePtr: number,
    startIndex: number,
    count: number,
    pageWidth: number,
    pageHeight: number,
    scale = 1,
  ): { left: number; top: number; width: number; height: number }[] {
    const { pdfium } = this.requireDoc();
    const rectsCount = pdfium._PDFium_CountRects(textPagePtr, startIndex, count);
    const rects: { left: number; top: number; width: number; height: number }[] = [];

    const leftPtr = pdfium._malloc(8);
    const topPtr = pdfium._malloc(8);
    const rightPtr = pdfium._malloc(8);
    const bottomPtr = pdfium._malloc(8);

    // Use page dimensions scaled as device size
    const deviceWidth = Math.round(pageWidth * scale);
    const deviceHeight = Math.round(pageHeight * scale);

    try {
      for (let i = 0; i < rectsCount; i++) {
        const ok = pdfium._PDFium_GetRect(textPagePtr, i, leftPtr, topPtr, rightPtr, bottomPtr);
        if (!ok) continue;

        const left = pdfium.getValue(leftPtr, 'double');
        const top = pdfium.getValue(topPtr, 'double');
        const right = pdfium.getValue(rightPtr, 'double');
        const bottom = pdfium.getValue(bottomPtr, 'double');

        rects.push(
          this.pageRectToDeviceRect(pagePtr, left, top, right, bottom, deviceWidth, deviceHeight),
        );
      }
    } finally {
      pdfium._free(leftPtr);
      pdfium._free(topPtr);
      pdfium._free(rightPtr);
      pdfium._free(bottomPtr);
    }
    return rects;
  }

  public addInkHighlight(pageIndex: number, opts: { scale: number; canvasPoints: IPoint[] }): void {
    const { scale, canvasPoints } = opts;
    if (canvasPoints.length < 2) return;

    this.withPage(pageIndex, (pdfium, pagePtr) => {
      const pageW = pdfium._PDFium_GetPageWidth(pagePtr);
      const pageH = pdfium._PDFium_GetPageHeight(pagePtr);

      const annot = pdfium._FPDFPage_CreateAnnot_W(pagePtr, FPDF_ANNOTATION_SUBTYPE.INK);
      if (!annot) throw new Error('Failed to create INK annotation');

      try {
        // yellow (rgb 248,196,72)
        pdfium._FPDFAnnot_SetColor_W(annot, FPDFANNOT_COLORTYPE.COLOR, 248, 196, 72, 255);
        // border width in page units: roughly map pixels->page by /scale
        pdfium._FPDFAnnot_SetBorder_W(annot, 0, 0, 14 / scale);

        const ptsPage = canvasPoints.map((p) =>
          this.canvasToPagePoint(pagePtr, pageW, pageH, scale, p.x, p.y),
        );
        const bufPtr = pdfium._malloc(ptsPage.length * 2 * 4);
        try {
          for (let i = 0; i < ptsPage.length; i++) {
            pdfium.HEAPF32[bufPtr / 4 + i * 2 + 0] = ptsPage[i].x;
            pdfium.HEAPF32[bufPtr / 4 + i * 2 + 1] = ptsPage[i].y;
          }
          // FPDFAnnot_AddInkStroke returns the index of the stroke (0-based) on success, -1 on failure
          const strokeIndex = pdfium._FPDFAnnot_AddInkStroke_W(annot, bufPtr, ptsPage.length);
          if (strokeIndex < 0) throw new Error('Failed to add ink stroke');
        } finally {
          pdfium._free(bufPtr);
        }

        // NOTE: 当前 wasm wrapper 未暴露 FPDFPage_GenerateContent，因此这里无法强制生成内容流；
        // 对于很多阅读/渲染路径，annotation 仍能生效，但“保存导出”必须补齐 Save API（见 exportPdfBytes）。
      } finally {
        pdfium._FPDFPage_CloseAnnot_W(annot);
      }
    });
  }

  /**
   * Add a HIGHLIGHT annotation (proper PDF highlight with QuadPoints) for text selection.
   * This creates a standard PDF highlight annotation that will be saved with the document.
   */
  public addHighlightAnnotation(
    pageIndex: number,
    opts: {
      scale: number;
      canvasRect: { left: number; top: number; width: number; height: number };
    },
  ): void {
    const { scale, canvasRect } = opts;
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    this.withPage(pageIndex, (pdfium, pagePtr) => {
      const pageW = pdfium._PDFium_GetPageWidth(pagePtr);
      const pageH = pdfium._PDFium_GetPageHeight(pagePtr);

      const annot = pdfium._FPDFPage_CreateAnnot_W(pagePtr, FPDF_ANNOTATION_SUBTYPE.HIGHLIGHT);
      if (!annot) throw new Error('Failed to create HIGHLIGHT annotation');

      // Allocate memory for FS_RECTF (4 floats) and FS_QUADPOINTSF (8 floats)
      const rectPtr = pdfium._malloc(4 * 4);
      const quadPtr = pdfium._malloc(8 * 4);

      try {
        // Convert canvas coordinates to page coordinates
        const tl = this.canvasToPagePoint(
          pagePtr,
          pageW,
          pageH,
          scale,
          canvasRect.left,
          canvasRect.top,
        );
        const br = this.canvasToPagePoint(
          pagePtr,
          pageW,
          pageH,
          scale,
          canvasRect.left + canvasRect.width,
          canvasRect.top + canvasRect.height,
        );

        const left = Math.min(tl.x, br.x);
        const right = Math.max(tl.x, br.x);
        const bottom = Math.min(tl.y, br.y);
        const top = Math.max(tl.y, br.y);

        // Set annotation rectangle (FS_RECTF: left, bottom, right, top)
        pdfium.HEAPF32[rectPtr / 4 + 0] = left;
        pdfium.HEAPF32[rectPtr / 4 + 1] = bottom;
        pdfium.HEAPF32[rectPtr / 4 + 2] = right;
        pdfium.HEAPF32[rectPtr / 4 + 3] = top;
        const okRect = pdfium._FPDFAnnot_SetRect_W(annot, rectPtr);
        if (!okRect) throw new Error('Failed to set HIGHLIGHT rect');

        // Set QuadPoints for the highlight
        // FS_QUADPOINTSF: x1,y1, x2,y2, x3,y3, x4,y4
        // PDFium uses: (x1,y1)=top-left, (x2,y2)=top-right, (x3,y3)=bottom-left, (x4,y4)=bottom-right
        pdfium.HEAPF32[quadPtr / 4 + 0] = left; // x1 (top-left x)
        pdfium.HEAPF32[quadPtr / 4 + 1] = top; // y1 (top-left y)
        pdfium.HEAPF32[quadPtr / 4 + 2] = right; // x2 (top-right x)
        pdfium.HEAPF32[quadPtr / 4 + 3] = top; // y2 (top-right y)
        pdfium.HEAPF32[quadPtr / 4 + 4] = left; // x3 (bottom-left x)
        pdfium.HEAPF32[quadPtr / 4 + 5] = bottom; // y3 (bottom-left y)
        pdfium.HEAPF32[quadPtr / 4 + 6] = right; // x4 (bottom-right x)
        pdfium.HEAPF32[quadPtr / 4 + 7] = bottom; // y4 (bottom-right y)

        const okQuad = pdfium._FPDFAnnot_AppendAttachmentPoints_W(annot, quadPtr);
        if (!okQuad) throw new Error('Failed to set HIGHLIGHT QuadPoints');

        // Set highlight color (yellow: RGB 248, 196, 72)
        pdfium._FPDFAnnot_SetColor_W(annot, FPDFANNOT_COLORTYPE.COLOR, 248, 196, 72, 255);
      } finally {
        pdfium._free(rectPtr);
        pdfium._free(quadPtr);
        pdfium._FPDFPage_CloseAnnot_W(annot);
      }
    });
  }

  public addLinkAnnotation(
    pageIndex: number,
    opts: {
      scale: number;
      canvasRect: { left: number; top: number; width: number; height: number };
      uri: string;
    },
  ): void {
    const { scale, canvasRect, uri } = opts;
    if (!uri) return;
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    this.withPage(pageIndex, (pdfium, pagePtr) => {
      const pageW = pdfium._PDFium_GetPageWidth(pagePtr);
      const pageH = pdfium._PDFium_GetPageHeight(pagePtr);

      const annot = pdfium._FPDFPage_CreateAnnot_W(pagePtr, FPDF_ANNOTATION_SUBTYPE.LINK);
      if (!annot) throw new Error('Failed to create LINK annotation');

      const rectPtr = pdfium._malloc(4 * 4); // FS_RECTF: left,bottom,right,top float
      const uriPtrMax = Math.max(8, uri.length * 4 + 1);
      const uriPtr = pdfium._malloc(uriPtrMax);
      try {
        const tl = this.canvasToPagePoint(
          pagePtr,
          pageW,
          pageH,
          scale,
          canvasRect.left,
          canvasRect.top,
        );
        const br = this.canvasToPagePoint(
          pagePtr,
          pageW,
          pageH,
          scale,
          canvasRect.left + canvasRect.width,
          canvasRect.top + canvasRect.height,
        );

        const left = Math.min(tl.x, br.x);
        const right = Math.max(tl.x, br.x);
        const bottom = Math.min(tl.y, br.y);
        const top = Math.max(tl.y, br.y);

        pdfium.HEAPF32[rectPtr / 4 + 0] = left;
        pdfium.HEAPF32[rectPtr / 4 + 1] = bottom;
        pdfium.HEAPF32[rectPtr / 4 + 2] = right;
        pdfium.HEAPF32[rectPtr / 4 + 3] = top;
        const okRect = pdfium._FPDFAnnot_SetRect_W(annot, rectPtr);
        if (!okRect) throw new Error('Failed to set LINK rect');

        pdfium.stringToUTF8(uri, uriPtr, uriPtrMax);
        const okUri = pdfium._FPDFAnnot_SetURI_W(annot, uriPtr);
        if (!okUri) throw new Error('Failed to set LINK URI');
      } finally {
        pdfium._free(rectPtr);
        pdfium._free(uriPtr);
        pdfium._FPDFPage_CloseAnnot_W(annot);
      }
    });
  }

  /**
   * Add a FreeText annotation (text box) to the PDF.
   *
   * This method draws the text directly onto the page content stream (flattened),
   * which ensures the text renders correctly in all PDF viewers including Microsoft Edge.
   * This is a compromise compared to using a proper FreeText annotation, because PDFium's
   * API does not provide a complete public API to build a proper FreeText appearance (especially font resources).
   *
   * Note: Flattened text is not editable as an annotation, but renders reliably everywhere.
   *
   * Implementation notes:
   * - PDF coordinate system has origin at bottom-left, Y increases upward
   * - Canvas coordinate system has origin at top-left, Y increases downward
   * - Text is drawn directly on the page, not as an annotation with appearance stream
   */
  public addTextAnnotation(
    pageIndex: number,
    opts: {
      scale: number;
      canvasRect: { left: number; top: number; width: number; height: number };
      text: string;
      fontSize?: number;
      fontColor?: { r: number; g: number; b: number };
    },
  ): void {
    const { scale, canvasRect, text } = opts;
    if (!text || canvasRect.width <= 0 || canvasRect.height <= 0) return;

    const { docPtr } = this.requireDoc();
    const fontSize = opts.fontSize ?? 12;
    const fontColor = opts.fontColor ?? { r: 0, g: 0, b: 0 };

    // Normalize color to 0-255 range
    const r255 = fontColor.r > 1 ? Math.round(fontColor.r) : Math.round(fontColor.r * 255);
    const g255 = fontColor.g > 1 ? Math.round(fontColor.g) : Math.round(fontColor.g * 255);
    const b255 = fontColor.b > 1 ? Math.round(fontColor.b) : Math.round(fontColor.b * 255);

    this.withPage(pageIndex, (pdfium, pagePtr) => {
      const pageW = pdfium._PDFium_GetPageWidth(pagePtr);
      const pageH = pdfium._PDFium_GetPageHeight(pagePtr);

      // Convert canvas rectangle corners to PDF page coordinates
      // Canvas: top-left origin, Y down. PDF: bottom-left origin, Y up.
      const topLeftPage = this.canvasToPagePoint(
        pagePtr,
        pageW,
        pageH,
        scale,
        canvasRect.left,
        canvasRect.top,
      );
      const bottomRightPage = this.canvasToPagePoint(
        pagePtr,
        pageW,
        pageH,
        scale,
        canvasRect.left + canvasRect.width,
        canvasRect.top + canvasRect.height,
      );

      // In PDF coordinates, ensure left < right and bottom < top
      const pdfLeft = Math.min(topLeftPage.x, bottomRightPage.x);
      const pdfBottom = Math.min(topLeftPage.y, bottomRightPage.y);
      const pdfTop = Math.max(topLeftPage.y, bottomRightPage.y);

      const annotHeight = pdfTop - pdfBottom;

      // Track resources for cleanup
      const ptrsToFree: number[] = [];
      let font = 0;
      let textObj = 0;

      try {
        // Load standard Helvetica font
        const fontNamePtr = this.allocUtf8('Helvetica');
        ptrsToFree.push(fontNamePtr);
        font = pdfium._FPDFText_LoadStandardFont_W(docPtr, fontNamePtr);

        if (!font) {
          throw new Error('Failed to load Helvetica font');
        }

        // Create a text page object
        textObj = pdfium._FPDFPageObj_CreateTextObj_W(docPtr, font, fontSize);
        if (!textObj) {
          throw new Error('Failed to create text object');
        }

        // Set the text content
        const textPtr = this.allocUtf16(text);
        ptrsToFree.push(textPtr);
        pdfium._FPDFText_SetText_W(textObj, textPtr);

        // Set fill color (0-255 range)
        pdfium._FPDFPageObj_SetFillColor_W(textObj, r255, g255, b255, 255);

        // Position the text in absolute page coordinates
        // Text baseline is at the bottom of the text, so we add some padding
        const padding = 2;
        const textX = pdfLeft + padding;
        const textY = pdfBottom + (annotHeight - fontSize) / 2;

        // Transform to position (translation matrix)
        pdfium._FPDFPageObj_Transform_W(textObj, 1, 0, 0, 1, textX, textY);

        // Insert the text object into the page content stream
        pdfium._FPDFPage_InsertObject_W(pagePtr, textObj);
        textObj = 0; // Ownership transferred to page

        // Generate the page content to commit the changes
        if (!pdfium._FPDFPage_GenerateContent_W(pagePtr)) {
          throw new Error('Failed to generate page content');
        }
      } finally {
        // Cleanup (only if not transferred)
        if (textObj) pdfium._FPDFPageObj_Destroy_W(textObj);
        if (font) pdfium._FPDFFont_Close_W(font);
        for (const ptr of ptrsToFree) {
          pdfium._free(ptr);
        }
      }
    });
  }

  /**
   * Export the current PDF document as a byte array.
   * This includes any modifications made (annotations, etc.).
   * @param options Optional save options
   * @returns Uint8Array containing the PDF data
   */
  public exportPdfBytes(options?: {
    /** Save flags: 0=default, 1=incremental, 2=no incremental, 3=remove security */
    flags?: number;
    /** PDF version: 14=1.4, 15=1.5, 16=1.6, 17=1.7, 20=2.0 (optional) */
    version?: number;
  }): Uint8Array {
    const { pdfium, docPtr } = this.requireDoc();
    const flags = options?.flags ?? 0;
    const version = options?.version;

    // Save the document to memory
    let size: number;
    if (version !== undefined) {
      size = pdfium._PDFium_SaveToMemoryWithVersion(docPtr, flags, version);
    } else {
      size = pdfium._PDFium_SaveToMemory(docPtr, flags);
    }

    if (size <= 0) {
      const errorCode = pdfium._PDFium_GetLastError();
      throw new Error(`Failed to save PDF (error code: ${errorCode})`);
    }

    // Get pointer to the saved buffer
    const bufferPtr = pdfium._PDFium_GetSaveBuffer();
    if (!bufferPtr) {
      throw new Error('Failed to get save buffer pointer');
    }

    try {
      // Copy the data from WASM memory to a new Uint8Array
      // We must copy because the WASM memory view can become invalid
      const pdfData = new Uint8Array(pdfium.HEAPU8.buffer, bufferPtr, size);
      const result = new Uint8Array(pdfData); // Create a copy
      return result;
    } finally {
      // Always free the save buffer
      pdfium._PDFium_FreeSaveBuffer();
    }
  }

  /**
   * Download the current PDF document as a file.
   * This is a convenience method that exports the PDF and triggers a browser download.
   * @param filename The filename for the downloaded file (default: 'document.pdf')
   * @param options Optional save options
   */
  public downloadPdf(
    filename = 'document.pdf',
    options?: {
      flags?: number;
      version?: number;
    },
  ): void {
    const pdfBytes = this.exportPdfBytes(options);
    const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoke the object URL after a short delay to allow the download to start
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}
