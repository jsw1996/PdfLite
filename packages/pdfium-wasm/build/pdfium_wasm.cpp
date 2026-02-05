/*
 * PDFium WebAssembly Wrapper
 * Provides a JavaScript-friendly API for PDFium functionality
 */

#include <emscripten.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>

// PDFium headers
#include "public/fpdfview.h"
#include "public/fpdf_doc.h"
#include "public/fpdf_text.h"
#include "public/fpdf_edit.h"
#include "public/fpdf_save.h"
#include "public/fpdf_annot.h"
#include "public/fpdf_formfill.h"
#include "public/fpdf_progressive.h"

// Platform interface stub for WASM - CFX_GEModule requires a platform implementation
#include "core/fxge/cfx_gemodule.h"

namespace {

class WasmPlatformIface : public CFX_GEModule::PlatformIface {
 public:
  WasmPlatformIface() = default;
  ~WasmPlatformIface() override = default;

  void Init() override {}

  std::unique_ptr<SystemFontInfoIface> CreateDefaultSystemFontInfo() override {
    return nullptr;
  }
};

}  // namespace

// Create the platform interface for WASM
std::unique_ptr<CFX_GEModule::PlatformIface> CFX_GEModule::PlatformIface::Create() {
  return std::make_unique<WasmPlatformIface>();
}

// Global library state
static bool g_libraryInitialized = false;

// ============================================================================
// Progressive Rendering Support
// ============================================================================
// Global cancel flag for progressive rendering - can be set from JavaScript
static volatile bool g_renderCancelFlag = false;

// Pause callback structure for progressive rendering
struct WasmPauseHandler : IFSDK_PAUSE {
    WasmPauseHandler() {
        version = 1;
        NeedToPauseNow = &WasmPauseHandler::CheckCancel;
    }

    static FPDF_BOOL CheckCancel(IFSDK_PAUSE* pThis) {
        // Return non-zero to pause/cancel, zero to continue
        return g_renderCancelFlag ? 1 : 0;
    }
};

// Global pause handler instance
static WasmPauseHandler g_pauseHandler;

