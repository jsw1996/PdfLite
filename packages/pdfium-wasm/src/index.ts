/**
 * PDFium WebAssembly Module
 * TypeScript wrapper for the compiled PDFium WASM module
 */

import * as pdfiumModule from '../wasm/pdfium.js';

/**
 * Annotation subtype constants
 */
export enum FPDF_ANNOTATION_SUBTYPE {
  UNKNOWN = 0,
  TEXT = 1,
  LINK = 2,
  FREETEXT = 3,
  LINE = 4,
  SQUARE = 5,
  CIRCLE = 6,
  POLYGON = 7,
  POLYLINE = 8,
  HIGHLIGHT = 9,
  UNDERLINE = 10,
  SQUIGGLY = 11,
  STRIKEOUT = 12,
  STAMP = 13,
  CARET = 14,
  INK = 15,
  POPUP = 16,
  FILEATTACHMENT = 17,
  SOUND = 18,
  MOVIE = 19,
  WIDGET = 20,
  SCREEN = 21,
  PRINTERMARK = 22,
  TRAPNET = 23,
  WATERMARK = 24,
  THREED = 25,
  RICHMEDIA = 26,
  XFAWIDGET = 27,
  REDACT = 28,
}

/**
 * Annotation color type constants
 */
export enum FPDFANNOT_COLORTYPE {
  COLOR = 0,
  INTERIORCOLOR = 1,
}

/**
 * Annotation appearance mode constants
 */
export enum FPDF_ANNOT_APPEARANCEMODE {
  NORMAL = 0,
  ROLLOVER = 1,
  DOWN = 2,
}

/**
 * Annotation object type constants
 */
export enum FPDF_OBJECT_TYPE {
  UNKNOWN = 0,
  BOOLEAN = 1,
  NUMBER = 2,
  STRING = 3,
  NAME = 4,
  ARRAY = 5,
  DICTIONARY = 6,
  STREAM = 7,
  NULLOBJ = 8,
  REFERENCE = 9,
}

/**
 * Annotation flag constants
 */
export enum FPDF_ANNOT_FLAG {
  NONE = 0,
  INVISIBLE = 1 << 0,
  HIDDEN = 1 << 1,
  PRINT = 1 << 2,
  NOZOOM = 1 << 3,
  NOROTATE = 1 << 4,
  NOVIEW = 1 << 5,
  READONLY = 1 << 6,
  LOCKED = 1 << 7,
  TOGGLENOVIEW = 1 << 8,
  LOCKEDCONTENTS = 1 << 9,
}

/**
 * PDFium error codes returned by _PDFium_GetLastError()
 */
export enum FPDF_ERR {
  /** No error */
  SUCCESS = 0,
  /** Unknown error */
  UNKNOWN = 1,
  /** File not found or could not be opened */
  FILE = 2,
  /** File not in PDF format or corrupted */
  FORMAT = 3,
  /** Password required or incorrect password */
  PASSWORD = 4,
  /** Unsupported security scheme */
  SECURITY = 5,
  /** Page not found or content error */
  PAGE = 6,
}

/**
 * Progressive rendering status codes returned by _PDFium_RenderPageBitmap_Start and _PDFium_RenderPage_Continue
 */
export enum FPDF_RENDER_STATUS {
  /** Cyclic rendering - needs more cycles (call Continue) */
  CYCLIC = 1,
  /** Render is complete */
  DONE = 2,
  /** Render is paused and can be continued */
  TOBECONTINUED = 3,
  /** Render failed */
  FAILED = 4,
}

/**
 * PDFium Module interface - the raw WASM module exports
 */
