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

EMSCRIPTEN_KEEPALIVE
void PDFium_RenderPageBitmap(FPDF_BITMAP bitmap, FPDF_PAGE page, int start_x, int start_y, 
                              int size_x, int size_y, int rotate, int flags) {
    FPDF_RenderPageBitmap(bitmap, page, start_x, start_y, size_x, size_y, rotate, flags);
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

} // extern "C"
