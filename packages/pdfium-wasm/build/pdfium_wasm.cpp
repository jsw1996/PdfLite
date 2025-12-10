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

} // extern "C"