export interface IPDFiumModule {
  // ============================================================================
  // Core Document Functions
  // ============================================================================
  _PDFium_Init(): number;
  _PDFium_Destroy(): void;
  _PDFium_LoadMemDocument(dataPtr: number, size: number, passwordPtr: number): number;
  _PDFium_CloseDocument(doc: number): void;
  _PDFium_GetPageCount(doc: number): number;
  _PDFium_LoadPage(doc: number, pageIndex: number): number;
  _PDFium_ClosePage(page: number): void;
  _PDFium_GetPageWidth(page: number): number;
  _PDFium_GetPageHeight(page: number): number;
  /** Convert page coordinates to device coordinates */
  _PDFium_PageToDevice(
    page: number,
    startX: number,
    startY: number,
    sizeX: number,
    sizeY: number,
    rotate: number,
    pageX: number,
    pageY: number,
    deviceXPtr: number,
    deviceYPtr: number,
  ): void;
  /** Convert device coordinates to page coordinates */
  _PDFium_DeviceToPage(
    page: number,
    startX: number,
    startY: number,
    sizeX: number,
    sizeY: number,
    rotate: number,
    deviceX: number,
    deviceY: number,
    pageXPtr: number,
    pageYPtr: number,
  ): void;

  // ============================================================================
  // Bitmap/Rendering Functions
  // ============================================================================
  _PDFium_RenderPageBitmap(
    bitmap: number,
    page: number,
    startX: number,
    startY: number,
    sizeX: number,
    sizeY: number,
    rotate: number,
    flags: number,
  ): void;
  _PDFium_BitmapCreate(width: number, height: number, alpha: number): number;
  _PDFium_BitmapDestroy(bitmap: number): void;
  _PDFium_BitmapFillRect(
    bitmap: number,
    left: number,
    top: number,
    width: number,
    height: number,
    color: number,
  ): void;
  _PDFium_BitmapGetBuffer(bitmap: number): number;
  _PDFium_BitmapGetStride(bitmap: number): number;
  _PDFium_FreeBuffer(buffer: number): void;

  // ============================================================================
  // Progressive Rendering Functions - Interruptible page rendering
  // ============================================================================
  /**
   * Set the global cancel flag for progressive rendering.
   * Call with 1 to request cancellation, 0 to reset.
   * When set to 1, ongoing progressive renders will stop at the next pause point.
   * @param cancel 1 to request cancellation, 0 to reset
   */
  _PDFium_SetRenderCancelFlag(cancel: number): void;
  /**
   * Get the current cancel flag state.
   * @returns 1 if cancellation is requested, 0 otherwise
   */
  _PDFium_GetRenderCancelFlag(): number;
  /**
   * Start progressive rendering of a page to a bitmap.
   * This allows rendering to be cancelled mid-operation by setting the cancel flag.
   * @param bitmap Bitmap handle from _PDFium_BitmapCreate
   * @param page Page handle from _PDFium_LoadPage
   * @param startX Start X position
   * @param startY Start Y position
   * @param sizeX Width in pixels
   * @param sizeY Height in pixels
   * @param rotate Rotation (0, 1, 2, 3 for 0, 90, 180, 270 degrees)
   * @param flags Render flags (0 for normal)
   * @returns FPDF_RENDER_STATUS: CYCLIC(1)=needs continue, DONE(2)=finished, TOBECONTINUED(3)=paused, FAILED(4)=error
   */
  _PDFium_RenderPageBitmap_Start(
    bitmap: number,
    page: number,
    startX: number,
    startY: number,
    sizeX: number,
    sizeY: number,
    rotate: number,
    flags: number,
  ): number;
  /**
   * Continue progressive rendering after it was paused.
   * Call this in a loop until status is DONE or FAILED.
   * @param page Page handle
   * @returns FPDF_RENDER_STATUS: CYCLIC(1)=needs continue, DONE(2)=finished, TOBECONTINUED(3)=paused, FAILED(4)=error
   */
  _PDFium_RenderPage_Continue(page: number): number;
  /**
   * Close/cancel progressive rendering - releases resources.
   * Must be called after progressive rendering is complete or cancelled.
   * @param page Page handle
   */
  _PDFium_RenderPage_Close(page: number): void;

  // ============================================================================
  // Text Functions
  // ============================================================================
  _PDFium_LoadPageText(page: number): number;
  _PDFium_ClosePageText(textPage: number): void;
  _PDFium_GetPageCharCount(textPage: number): number;
  _PDFium_GetPageText(textPage: number, buffer: number, bufferLen: number): number;

