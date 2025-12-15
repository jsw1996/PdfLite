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
}

export interface IPdfController {
  ensureInitialized(): Promise<void>;
  loadFile(file: File, opts?: { signal?: AbortSignal }): Promise<void>;
  renderPdf(canvas: HTMLCanvasElement, options?: IRenderOptions): void;
  listNativeAnnotations(pageIndex: number, opts: { scale: number }): INativeAnnotation[];
  addInkHighlight(pageIndex: number, opts: { scale: number; canvasPoints: IPoint[] }): void;
  exportPdfBytes(): Uint8Array;
  getPageCount(): number;
  destroy(): void;
}

export class PdfController implements IPdfController {
  private pdfiumModule: PDFiumModule | null = null;
  private docPtr: number | null = null;
  private dataPtr: number | null = null;
  private initPromise: Promise<void> | null = null;
  private loadSeq = 0;

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
    pageW: number,
    pageH: number,
    scale: number,
    x: number,
    y: number,
  ): IPoint {
    // PDF 坐标系通常原点在左下；bitmap/Canvas 以左上为原点
    return { x: x * scale, y: (pageH - y) * scale };
  }

  private canvasToPagePoint(
    pageW: number,
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

    const { pageIndex = 0, scale = 1.0 } = options;
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
        // yellow
        pdfium._FPDFAnnot_SetColor_W(annot, FPDFANNOT_COLORTYPE.COLOR, 250, 204, 21, 255);
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