extern "C" {

EMSCRIPTEN_KEEPALIVE
int PDFium_Init() {
    if (g_libraryInitialized) {
        return 1;
    }

    FPDF_LIBRARY_CONFIG config;
    memset(&config, 0, sizeof(config));
    config.version = 2;
    config.m_pUserFontPaths = nullptr;
    config.m_pIsolate = nullptr;
    config.m_v8EmbedderSlot = 0;

    FPDF_InitLibraryWithConfig(&config);
    g_libraryInitialized = true;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void PDFium_Destroy() {
    if (g_libraryInitialized) {
        FPDF_DestroyLibrary();
        g_libraryInitialized = false;
    }
}

EMSCRIPTEN_KEEPALIVE
FPDF_DOCUMENT PDFium_LoadMemDocument(const uint8_t* data, int size, const char* password) {
    return FPDF_LoadMemDocument(data, size, password);
}

EMSCRIPTEN_KEEPALIVE
void PDFium_CloseDocument(FPDF_DOCUMENT doc) {
    if (doc) {
        FPDF_CloseDocument(doc);
    }
}

EMSCRIPTEN_KEEPALIVE
int PDFium_GetPageCount(FPDF_DOCUMENT doc) {
    return FPDF_GetPageCount(doc);
}

EMSCRIPTEN_KEEPALIVE
FPDF_PAGE PDFium_LoadPage(FPDF_DOCUMENT doc, int pageIndex) {
    return FPDF_LoadPage(doc, pageIndex);
}

EMSCRIPTEN_KEEPALIVE
void PDFium_ClosePage(FPDF_PAGE page) {
    if (page) {
        FPDF_ClosePage(page);
    }
}

EMSCRIPTEN_KEEPALIVE
double PDFium_GetPageWidth(FPDF_PAGE page) {
    return FPDF_GetPageWidth(page);
}

EMSCRIPTEN_KEEPALIVE
double PDFium_GetPageHeight(FPDF_PAGE page) {
    return FPDF_GetPageHeight(page);
}

// Convert page coordinates to device coordinates
EMSCRIPTEN_KEEPALIVE
void PDFium_PageToDevice(FPDF_PAGE page,
                         int start_x, int start_y,
                         int size_x, int size_y,
                         int rotate,
                         double page_x, double page_y,
                         int* device_x, int* device_y) {
    FPDF_PageToDevice(page, start_x, start_y, size_x, size_y, rotate, page_x, page_y, device_x, device_y);
}

// Convert device coordinates to page coordinates
EMSCRIPTEN_KEEPALIVE
void PDFium_DeviceToPage(FPDF_PAGE page,
                         int start_x, int start_y,
                         int size_x, int size_y,
                         int rotate,
                         int device_x, int device_y,
                         double* page_x, double* page_y) {
    FPDF_DeviceToPage(page, start_x, start_y, size_x, size_y, rotate, device_x, device_y, page_x, page_y);
}

EMSCRIPTEN_KEEPALIVE
void PDFium_RenderPageBitmap(FPDF_BITMAP bitmap, FPDF_PAGE page, int start_x, int start_y,
                              int size_x, int size_y, int rotate, int flags) {
    FPDF_RenderPageBitmap(bitmap, page, start_x, start_y, size_x, size_y, rotate, flags);
}

// ============================================================================
// Progressive Rendering API - Interruptible page rendering
// ============================================================================

// Set the global cancel flag for progressive rendering
// Call with 1 to request cancellation, 0 to reset
EMSCRIPTEN_KEEPALIVE
void PDFium_SetRenderCancelFlag(int cancel) {
    g_renderCancelFlag = (cancel != 0);
}

// Get the current cancel flag state
EMSCRIPTEN_KEEPALIVE
int PDFium_GetRenderCancelFlag() {
    return g_renderCancelFlag ? 1 : 0;
}

// Start progressive rendering of a page to a bitmap
// Returns: CYCLIC (1) = needs continue, DONE (2) = finished, FAILED (4) = error
// FPDF_RENDER_STATUS values:
//   CYCLIC (1) - Render needs more cycles (call Continue)
//   DONE (2) - Render is complete
//   TOBECONTINUED (3) - Render is paused and can be continued
//   FAILED (4) - Render failed
EMSCRIPTEN_KEEPALIVE
int PDFium_RenderPageBitmap_Start(FPDF_BITMAP bitmap, FPDF_PAGE page,
                                   int start_x, int start_y,
                                   int size_x, int size_y,
                                   int rotate, int flags) {
    // Reset cancel flag at start of render
    g_renderCancelFlag = false;

    // Start progressive rendering with our pause handler
    int status = FPDF_RenderPageBitmap_Start(
        bitmap, page, start_x, start_y, size_x, size_y, rotate, flags, &g_pauseHandler);

    return status;
}

// Continue progressive rendering
// Returns: CYCLIC (1) = needs continue, DONE (2) = finished, TOBECONTINUED (3) = paused, FAILED (4) = error
EMSCRIPTEN_KEEPALIVE
int PDFium_RenderPage_Continue(FPDF_PAGE page) {
    return FPDF_RenderPage_Continue(page, &g_pauseHandler);
}

// Close/cancel progressive rendering - releases resources
// Must be called after progressive rendering is complete or cancelled
EMSCRIPTEN_KEEPALIVE
void PDFium_RenderPage_Close(FPDF_PAGE page) {
    FPDF_RenderPage_Close(page);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BITMAP PDFium_BitmapCreate(int width, int height, int alpha) {
    return FPDFBitmap_Create(width, height, alpha);
}

EMSCRIPTEN_KEEPALIVE
void PDFium_BitmapDestroy(FPDF_BITMAP bitmap) {
    if (bitmap) {
        FPDFBitmap_Destroy(bitmap);
    }
}

EMSCRIPTEN_KEEPALIVE
void PDFium_BitmapFillRect(FPDF_BITMAP bitmap, int left, int top, int width, int height, unsigned long color) {
    FPDFBitmap_FillRect(bitmap, left, top, width, height, color);
}

EMSCRIPTEN_KEEPALIVE
void* PDFium_BitmapGetBuffer(FPDF_BITMAP bitmap) {
    return FPDFBitmap_GetBuffer(bitmap);
}

EMSCRIPTEN_KEEPALIVE
int PDFium_BitmapGetStride(FPDF_BITMAP bitmap) {
    return FPDFBitmap_GetStride(bitmap);
}

EMSCRIPTEN_KEEPALIVE
void PDFium_FreeBuffer(void* buffer) {
    if (buffer) {
        free(buffer);
    }
}

EMSCRIPTEN_KEEPALIVE
FPDF_TEXTPAGE PDFium_LoadPageText(FPDF_PAGE page) {
    return FPDFText_LoadPage(page);
}

EMSCRIPTEN_KEEPALIVE
void PDFium_ClosePageText(FPDF_TEXTPAGE textPage) {
    if (textPage) {
        FPDFText_ClosePage(textPage);
    }
}

EMSCRIPTEN_KEEPALIVE
int PDFium_GetPageCharCount(FPDF_TEXTPAGE textPage) {
    return FPDFText_CountChars(textPage);
}

EMSCRIPTEN_KEEPALIVE
int PDFium_GetPageText(FPDF_TEXTPAGE textPage, unsigned short* buffer, int bufferLen) {
    int charCount = FPDFText_CountChars(textPage);
    return FPDFText_GetText(textPage, 0, charCount, buffer);
}

// ============================================================================
// Text Layer API - Character positioning, selection, and search
// ============================================================================

// Get the bounding box of a character
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL PDFium_GetCharBox(FPDF_TEXTPAGE textPage, int charIndex,
                             double* left, double* right,
                             double* bottom, double* top) {
    return FPDFText_GetCharBox(textPage, charIndex, left, right, bottom, top);
}

// Get the origin point of a character
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL PDFium_GetCharOrigin(FPDF_TEXTPAGE textPage, int charIndex,
                                double* x, double* y) {
    return FPDFText_GetCharOrigin(textPage, charIndex, x, y);
}

// Get the Unicode value of a character
EMSCRIPTEN_KEEPALIVE
unsigned int PDFium_GetUnicode(FPDF_TEXTPAGE textPage, int charIndex) {
    return FPDFText_GetUnicode(textPage, charIndex);
}

// Get the font size of a character
EMSCRIPTEN_KEEPALIVE
double PDFium_GetFontSize(FPDF_TEXTPAGE textPage, int charIndex) {
    return FPDFText_GetFontSize(textPage, charIndex);
}

// Get the rotation angle of a character in degrees
EMSCRIPTEN_KEEPALIVE
float PDFium_GetCharAngle(FPDF_TEXTPAGE textPage, int charIndex) {
    return FPDFText_GetCharAngle(textPage, charIndex);
}

// Get character index at a specific position
EMSCRIPTEN_KEEPALIVE
int PDFium_GetCharIndexAtPos(FPDF_TEXTPAGE textPage, double x, double y,
                              double xTolerance, double yTolerance) {
    return FPDFText_GetCharIndexAtPos(textPage, x, y, xTolerance, yTolerance);
}

// Get font information for a character
EMSCRIPTEN_KEEPALIVE
unsigned long PDFium_GetFontInfo(FPDF_TEXTPAGE textPage, int charIndex,
                                  void* buffer, unsigned long bufferLen, int* flags) {
    return FPDFText_GetFontInfo(textPage, charIndex, buffer, bufferLen, flags);
}

// Get font weight for a character
EMSCRIPTEN_KEEPALIVE
int PDFium_GetFontWeight(FPDF_TEXTPAGE textPage, int charIndex) {
    return FPDFText_GetFontWeight(textPage, charIndex);
}

// Get text fill color
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL PDFium_GetFillColor(FPDF_TEXTPAGE textPage, int charIndex,
                               unsigned int* R, unsigned int* G,
                               unsigned int* B, unsigned int* A) {
    return FPDFText_GetFillColor(textPage, charIndex, R, G, B, A);
}

// Get text stroke color
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL PDFium_GetStrokeColor(FPDF_TEXTPAGE textPage, int charIndex,
                                 unsigned int* R, unsigned int* G,
                                 unsigned int* B, unsigned int* A) {
    return FPDFText_GetStrokeColor(textPage, charIndex, R, G, B, A);
}

// ============================================================================
// Text Selection API - Rectangle-based text selection
// ============================================================================

// Count selection rectangles for a range of characters
EMSCRIPTEN_KEEPALIVE
int PDFium_CountRects(FPDF_TEXTPAGE textPage, int startIndex, int count) {
    return FPDFText_CountRects(textPage, startIndex, count);
}

// Get a specific selection rectangle
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL PDFium_GetRect(FPDF_TEXTPAGE textPage, int rectIndex,
                          double* left, double* top,
                          double* right, double* bottom) {
    return FPDFText_GetRect(textPage, rectIndex, left, top, right, bottom);
}

// Get text within a bounding rectangle
EMSCRIPTEN_KEEPALIVE
int PDFium_GetBoundedText(FPDF_TEXTPAGE textPage, double left, double top,
                           double right, double bottom,
                           unsigned short* buffer, int bufferLen) {
    return FPDFText_GetBoundedText(textPage, left, top, right, bottom, buffer, bufferLen);
}

// ============================================================================
// Text Search API - Find text within a page
// ============================================================================

// Start a text search
EMSCRIPTEN_KEEPALIVE
FPDF_SCHHANDLE PDFium_FindStart(FPDF_TEXTPAGE textPage, const unsigned short* findWhat,
                                 unsigned long flags, int startIndex) {
    return FPDFText_FindStart(textPage, findWhat, flags, startIndex);
}

// Find next occurrence
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL PDFium_FindNext(FPDF_SCHHANDLE searchHandle) {
    return FPDFText_FindNext(searchHandle);
}

// Find previous occurrence
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL PDFium_FindPrev(FPDF_SCHHANDLE searchHandle) {
    return FPDFText_FindPrev(searchHandle);
}

// Get the character index of the search result
EMSCRIPTEN_KEEPALIVE
int PDFium_GetSchResultIndex(FPDF_SCHHANDLE searchHandle) {
    return FPDFText_GetSchResultIndex(searchHandle);
}

// Get the number of characters in the search result
EMSCRIPTEN_KEEPALIVE
int PDFium_GetSchCount(FPDF_SCHHANDLE searchHandle) {
    return FPDFText_GetSchCount(searchHandle);
}

// Close the search handle
EMSCRIPTEN_KEEPALIVE
void PDFium_FindClose(FPDF_SCHHANDLE searchHandle) {
    FPDFText_FindClose(searchHandle);
}

EMSCRIPTEN_KEEPALIVE
unsigned long PDFium_GetLastError() {
    return FPDF_GetLastError();
}

EMSCRIPTEN_KEEPALIVE
unsigned long PDFium_GetMetaText(FPDF_DOCUMENT doc, const char* tag,
                                  unsigned short* buffer, unsigned long bufferLen) {
    return FPDF_GetMetaText(doc, tag, buffer, bufferLen);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOKMARK PDFium_GetFirstBookmark(FPDF_DOCUMENT doc) {
    return FPDFBookmark_GetFirstChild(doc, nullptr);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOKMARK PDFium_GetNextBookmark(FPDF_DOCUMENT doc, FPDF_BOOKMARK bookmark) {
    return FPDFBookmark_GetNextSibling(doc, bookmark);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOKMARK PDFium_GetFirstChildBookmark(FPDF_DOCUMENT doc, FPDF_BOOKMARK bookmark) {
    return FPDFBookmark_GetFirstChild(doc, bookmark);
}

EMSCRIPTEN_KEEPALIVE
unsigned long PDFium_GetBookmarkTitle(FPDF_BOOKMARK bookmark,
                                       unsigned short* buffer, unsigned long bufferLen) {
    return FPDFBookmark_GetTitle(bookmark, buffer, bufferLen);
}

EMSCRIPTEN_KEEPALIVE
FPDF_DEST PDFium_GetBookmarkDest(FPDF_DOCUMENT doc, FPDF_BOOKMARK bookmark) {
    return FPDFBookmark_GetDest(doc, bookmark);
}

EMSCRIPTEN_KEEPALIVE
int PDFium_GetDestPageIndex(FPDF_DOCUMENT doc, FPDF_DEST dest) {
    return FPDFDest_GetDestPageIndex(doc, dest);
}

EMSCRIPTEN_KEEPALIVE
void* PDFium_Malloc(int size) {
    return malloc(size);
}

EMSCRIPTEN_KEEPALIVE
void PDFium_Free(void* ptr) {
    if (ptr) {
        free(ptr);
    }
}

// ============================================================================
// Annotation API - Direct PDFium function wrappers
// ============================================================================

// Page-level annotation functions
EMSCRIPTEN_KEEPALIVE
int FPDFPage_GetAnnotCount_W(FPDF_PAGE page) {
    return FPDFPage_GetAnnotCount(page);
}

EMSCRIPTEN_KEEPALIVE
FPDF_ANNOTATION FPDFPage_GetAnnot_W(FPDF_PAGE page, int index) {
    return FPDFPage_GetAnnot(page, index);
}

EMSCRIPTEN_KEEPALIVE
int FPDFPage_GetAnnotIndex_W(FPDF_PAGE page, FPDF_ANNOTATION annot) {
    return FPDFPage_GetAnnotIndex(page, annot);
}

EMSCRIPTEN_KEEPALIVE
void FPDFPage_CloseAnnot_W(FPDF_ANNOTATION annot) {
    FPDFPage_CloseAnnot(annot);
}

EMSCRIPTEN_KEEPALIVE
FPDF_ANNOTATION FPDFPage_CreateAnnot_W(FPDF_PAGE page, FPDF_ANNOTATION_SUBTYPE subtype) {
    return FPDFPage_CreateAnnot(page, subtype);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFPage_RemoveAnnot_W(FPDF_PAGE page, int index) {
    return FPDFPage_RemoveAnnot(page, index);
}

// Annotation subtype and support
EMSCRIPTEN_KEEPALIVE
FPDF_ANNOTATION_SUBTYPE FPDFAnnot_GetSubtype_W(FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetSubtype(annot);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_IsObjectSupportedSubtype_W(FPDF_ANNOTATION_SUBTYPE subtype) {
    return FPDFAnnot_IsObjectSupportedSubtype(subtype);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_IsSupportedSubtype_W(FPDF_ANNOTATION_SUBTYPE subtype) {
    return FPDFAnnot_IsSupportedSubtype(subtype);
}

// Annotation rectangle
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_GetRect_W(FPDF_ANNOTATION annot, FS_RECTF* rect) {
    return FPDFAnnot_GetRect(annot, rect);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_SetRect_W(FPDF_ANNOTATION annot, const FS_RECTF* rect) {
    return FPDFAnnot_SetRect(annot, rect);
}

// Annotation color
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_GetColor_W(FPDF_ANNOTATION annot, FPDFANNOT_COLORTYPE type,
                                unsigned int* R, unsigned int* G,
                                unsigned int* B, unsigned int* A) {
    return FPDFAnnot_GetColor(annot, type, R, G, B, A);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_SetColor_W(FPDF_ANNOTATION annot, FPDFANNOT_COLORTYPE type,
                                unsigned int R, unsigned int G,
                                unsigned int B, unsigned int A) {
    return FPDFAnnot_SetColor(annot, type, R, G, B, A);
}

// Annotation flags
EMSCRIPTEN_KEEPALIVE
int FPDFAnnot_GetFlags_W(FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetFlags(annot);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_SetFlags_W(FPDF_ANNOTATION annot, int flags) {
    return FPDFAnnot_SetFlags(annot, flags);
}

// Annotation dictionary key/value
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_HasKey_W(FPDF_ANNOTATION annot, FPDF_BYTESTRING key) {
    return FPDFAnnot_HasKey(annot, key);
}

EMSCRIPTEN_KEEPALIVE
FPDF_OBJECT_TYPE FPDFAnnot_GetValueType_W(FPDF_ANNOTATION annot, FPDF_BYTESTRING key) {
    return FPDFAnnot_GetValueType(annot, key);
}

EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAnnot_GetStringValue_W(FPDF_ANNOTATION annot, FPDF_BYTESTRING key,
                                          FPDF_WCHAR* buffer, unsigned long bufferLen) {
    return FPDFAnnot_GetStringValue(annot, key, buffer, bufferLen);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_SetStringValue_W(FPDF_ANNOTATION annot, FPDF_BYTESTRING key,
                                      FPDF_WIDESTRING value) {
    return FPDFAnnot_SetStringValue(annot, key, value);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_GetNumberValue_W(FPDF_ANNOTATION annot, FPDF_BYTESTRING key, float* value) {
    return FPDFAnnot_GetNumberValue(annot, key, value);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_SetAP_W(FPDF_ANNOTATION annot, FPDF_ANNOT_APPEARANCEMODE appearanceMode,
                             FPDF_WIDESTRING value) {
    return FPDFAnnot_SetAP(annot, appearanceMode, value);
}

EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAnnot_GetAP_W(FPDF_ANNOTATION annot, FPDF_ANNOT_APPEARANCEMODE appearanceMode,
                                 FPDF_WCHAR* buffer, unsigned long bufferLen) {
    return FPDFAnnot_GetAP(annot, appearanceMode, buffer, bufferLen);
}

// Attachment points (QuadPoints) for markup annotations
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_HasAttachmentPoints_W(FPDF_ANNOTATION annot) {
    return FPDFAnnot_HasAttachmentPoints(annot);
}

EMSCRIPTEN_KEEPALIVE
size_t FPDFAnnot_CountAttachmentPoints_W(FPDF_ANNOTATION annot) {
    return FPDFAnnot_CountAttachmentPoints(annot);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_GetAttachmentPoints_W(FPDF_ANNOTATION annot, size_t quad_index,
                                           FS_QUADPOINTSF* quad_points) {
    return FPDFAnnot_GetAttachmentPoints(annot, quad_index, quad_points);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_SetAttachmentPoints_W(FPDF_ANNOTATION annot, size_t quad_index,
                                           const FS_QUADPOINTSF* quad_points) {
    return FPDFAnnot_SetAttachmentPoints(annot, quad_index, quad_points);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_AppendAttachmentPoints_W(FPDF_ANNOTATION annot,
                                              const FS_QUADPOINTSF* quad_points) {
    return FPDFAnnot_AppendAttachmentPoints(annot, quad_points);
}

// Ink annotation
EMSCRIPTEN_KEEPALIVE
int FPDFAnnot_AddInkStroke_W(FPDF_ANNOTATION annot, const FS_POINTF* points,
                              size_t point_count) {
    return FPDFAnnot_AddInkStroke(annot, points, point_count);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_RemoveInkList_W(FPDF_ANNOTATION annot) {
    return FPDFAnnot_RemoveInkList(annot);
}

// Line annotation
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_GetLine_W(FPDF_ANNOTATION annot, FS_POINTF* start, FS_POINTF* end) {
    return FPDFAnnot_GetLine(annot, start, end);
}

// Border
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_GetBorder_W(FPDF_ANNOTATION annot, float* horizontal_radius,
                                 float* vertical_radius, float* border_width) {
    return FPDFAnnot_GetBorder(annot, horizontal_radius, vertical_radius, border_width);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_SetBorder_W(FPDF_ANNOTATION annot, float horizontal_radius,
                                 float vertical_radius, float border_width) {
    return FPDFAnnot_SetBorder(annot, horizontal_radius, vertical_radius, border_width);
}

// Annotation objects (for stamp, freetext, etc.)
EMSCRIPTEN_KEEPALIVE
int FPDFAnnot_GetObjectCount_W(FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetObjectCount(annot);
}

EMSCRIPTEN_KEEPALIVE
FPDF_PAGEOBJECT FPDFAnnot_GetObject_W(FPDF_ANNOTATION annot, int index) {
    return FPDFAnnot_GetObject(annot, index);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_AppendObject_W(FPDF_ANNOTATION annot, FPDF_PAGEOBJECT obj) {
    return FPDFAnnot_AppendObject(annot, obj);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_UpdateObject_W(FPDF_ANNOTATION annot, FPDF_PAGEOBJECT obj) {
    return FPDFAnnot_UpdateObject(annot, obj);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_RemoveObject_W(FPDF_ANNOTATION annot, int index) {
    return FPDFAnnot_RemoveObject(annot, index);
}

// Linked annotation (popup)
EMSCRIPTEN_KEEPALIVE
FPDF_ANNOTATION FPDFAnnot_GetLinkedAnnot_W(FPDF_ANNOTATION annot, FPDF_BYTESTRING key) {
    return FPDFAnnot_GetLinkedAnnot(annot, key);
}

// Vertices for polygon/polyline annotations
EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAnnot_GetVertices_W(FPDF_ANNOTATION annot, FS_POINTF* buffer,
                                       unsigned long length) {
    return FPDFAnnot_GetVertices(annot, buffer, length);
}

// Ink list paths
EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAnnot_GetInkListCount_W(FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetInkListCount(annot);
}

EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAnnot_GetInkListPath_W(FPDF_ANNOTATION annot, unsigned long path_index,
                                          FS_POINTF* buffer, unsigned long length) {
    return FPDFAnnot_GetInkListPath(annot, path_index, buffer, length);
}

// Form field related
EMSCRIPTEN_KEEPALIVE
FPDF_FORMHANDLE FPDFDOC_InitFormFillEnvironment_W(FPDF_DOCUMENT document,
                                                   FPDF_FORMFILLINFO* formInfo) {
    return FPDFDOC_InitFormFillEnvironment(document, formInfo);
}

EMSCRIPTEN_KEEPALIVE
void FPDFDOC_ExitFormFillEnvironment_W(FPDF_FORMHANDLE hHandle) {
    FPDFDOC_ExitFormFillEnvironment(hHandle);
}

// Form fill lifecycle / interaction
EMSCRIPTEN_KEEPALIVE
void FORM_OnAfterLoadPage_W(FPDF_PAGE page, FPDF_FORMHANDLE hHandle) {
    FORM_OnAfterLoadPage(page, hHandle);
}

EMSCRIPTEN_KEEPALIVE
void FORM_OnBeforeClosePage_W(FPDF_PAGE page, FPDF_FORMHANDLE hHandle) {
    FORM_OnBeforeClosePage(page, hHandle);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FORM_OnLButtonDown_W(FPDF_FORMHANDLE hHandle, FPDF_PAGE page,
                               int modifier, double page_x, double page_y) {
    return FORM_OnLButtonDown(hHandle, page, modifier, page_x, page_y);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FORM_OnLButtonUp_W(FPDF_FORMHANDLE hHandle, FPDF_PAGE page,
                             int modifier, double page_x, double page_y) {
    return FORM_OnLButtonUp(hHandle, page, modifier, page_x, page_y);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FORM_ForceToKillFocus_W(FPDF_FORMHANDLE hHandle) {
    return FORM_ForceToKillFocus(hHandle);
}

EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAnnot_GetFormFieldName_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot,
                                            FPDF_WCHAR* buffer, unsigned long bufferLen) {
    return FPDFAnnot_GetFormFieldName(hHandle, annot, buffer, bufferLen);
}

EMSCRIPTEN_KEEPALIVE
int FPDFAnnot_GetFormFieldType_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetFormFieldType(hHandle, annot);
}

EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAnnot_GetFormFieldValue_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot,
                                             FPDF_WCHAR* buffer, unsigned long bufferLen) {
    return FPDFAnnot_GetFormFieldValue(hHandle, annot, buffer, bufferLen);
}

EMSCRIPTEN_KEEPALIVE
int FPDFAnnot_GetFormFieldFlags_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetFormFieldFlags(hHandle, annot);
}

EMSCRIPTEN_KEEPALIVE
int FPDFAnnot_GetOptionCount_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetOptionCount(hHandle, annot);
}

EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAnnot_GetOptionLabel_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot,
                                          int index, FPDF_WCHAR* buffer, unsigned long bufferLen) {
    return FPDFAnnot_GetOptionLabel(hHandle, annot, index, buffer, bufferLen);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_IsOptionSelected_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot, int index) {
    return FPDFAnnot_IsOptionSelected(hHandle, annot, index);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_GetFontSize_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot, float* value) {
    return FPDFAnnot_GetFontSize(hHandle, annot, value);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_IsChecked_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot) {
    return FPDFAnnot_IsChecked(hHandle, annot);
}

// Focus annotation
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_SetFocusableSubtypes_W(FPDF_FORMHANDLE hHandle,
                                            const FPDF_ANNOTATION_SUBTYPE* subtypes,
                                            size_t count) {
    return FPDFAnnot_SetFocusableSubtypes(hHandle, subtypes, count);
}

EMSCRIPTEN_KEEPALIVE
int FPDFAnnot_GetFocusableSubtypesCount_W(FPDF_FORMHANDLE hHandle) {
    return FPDFAnnot_GetFocusableSubtypesCount(hHandle);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_GetFocusableSubtypes_W(FPDF_FORMHANDLE hHandle,
                                            FPDF_ANNOTATION_SUBTYPE* subtypes,
                                            size_t count) {
    return FPDFAnnot_GetFocusableSubtypes(hHandle, subtypes, count);
}

// URI actions
EMSCRIPTEN_KEEPALIVE
FPDF_LINK FPDFAnnot_GetLink_W(FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetLink(annot);
}

// Link / Action helpers (needed to resolve URI and internal destinations)
EMSCRIPTEN_KEEPALIVE
FPDF_ACTION FPDFLink_GetAction_W(FPDF_LINK link) {
    return FPDFLink_GetAction(link);
}

EMSCRIPTEN_KEEPALIVE
FPDF_DEST FPDFLink_GetDest_W(FPDF_DOCUMENT doc, FPDF_LINK link) {
    return FPDFLink_GetDest(doc, link);
}

EMSCRIPTEN_KEEPALIVE
int FPDFAction_GetType_W(FPDF_ACTION action) {
    return FPDFAction_GetType(action);
}

EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAction_GetURIPath_W(FPDF_DOCUMENT doc, FPDF_ACTION action,
                                      char* buffer, unsigned long buflen) {
    return FPDFAction_GetURIPath(doc, action, buffer, buflen);
}

EMSCRIPTEN_KEEPALIVE
FPDF_DEST FPDFAction_GetDest_W(FPDF_DOCUMENT doc, FPDF_ACTION action) {
    return FPDFAction_GetDest(doc, action);
}

EMSCRIPTEN_KEEPALIVE
int FPDFAnnot_GetFormControlCount_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetFormControlCount(hHandle, annot);
}

EMSCRIPTEN_KEEPALIVE
int FPDFAnnot_GetFormControlIndex_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot) {
    return FPDFAnnot_GetFormControlIndex(hHandle, annot);
}

EMSCRIPTEN_KEEPALIVE
unsigned long FPDFAnnot_GetFormFieldExportValue_W(FPDF_FORMHANDLE hHandle, FPDF_ANNOTATION annot,
                                                   FPDF_WCHAR* buffer, unsigned long bufferLen) {
    return FPDFAnnot_GetFormFieldExportValue(hHandle, annot, buffer, bufferLen);
}

EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFAnnot_SetURI_W(FPDF_ANNOTATION annot, const char* uri) {
    return FPDFAnnot_SetURI(annot, uri);
}

// ============================================================================
// Page Object API - Create and manipulate page objects (text, path, image)
// ============================================================================

// Load a standard PDF font (one of the 14 standard fonts)
// font_name: "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
//            "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
//            "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
//            "Symbol", "ZapfDingbats"
EMSCRIPTEN_KEEPALIVE
FPDF_FONT FPDFText_LoadStandardFont_W(FPDF_DOCUMENT document, const char* font_name) {
    return FPDFText_LoadStandardFont(document, font_name);
}

// Create a new text object using the specified font
EMSCRIPTEN_KEEPALIVE
FPDF_PAGEOBJECT FPDFPageObj_CreateTextObj_W(FPDF_DOCUMENT document, FPDF_FONT font, float font_size) {
    return FPDFPageObj_CreateTextObj(document, font, font_size);
}

// Set the text for a text object (UTF-16LE encoded)
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFText_SetText_W(FPDF_PAGEOBJECT text_object, FPDF_WIDESTRING text) {
    return FPDFText_SetText(text_object, text);
}

// Set the fill color for a page object (RGBA, 0-255)
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFPageObj_SetFillColor_W(FPDF_PAGEOBJECT page_object,
                                      unsigned int R, unsigned int G,
                                      unsigned int B, unsigned int A) {
    return FPDFPageObj_SetFillColor(page_object, R, G, B, A);
}

// Set the stroke color for a page object (RGBA, 0-255)
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFPageObj_SetStrokeColor_W(FPDF_PAGEOBJECT page_object,
                                        unsigned int R, unsigned int G,
                                        unsigned int B, unsigned int A) {
    return FPDFPageObj_SetStrokeColor(page_object, R, G, B, A);
}

// Transform a page object using a matrix (a, b, c, d, e, f)
// The transformation matrix is: [a b 0; c d 0; e f 1]
EMSCRIPTEN_KEEPALIVE
void FPDFPageObj_Transform_W(FPDF_PAGEOBJECT page_object,
                              double a, double b, double c, double d, double e, double f) {
    FPDFPageObj_Transform(page_object, a, b, c, d, e, f);
}

// Get the bounds of a page object
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFPageObj_GetBounds_W(FPDF_PAGEOBJECT page_object,
                                   float* left, float* bottom, float* right, float* top) {
    return FPDFPageObj_GetBounds(page_object, left, bottom, right, top);
}

// Create a new image object
EMSCRIPTEN_KEEPALIVE
FPDF_PAGEOBJECT FPDFPageObj_NewImageObj_W(FPDF_DOCUMENT document) {
    return FPDFPageObj_NewImageObj(document);
}

// Set a bitmap into an image object
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFImageObj_SetBitmap_W(FPDF_PAGE* pages, int count, FPDF_PAGEOBJECT image_object, FPDF_BITMAP bitmap) {
    return FPDFImageObj_SetBitmap(pages, count, image_object, bitmap);
}

// Set the transform matrix for an image object
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFImageObj_SetMatrix_W(FPDF_PAGEOBJECT image_object,
                                    double a, double b, double c, double d, double e, double f) {
    return FPDFImageObj_SetMatrix(image_object, a, b, c, d, e, f);
}

// Destroy a page object (only call if not added to page/annotation)
EMSCRIPTEN_KEEPALIVE
void FPDFPageObj_Destroy_W(FPDF_PAGEOBJECT page_object) {
    FPDFPageObj_Destroy(page_object);
}

// Close/release a font object
EMSCRIPTEN_KEEPALIVE
void FPDFFont_Close_W(FPDF_FONT font) {
    FPDFFont_Close(font);
}

// Set text rendering mode
// 0 = Fill, 1 = Stroke, 2 = Fill+Stroke, 3 = Invisible,
// 4 = Fill+Clip, 5 = Stroke+Clip, 6 = Fill+Stroke+Clip, 7 = Clip
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFTextObj_SetTextRenderMode_W(FPDF_PAGEOBJECT text_object, int render_mode) {
    return FPDFTextObj_SetTextRenderMode(text_object, static_cast<FPDF_TEXT_RENDERMODE>(render_mode));
}

// Get text rendering mode
EMSCRIPTEN_KEEPALIVE
int FPDFTextObj_GetTextRenderMode_W(FPDF_PAGEOBJECT text_object) {
    return static_cast<int>(FPDFTextObj_GetTextRenderMode(text_object));
}

// ============================================================================
// Page Object Manipulation API - Insert objects directly into page content
// ============================================================================

// Insert a page object into a page's content stream
// This is used to "flatten" objects into the page (e.g., draw text directly on page)
EMSCRIPTEN_KEEPALIVE
void FPDFPage_InsertObject_W(FPDF_PAGE page, FPDF_PAGEOBJECT page_object) {
    FPDFPage_InsertObject(page, page_object);
}

// Generate the page content stream after inserting objects
// Must be called after FPDFPage_InsertObject to commit changes
EMSCRIPTEN_KEEPALIVE
FPDF_BOOL FPDFPage_GenerateContent_W(FPDF_PAGE page) {
    return FPDFPage_GenerateContent(page);
}

// ============================================================================
// PDF Save/Download API - Save document to memory buffer
// ============================================================================

// Custom file writer structure for saving to memory
struct MemoryFileWriter {
    std::vector<uint8_t> buffer;
};

// Write block callback for FPDF_SaveAsCopy
static int WriteBlockCallback(FPDF_FILEWRITE* pThis, const void* data, unsigned long size) {
    MemoryFileWriter* writer = reinterpret_cast<MemoryFileWriter*>(pThis);
    const uint8_t* bytes = static_cast<const uint8_t*>(data);
    writer->buffer.insert(writer->buffer.end(), bytes, bytes + size);
    return 1;  // Return non-zero on success
}

// Global buffer to hold saved PDF data (managed by the wrapper)
static std::vector<uint8_t> g_savedPdfBuffer;

// Save document to memory and return pointer to buffer
// Returns the size of the saved PDF, or 0 on failure
// The buffer can be accessed via PDFium_GetSaveBuffer()
EMSCRIPTEN_KEEPALIVE
int PDFium_SaveToMemory(FPDF_DOCUMENT doc, int flags) {
    if (!doc) {
        return 0;
    }

    // Clear any previous saved data
    g_savedPdfBuffer.clear();

    // Create file writer with callback
    struct FileWriterWithCallback : FPDF_FILEWRITE {
        std::vector<uint8_t> buffer;
    };

    FileWriterWithCallback writer;
    writer.version = 1;
    writer.WriteBlock = [](FPDF_FILEWRITE* pThis, const void* data, unsigned long size) -> int {
        FileWriterWithCallback* w = static_cast<FileWriterWithCallback*>(pThis);
        const uint8_t* bytes = static_cast<const uint8_t*>(data);
        w->buffer.insert(w->buffer.end(), bytes, bytes + size);
        return 1;
    };

    // Save the document
    // flags: FPDF_INCREMENTAL = 1, FPDF_NO_INCREMENTAL = 2, FPDF_REMOVE_SECURITY = 3
    FPDF_BOOL success = FPDF_SaveAsCopy(doc, &writer, flags);

    if (success) {
        g_savedPdfBuffer = std::move(writer.buffer);
        return static_cast<int>(g_savedPdfBuffer.size());
    }

    return 0;
}

// Get pointer to the saved PDF buffer
EMSCRIPTEN_KEEPALIVE
const uint8_t* PDFium_GetSaveBuffer() {
    if (g_savedPdfBuffer.empty()) {
        return nullptr;
    }
    return g_savedPdfBuffer.data();
}

// Get the size of the saved PDF buffer
EMSCRIPTEN_KEEPALIVE
int PDFium_GetSaveBufferSize() {
    return static_cast<int>(g_savedPdfBuffer.size());
}

// Free the saved PDF buffer
EMSCRIPTEN_KEEPALIVE
void PDFium_FreeSaveBuffer() {
    g_savedPdfBuffer.clear();
    g_savedPdfBuffer.shrink_to_fit();
}

// Save document with version control
// version: 14 = PDF 1.4, 15 = PDF 1.5, 16 = PDF 1.6, 17 = PDF 1.7, 20 = PDF 2.0
EMSCRIPTEN_KEEPALIVE
int PDFium_SaveToMemoryWithVersion(FPDF_DOCUMENT doc, int flags, int version) {
    if (!doc) {
        return 0;
    }

    // Clear any previous saved data
    g_savedPdfBuffer.clear();

    // Create file writer with callback
    struct FileWriterWithCallback : FPDF_FILEWRITE {
        std::vector<uint8_t> buffer;
    };

    FileWriterWithCallback writer;
    writer.version = 1;
    writer.WriteBlock = [](FPDF_FILEWRITE* pThis, const void* data, unsigned long size) -> int {
        FileWriterWithCallback* w = static_cast<FileWriterWithCallback*>(pThis);
        const uint8_t* bytes = static_cast<const uint8_t*>(data);
        w->buffer.insert(w->buffer.end(), bytes, bytes + size);
        return 1;
    };

    // Save the document with specific PDF version
    FPDF_BOOL success = FPDF_SaveWithVersion(doc, &writer, flags, version);

    if (success) {
        g_savedPdfBuffer = std::move(writer.buffer);
        return static_cast<int>(g_savedPdfBuffer.size());
    }

    return 0;
}

} // extern "C"
