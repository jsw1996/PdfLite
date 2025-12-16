/// <reference lib="dom" />
import {
  type PDFiumModule,
  createPdfiumModule,
  FPDF_ANNOTATION_SUBTYPE,
  FPDFANNOT_COLORTYPE,
} from '@pdfviewer/pdfium-wasm';

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
}

export interface IRenderOptions {
  pageIndex?: number;
  scale?: number;
  pixelRatio?: number;
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

export interface IPdfController {
  ensureInitialized(): Promise<void>;
  loadFile(file: File, opts?: { signal?: AbortSignal }): Promise<void>;
  renderPdf(canvas: HTMLCanvasElement, options?: IRenderOptions): void;
  listNativeAnnotations(pageIndex: number, opts: { scale: number }): INativeAnnotation[];
  addInkHighlight(pageIndex: number, opts: { scale: number; canvasPoints: IPoint[] }): void;
  exportPdfBytes(): Uint8Array;
  getPageCount(): number;
  getPageTextContent(pageIndex: number): IPageTextContent | null;
  destroy(): void;
  setFontMap(map: Record<string, string>): void;
}

export class PdfController implements IPdfController {
  private pdfiumModule: PDFiumModule | null = null;
  private docPtr: number | null = null;
  private dataPtr: number | null = null;
  private initPromise: Promise<void> | null = null;
  private loadSeq = 0;
  private fontMap = new Map<string, string>();

  public setFontMap(map: Record<string, string>): void {
    Object.entries(map).forEach(([family, url]) => {
      this.fontMap.set(family, url);
    });
  }

  private requireDoc(): { pdfium: PDFiumModule; docPtr: number } {
    const pdfium = this.pdfiumModule;
    const docPtr = this.docPtr;
    if (!pdfium || !docPtr) {
      throw new Error('PDF not loaded. Call loadFile() first.');
    }
    return { pdfium, docPtr };
  }

  private withPage<T>(pageIndex: number, fn: (pdfium: PDFiumModule, pagePtr: number) => T): T {
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
    _pageW: number,
    pageH: number,
    scale: number,
    x: number,
    y: number,
  ): IPoint {
    // PDF 坐标系通常原点在左下；bitmap/Canvas 以左上为原点
    return { x: x * scale, y: (pageH - y) * scale };
  }

  private canvasToPagePoint(
    _pageW: number,
    pageH: number,
    scale: number,
    x: number,
    y: number,
  ): IPoint {
    return { x: x / scale, y: pageH - y / scale };
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

  public renderPdf(canvas: HTMLCanvasElement, options: IRenderOptions = {}): void {
    if (!this.pdfiumModule || !this.docPtr) {
      throw new Error('PDF not loaded. Call loadFile() first.');
    }

    const { pageIndex = 0, scale = 1.0, pixelRatio = 1.0 } = options;
    const pdfium = this.pdfiumModule;

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

      // Set canvas CSS size (logical pixels)
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;

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

        // Allocate output pointers for device coords (ints)
        const deviceXPtr = pdfium._malloc(4);
        const deviceYPtr = pdfium._malloc(4);

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

            // Convert top-left corner from page to device coordinates
            pdfium._PDFium_PageToDevice(
              pagePtr,
              0,
              0,
              deviceWidth,
              deviceHeight,
              0, // rotate = 0
              left,
              top,
              deviceXPtr,
              deviceYPtr,
            );
            const deviceLeft = pdfium.getValue(deviceXPtr, 'i32');
            const deviceTop = pdfium.getValue(deviceYPtr, 'i32');

            // Convert bottom-right corner from page to device coordinates
            pdfium._PDFium_PageToDevice(
              pagePtr,
              0,
              0,
              deviceWidth,
              deviceHeight,
              0,
              right,
              bottom,
              deviceXPtr,
              deviceYPtr,
            );
            const deviceRight = pdfium.getValue(deviceXPtr, 'i32');
            const deviceBottom = pdfium.getValue(deviceYPtr, 'i32');

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

            // Convert to device coordinates using PageToDevice result
            textRects.push({
              content,
              rect: {
                left: deviceLeft,
                top: deviceTop,
                width: Math.abs(deviceRight - deviceLeft),
                height: Math.abs(deviceBottom - deviceTop),
              },
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
          pdfium._free(deviceXPtr);
          pdfium._free(deviceYPtr);
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
      const sameBaseline = Math.abs(current.rect.top - next.rect.top) < current.rect.height * 0.5;

      // Check if font properties match
      const sameFont =
        current.font.family === next.font.family &&
        Math.abs(current.font.size - next.font.size) < current.font.size * 0.1;

      // Check if horizontally adjacent (with small tolerance for spacing)
      const currentRight = current.rect.left + current.rect.width;
      const gap = next.rect.left - currentRight;
      const isAdjacent = gap < current.font.size * 0.5;

      if (sameBaseline && sameFont && isAdjacent) {
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
            const strokeWidth = pdfium.getValue(borderWPtr, 'float') || 2;

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
                    pts.push(this.pageToCanvasPoint(pageW, pageH, scale, x, y));
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
                  this.pageToCanvasPoint(pageW, pageH, scale, floats[0], floats[1]), // TL
                  this.pageToCanvasPoint(pageW, pageH, scale, floats[2], floats[3]), // TR
                  this.pageToCanvasPoint(pageW, pageH, scale, floats[6], floats[7]), // BR
                  this.pageToCanvasPoint(pageW, pageH, scale, floats[4], floats[5]), // BL
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

            // fallback: 尝试用 rect 作为一个 polygon
            const gotRect = pdfium._FPDFAnnot_GetRect_W(annot, rectPtr);
            if (gotRect) {
              const f = pdfium.HEAPF32.subarray(rectPtr / 4, rectPtr / 4 + 4);
              const left = f[0];
              const bottom = f[1];
              const right = f[2];
              const top = f[3];
              const poly: IPoint[] = [
                this.pageToCanvasPoint(pageW, pageH, scale, left, top),
                this.pageToCanvasPoint(pageW, pageH, scale, right, top),
                this.pageToCanvasPoint(pageW, pageH, scale, right, bottom),
                this.pageToCanvasPoint(pageW, pageH, scale, left, bottom),
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
          this.canvasToPagePoint(pageW, pageH, scale, p.x, p.y),
        );
        const bufPtr = pdfium._malloc(ptsPage.length * 2 * 4);
        try {
          for (let i = 0; i < ptsPage.length; i++) {
            pdfium.HEAPF32[bufPtr / 4 + i * 2 + 0] = ptsPage[i].x;
            pdfium.HEAPF32[bufPtr / 4 + i * 2 + 1] = ptsPage[i].y;
          }
          const ok = pdfium._FPDFAnnot_AddInkStroke_W(annot, bufPtr, ptsPage.length);
          if (!ok) throw new Error('Failed to add ink stroke');
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

  public exportPdfBytes(): Uint8Array {
    // 当前 pdfium-wasm 构建未暴露 FPDF_SaveAsCopy / FPDF_SaveWithVersion 等保存 API，
    // 因此无法从内存文档导出更新后的 PDF 字节。
    // 需要在 packages/pdfium-wasm/build/pdfium_wasm.cpp 添加 wrapper + 重新编译 wasm。
    throw new Error(
      'exportPdfBytes() 目前不可用：当前 pdfium-wasm 未包含 PDF 保存/导出 wrapper（例如 FPDF_SaveAsCopy）。需要扩展 wasm 并重新编译后才能写回文件。',
    );
  }
}