  // ============================================================================
  // Text Layer APIs - Character positioning
  // ============================================================================
  /** Get the bounding box of a character */
  _PDFium_GetCharBox(
    textPage: number,
    charIndex: number,
    leftPtr: number,
    rightPtr: number,
    bottomPtr: number,
    topPtr: number,
  ): number;
  /** Get the origin point of a character */
  _PDFium_GetCharOrigin(textPage: number, charIndex: number, xPtr: number, yPtr: number): number;
  /** Get the Unicode value of a character */
  _PDFium_GetUnicode(textPage: number, charIndex: number): number;
  /** Get the font size of a character */
  _PDFium_GetFontSize(textPage: number, charIndex: number): number;
  /** Get the rotation angle of a character in degrees */
  _PDFium_GetCharAngle(textPage: number, charIndex: number): number;
  /** Get character index at a specific position */
  _PDFium_GetCharIndexAtPos(
    textPage: number,
    x: number,
    y: number,
    xTolerance: number,
    yTolerance: number,
  ): number;
  /** Get font information for a character */
  _PDFium_GetFontInfo(
    textPage: number,
    charIndex: number,
    buffer: number,
    bufferLen: number,
    flagsPtr: number,
  ): number;
  /** Get font weight for a character */
  _PDFium_GetFontWeight(textPage: number, charIndex: number): number;
  /** Get text fill color */
  _PDFium_GetFillColor(
    textPage: number,
    charIndex: number,
    rPtr: number,
    gPtr: number,
    bPtr: number,
    aPtr: number,
  ): number;
  /** Get text stroke color */
  _PDFium_GetStrokeColor(
    textPage: number,
    charIndex: number,
    rPtr: number,
    gPtr: number,
    bPtr: number,
    aPtr: number,
  ): number;

  // ============================================================================
  // Text Selection APIs
  // ============================================================================
  /** Count selection rectangles for a range of characters */
  _PDFium_CountRects(textPage: number, startIndex: number, count: number): number;
  /** Get a specific selection rectangle */
  _PDFium_GetRect(
    textPage: number,
    rectIndex: number,
    leftPtr: number,
    topPtr: number,
    rightPtr: number,
    bottomPtr: number,
  ): number;
  /** Get text within a bounding rectangle */
  _PDFium_GetBoundedText(
    textPage: number,
    left: number,
    top: number,
    right: number,
    bottom: number,
    buffer: number,
    bufferLen: number,
  ): number;

  // ============================================================================
  // Text Search APIs
  // ============================================================================
  /** Start a text search */
  _PDFium_FindStart(textPage: number, findWhat: number, flags: number, startIndex: number): number;
  /** Find next occurrence */
  _PDFium_FindNext(searchHandle: number): number;
  /** Find previous occurrence */
  _PDFium_FindPrev(searchHandle: number): number;
  /** Get the character index of the search result */
  _PDFium_GetSchResultIndex(searchHandle: number): number;
  /** Get the number of characters in the search result */
  _PDFium_GetSchCount(searchHandle: number): number;
  /** Close the search handle */
  _PDFium_FindClose(searchHandle: number): void;

  // ============================================================================
  // Metadata & Error Functions
  // ============================================================================
  _PDFium_GetLastError(): number;
  _PDFium_GetMetaText(doc: number, tag: number, buffer: number, bufferLen: number): number;

  // ============================================================================
  // Bookmark Functions
  // ============================================================================
  _PDFium_GetFirstBookmark(doc: number): number;
  _PDFium_GetNextBookmark(doc: number, bookmark: number): number;
  _PDFium_GetFirstChildBookmark(doc: number, bookmark: number): number;
  _PDFium_GetBookmarkTitle(bookmark: number, buffer: number, bufferLen: number): number;
  _PDFium_GetBookmarkDest(doc: number, bookmark: number): number;
  _PDFium_GetDestPageIndex(doc: number, dest: number): number;

  // ============================================================================
  // Memory Functions
  // ============================================================================
  _PDFium_Malloc(size: number): number;
  _PDFium_Free(ptr: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;

  // ============================================================================
  // Annotation API - Page-level functions
  // ============================================================================
  /** Get the number of annotations on a page */
  _FPDFPage_GetAnnotCount_W(page: number): number;
  /** Get annotation at the specified index */
  _FPDFPage_GetAnnot_W(page: number, index: number): number;
  /** Get the index of an annotation */
  _FPDFPage_GetAnnotIndex_W(page: number, annot: number): number;
  /** Close an annotation handle */
  _FPDFPage_CloseAnnot_W(annot: number): void;
  /** Create a new annotation on a page */
  _FPDFPage_CreateAnnot_W(page: number, subtype: number): number;
  /** Remove an annotation from a page */
  _FPDFPage_RemoveAnnot_W(page: number, index: number): number;

  // ============================================================================
  // Annotation API - Subtype and support
  // ============================================================================
  /** Get the subtype of an annotation */
  _FPDFAnnot_GetSubtype_W(annot: number): number;
  /** Check if an object subtype is supported */
  _FPDFAnnot_IsObjectSupportedSubtype_W(subtype: number): number;
  /** Check if a subtype is supported */
  _FPDFAnnot_IsSupportedSubtype_W(subtype: number): number;

  // ============================================================================
  // Annotation API - Rectangle
  // ============================================================================
  /** Get annotation rectangle (rectPtr points to FS_RECTF: left, bottom, right, top as floats) */
  _FPDFAnnot_GetRect_W(annot: number, rectPtr: number): number;
  /** Set annotation rectangle */
  _FPDFAnnot_SetRect_W(annot: number, rectPtr: number): number;

  // ============================================================================
  // Annotation API - Color
  // ============================================================================
  /** Get annotation color (R, G, B, A are pointers to unsigned int) */
  _FPDFAnnot_GetColor_W(
    annot: number,
    type: number,
    rPtr: number,
    gPtr: number,
    bPtr: number,
    aPtr: number,
  ): number;
  /** Set annotation color */
  _FPDFAnnot_SetColor_W(
    annot: number,
    type: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): number;

  // ============================================================================
  // Annotation API - Flags
  // ============================================================================
  /** Get annotation flags */
  _FPDFAnnot_GetFlags_W(annot: number): number;
  /** Set annotation flags */
  _FPDFAnnot_SetFlags_W(annot: number, flags: number): number;

  // ============================================================================
  // Annotation API - Dictionary key/value
  // ============================================================================
  /** Check if annotation has a key */
  _FPDFAnnot_HasKey_W(annot: number, keyPtr: number): number;
  /** Get the value type for a key */
  _FPDFAnnot_GetValueType_W(annot: number, keyPtr: number): number;
  /** Get string value for a key */
  _FPDFAnnot_GetStringValue_W(
    annot: number,
    keyPtr: number,
    buffer: number,
    bufferLen: number,
  ): number;
  /** Set string value for a key */
  _FPDFAnnot_SetStringValue_W(annot: number, keyPtr: number, valuePtr: number): number;
  /** Get number value for a key */
  _FPDFAnnot_GetNumberValue_W(annot: number, keyPtr: number, valuePtr: number): number;

  // ============================================================================
  // Annotation API - Appearance
  // ============================================================================
  /** Set annotation appearance stream */
  _FPDFAnnot_SetAP_W(annot: number, appearanceMode: number, valuePtr: number): number;
  /** Get annotation appearance stream */
  _FPDFAnnot_GetAP_W(
    annot: number,
    appearanceMode: number,
    buffer: number,
    bufferLen: number,
  ): number;

  // ============================================================================
  // Annotation API - Attachment points (QuadPoints for markup annotations)
  // ============================================================================
  /** Check if annotation has attachment points */
  _FPDFAnnot_HasAttachmentPoints_W(annot: number): number;
  /** Count attachment points */
  _FPDFAnnot_CountAttachmentPoints_W(annot: number): number;
  /** Get attachment points at index (quadPointsPtr points to FS_QUADPOINTSF) */
  _FPDFAnnot_GetAttachmentPoints_W(annot: number, quadIndex: number, quadPointsPtr: number): number;
  /** Set attachment points at index */
  _FPDFAnnot_SetAttachmentPoints_W(annot: number, quadIndex: number, quadPointsPtr: number): number;
  /** Append attachment points */
  _FPDFAnnot_AppendAttachmentPoints_W(annot: number, quadPointsPtr: number): number;

  // ============================================================================
  // Annotation API - Ink annotations
  // ============================================================================
  /** Add an ink stroke (pointsPtr points to array of FS_POINTF) */
  _FPDFAnnot_AddInkStroke_W(annot: number, pointsPtr: number, pointCount: number): number;
  /** Remove all ink strokes */
  _FPDFAnnot_RemoveInkList_W(annot: number): number;
  /** Get ink list count */
  _FPDFAnnot_GetInkListCount_W(annot: number): number;
  /** Get ink list path (buffer points to array of FS_POINTF) */
  _FPDFAnnot_GetInkListPath_W(
    annot: number,
    pathIndex: number,
    buffer: number,
    length: number,
  ): number;

  // ============================================================================
  // Annotation API - Line annotations
  // ============================================================================
  /** Get line annotation endpoints (start and end point to FS_POINTF) */
  _FPDFAnnot_GetLine_W(annot: number, startPtr: number, endPtr: number): number;

  // ============================================================================
  // Annotation API - Border
  // ============================================================================
  /** Get annotation border */
  _FPDFAnnot_GetBorder_W(
    annot: number,
    horizontalRadiusPtr: number,
    verticalRadiusPtr: number,
    borderWidthPtr: number,
  ): number;
  /** Set annotation border */
  _FPDFAnnot_SetBorder_W(
    annot: number,
    horizontalRadius: number,
    verticalRadius: number,
    borderWidth: number,
  ): number;

  // ============================================================================
  // Annotation API - Annotation objects (for stamp, freetext, etc.)
  // ============================================================================
  /** Get count of page objects in annotation */
  _FPDFAnnot_GetObjectCount_W(annot: number): number;
  /** Get page object at index */
  _FPDFAnnot_GetObject_W(annot: number, index: number): number;
  /** Append page object to annotation */
  _FPDFAnnot_AppendObject_W(annot: number, obj: number): number;
  /** Update page object in annotation */
  _FPDFAnnot_UpdateObject_W(annot: number, obj: number): number;
  /** Remove page object from annotation */
  _FPDFAnnot_RemoveObject_W(annot: number, index: number): number;

  // ============================================================================
  // Annotation API - Linked annotation (popup)
  // ============================================================================
  /** Get linked annotation */
  _FPDFAnnot_GetLinkedAnnot_W(annot: number, keyPtr: number): number;

  // ============================================================================
  // Annotation API - Vertices (polygon/polyline)
  // ============================================================================
  /** Get vertices for polygon/polyline annotation */
  _FPDFAnnot_GetVertices_W(annot: number, buffer: number, length: number): number;

  // ============================================================================
  // Annotation API - Form field functions
  // ============================================================================
  /** Initialize form fill environment */
  _FPDFDOC_InitFormFillEnvironment_W(document: number, formInfoPtr: number): number;
  /** Exit form fill environment */
  _FPDFDOC_ExitFormFillEnvironment_W(hHandle: number): void;
  /** Get form field name */
  _FPDFAnnot_GetFormFieldName_W(
    hHandle: number,
    annot: number,
    buffer: number,
    bufferLen: number,
  ): number;
  /** Get form field type */
  _FPDFAnnot_GetFormFieldType_W(hHandle: number, annot: number): number;
  /** Get form field value */
  _FPDFAnnot_GetFormFieldValue_W(
    hHandle: number,
    annot: number,
    buffer: number,
    bufferLen: number,
  ): number;
  /** Get form field flags */
  _FPDFAnnot_GetFormFieldFlags_W(hHandle: number, annot: number): number;
  /** Get option count for list/combo box */
  _FPDFAnnot_GetOptionCount_W(hHandle: number, annot: number): number;
  /** Get option label */
  _FPDFAnnot_GetOptionLabel_W(
    hHandle: number,
    annot: number,
    index: number,
    buffer: number,
    bufferLen: number,
  ): number;
  /** Check if option is selected */
  _FPDFAnnot_IsOptionSelected_W(hHandle: number, annot: number, index: number): number;
  /** Get font size */
  _FPDFAnnot_GetFontSize_W(hHandle: number, annot: number, valuePtr: number): number;
  /** Check if checkbox/radio button is checked */
  _FPDFAnnot_IsChecked_W(hHandle: number, annot: number): number;
  /** Get form control count */
  _FPDFAnnot_GetFormControlCount_W(hHandle: number, annot: number): number;
  /** Get form control index */
  _FPDFAnnot_GetFormControlIndex_W(hHandle: number, annot: number): number;
  /** Get form field export value */
  _FPDFAnnot_GetFormFieldExportValue_W(
    hHandle: number,
    annot: number,
    buffer: number,
    bufferLen: number,
  ): number;

  // ============================================================================
  // Annotation API - Focus
  // ============================================================================
  /** Set focusable annotation subtypes */
  _FPDFAnnot_SetFocusableSubtypes_W(hHandle: number, subtypesPtr: number, count: number): number;
  /** Get focusable subtypes count */
  _FPDFAnnot_GetFocusableSubtypesCount_W(hHandle: number): number;
  /** Get focusable subtypes */
  _FPDFAnnot_GetFocusableSubtypes_W(hHandle: number, subtypesPtr: number, count: number): number;

  // ============================================================================
  // Annotation API - Link and URI
  // ============================================================================
  /** Get link from annotation */
  _FPDFAnnot_GetLink_W(annot: number): number;
  /** Get action from link */
  _FPDFLink_GetAction_W(link: number): number;
  /** Get destination from link (internal jump) */
  _FPDFLink_GetDest_W(doc: number, link: number): number;
  /** Get action type (URI / GoTo / etc) */
  _FPDFAction_GetType_W(action: number): number;
  /** Read URI for a URI action (returns required buffer size incl. NUL) */
  _FPDFAction_GetURIPath_W(doc: number, action: number, buffer: number, buflen: number): number;
  /** Get destination from action */
  _FPDFAction_GetDest_W(doc: number, action: number): number;
  /** Set URI for link annotation */
  _FPDFAnnot_SetURI_W(annot: number, uriPtr: number): number;

  // ============================================================================
  // Page Object API - Create and manipulate page objects (text, path, image)
  // ============================================================================
  /**
   * Load a standard PDF font (one of the 14 standard fonts)
   * @param document Document pointer
   * @param fontNamePtr Pointer to null-terminated font name string:
   *   "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
   *   "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
   *   "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
   *   "Symbol", "ZapfDingbats"
   * @returns Font handle, or 0 on failure
   */
  _FPDFText_LoadStandardFont_W(document: number, fontNamePtr: number): number;
  /**
   * Create a new text object using the specified font
   * @param document Document pointer
   * @param font Font handle from LoadStandardFont
   * @param fontSize Font size in points
   * @returns Page object handle, or 0 on failure
   */
  _FPDFPageObj_CreateTextObj_W(document: number, font: number, fontSize: number): number;
  /**
   * Set the text content for a text object
   * @param textObject Text object handle
   * @param textPtr Pointer to UTF-16LE encoded null-terminated string
   * @returns Non-zero on success
   */
  _FPDFText_SetText_W(textObject: number, textPtr: number): number;
  /**
   * Set the fill color for a page object (RGBA, 0-255)
   */
  _FPDFPageObj_SetFillColor_W(
    pageObject: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): number;
  /**
   * Set the stroke color for a page object (RGBA, 0-255)
   */
  _FPDFPageObj_SetStrokeColor_W(
    pageObject: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): number;
  /**
   * Transform a page object using a matrix
   * The transformation matrix is: [a b 0; c d 0; e f 1]
   * For translation only: a=1, b=0, c=0, d=1, e=tx, f=ty
   */
  _FPDFPageObj_Transform_W(
    pageObject: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  /**
   * Get the bounds of a page object
   * @returns Non-zero on success
   */
  _FPDFPageObj_GetBounds_W(
    pageObject: number,
    leftPtr: number,
    bottomPtr: number,
    rightPtr: number,
    topPtr: number,
  ): number;
  /**
   * Destroy a page object (only call if not added to page/annotation)
   */
  _FPDFPageObj_Destroy_W(pageObject: number): void;
  /**
   * Close/release a font object
   */
  _FPDFFont_Close_W(font: number): void;
  /**
   * Set text rendering mode
   * @param renderMode 0=Fill, 1=Stroke, 2=Fill+Stroke, 3=Invisible,
   *   4=Fill+Clip, 5=Stroke+Clip, 6=Fill+Stroke+Clip, 7=Clip
   */
  _FPDFTextObj_SetTextRenderMode_W(textObject: number, renderMode: number): number;
  /**
   * Get text rendering mode
   */
  _FPDFTextObj_GetTextRenderMode_W(textObject: number): number;

  // ============================================================================
  // Page Object Manipulation API - Insert objects directly into page content
  // ============================================================================
  /**
   * Insert a page object into a page's content stream.
   * This "flattens" the object into the page (e.g., draw text directly on page).
   * After calling this, the page object is owned by the page and should not be destroyed manually.
   * @param page Page pointer
   * @param pageObject Page object pointer (text, image, path, etc.)
   */
  _FPDFPage_InsertObject_W(page: number, pageObject: number): void;
  /**
   * Generate the page content stream after inserting objects.
   * Must be called after FPDFPage_InsertObject to commit changes to the page.
   * @param page Page pointer
   * @returns Non-zero on success
   */
  _FPDFPage_GenerateContent_W(page: number): number;

  // ============================================================================
  // PDF Save/Download API
  // ============================================================================
  /**
   * Save document to internal memory buffer
   * @param doc Document pointer
   * @param flags Save flags: 0=default, 1=FPDF_INCREMENTAL, 2=FPDF_NO_INCREMENTAL, 3=FPDF_REMOVE_SECURITY
   * @returns Size of saved PDF in bytes, or 0 on failure
   */
  _PDFium_SaveToMemory(doc: number, flags: number): number;
  /**
   * Get pointer to the saved PDF buffer (call after SaveToMemory)
   * @returns Pointer to the buffer, or 0 if no data
   */
  _PDFium_GetSaveBuffer(): number;
  /**
   * Get the size of the saved PDF buffer
   * @returns Size in bytes
   */
  _PDFium_GetSaveBufferSize(): number;
  /**
   * Free the saved PDF buffer memory
   */
  _PDFium_FreeSaveBuffer(): void;
  /**
   * Save document with specific PDF version
   * @param doc Document pointer
   * @param flags Save flags
   * @param version PDF version: 14=1.4, 15=1.5, 16=1.6, 17=1.7, 20=2.0
   * @returns Size of saved PDF in bytes, or 0 on failure
   */
  _PDFium_SaveToMemoryWithVersion(doc: number, flags: number, version: number): number;

  // ============================================================================
  // Emscripten Runtime
  // ============================================================================
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
  ccall(name: string, returnType: string, argTypes: string[], args: unknown[]): unknown;
  cwrap(name: string, returnType: string, argTypes: string[]): (...args: unknown[]) => unknown;
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;
  UTF8ToString(ptr: number): string;
  UTF16ToString(ptr: number): string;
  stringToUTF8(str: string, buffer: number, maxBytes: number): void;
  stringToUTF16(str: string, buffer: number, maxBytes: number): void;
  lengthBytesUTF8(str: string): number;
}

// Get the factory function from the module (handles ESM/CJS interop)
const createPDFiumModuleFactory =
  (pdfiumModule as unknown as { default?: () => Promise<IPDFiumModule> }).default ?? pdfiumModule;

/**
 * Create and initialize a PDFium WASM module instance
 * @returns Promise that resolves to an initialized IPDFiumModule
 */
export async function createPdfiumModule(): Promise<IPDFiumModule> {
  const module = await (createPDFiumModuleFactory as () => Promise<IPDFiumModule>)();
  return module;
}

// Export the factory function as default for convenience
export default createPdfiumModule;
