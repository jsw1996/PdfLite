#!/bin/bash
# compile.sh - Script to compile PDFium to WebAssembly using Emscripten
set -e

echo "=========================================="
echo "PDFium WebAssembly Build Script"
echo "=========================================="

# Source Emscripten environment
source /build/emsdk/emsdk_env.sh

# Verify emscripten is available
echo "Checking Emscripten installation..."
emcc --version

# Navigate to PDFium source directory
cd /build/pdfium_src/pdfium

echo ""
echo "Step 0: Applying patches..."
echo "=========================================="
bash /build/patches/apply_all.sh

echo ""
echo "Step 1: Configuring GN build for WebAssembly using Emscripten..."
echo "=========================================="

# Create symlink so GN can find emscripten at the expected path
echo "Creating symlink for Emscripten SDK..."
mkdir -p /build/pdfium_src/pdfium/third_party/emsdk
ln -sf /build/emsdk/upstream /build/pdfium_src/pdfium/third_party/emsdk/upstream

# Configure PDFium to build with Emscripten toolchain targeting WebAssembly
mkdir -p out/Release

cat > out/Release/args.gn << 'EOF'
# PDFium WebAssembly Build Configuration using Emscripten
pdf_enable_v8 = false
pdf_enable_xfa = false
pdf_is_standalone = true
pdf_is_complete_lib = true
is_component_build = false
is_debug = false
is_clang = true
clang_use_chrome_plugins = false
use_custom_libcxx = false
pdf_use_skia = false
checkout_skia = false
use_glib = false
pdf_use_partition_alloc = false
treat_warnings_as_errors = false

# Emscripten/WebAssembly target configuration
target_os = "emscripten"
target_cpu = "wasm"
use_custom_libcxx_for_host = false

# Disable debug info features that cause issues
use_debug_fission = false
symbol_level = 0
enable_iterator_debugging = false

# Disable features not supported in WASM
use_allocator_shim = false
use_allocator = "none"
is_official_build = true
EOF

echo "Generating build files with GN for WebAssembly target..."
gn gen out/Release

echo ""
echo "Step 2: Building PDFium static library with Emscripten..."
echo "=========================================="
ninja -C out/Release pdfium

echo ""
echo "Step 3: Preparing WASM wrapper for Emscripten compilation..."
echo "=========================================="

# Copy the C++ wrapper file to the build directory
mkdir -p /build/wasm_build
cp /build/scripts/pdfium_wasm.cpp /build/wasm_build/pdfium_wasm.cpp
echo "WASM wrapper copied to /build/wasm_build/pdfium_wasm.cpp"

echo ""
echo "Step 4: Compiling WASM module with Emscripten..."
echo "=========================================="

# Find all static libraries from the PDFium build
cd /build/pdfium_src/pdfium

# The main pdfium library (already a complete static lib)
PDFIUM_LIB="out/Release/obj/libpdfium.a"

# Check if the library exists
if [ ! -f "$PDFIUM_LIB" ]; then
    echo "Error: $PDFIUM_LIB not found!"
    echo "Looking for available libraries..."
    find out/Release -name "*.a" -type f 2>/dev/null | head -20
    exit 1
fi

echo "Using PDFium library: $PDFIUM_LIB"

echo "Running em++..."
em++ \
    -std=c++17 \
    -O3 \
    -flto \
    -s WASM=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="createPDFiumModule" \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue","UTF16ToString","stringToUTF16","HEAPU8","HEAP16"]' \
    -s EXPORTED_FUNCTIONS='["_PDFium_Init","_PDFium_Destroy","_PDFium_LoadMemDocument","_PDFium_CloseDocument","_PDFium_GetPageCount","_PDFium_LoadPage","_PDFium_ClosePage","_PDFium_GetPageWidth","_PDFium_GetPageHeight","_PDFium_RenderPageBitmap","_PDFium_FreeBuffer","_PDFium_LoadPageText","_PDFium_ClosePageText","_PDFium_GetPageCharCount","_PDFium_GetPageText","_PDFium_GetLastError","_PDFium_GetMetaText","_PDFium_GetFirstBookmark","_PDFium_GetNextBookmark","_PDFium_GetFirstChildBookmark","_PDFium_GetBookmarkTitle","_PDFium_GetBookmarkDest","_PDFium_GetDestPageIndex","_PDFium_Malloc","_PDFium_Free","_malloc","_free"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=67108864 \
    -s MAXIMUM_MEMORY=536870912 \
    -s STACK_SIZE=1048576 \
    -s NO_EXIT_RUNTIME=1 \
    -s FILESYSTEM=0 \
    -s ENVIRONMENT='web,worker' \
    -s EXPORT_ES6=1 \
    -s SINGLE_FILE=0 \
    -s ASSERTIONS=0 \
    -s DISABLE_EXCEPTION_CATCHING=1 \
    -I/build/pdfium_src/pdfium \
    -I/build/pdfium_src/pdfium/public \
    -I/build/pdfium_src/pdfium/third_party/abseil-cpp \
    /build/wasm_build/pdfium_wasm.cpp \
    "$PDFIUM_LIB" \
    -o /build/output/pdfium.js


echo ""
echo "Step 5: Creating TypeScript declaration file..."
echo "=========================================="

cat > /build/output/pdfium.d.ts << 'DTSEOF'
/**
 * PDFium WebAssembly Module Type Definitions
 */

export interface PDFiumModule {
  _PDFium_Init(): number;
  _PDFium_Destroy(): void;
  _PDFium_LoadMemDocument(dataPtr: number, size: number, passwordPtr: number): number;
  _PDFium_CloseDocument(doc: number): void;
  _PDFium_GetPageCount(doc: number): number;
  _PDFium_LoadPage(doc: number, pageIndex: number): number;
  _PDFium_ClosePage(page: number): void;
  _PDFium_GetPageWidth(page: number): number;
  _PDFium_GetPageHeight(page: number): number;
  _PDFium_RenderPageBitmap(page: number, width: number, height: number, rotate: number): number;
  _PDFium_FreeBuffer(buffer: number): void;
  _PDFium_LoadPageText(page: number): number;
  _PDFium_ClosePageText(textPage: number): void;
  _PDFium_GetPageCharCount(textPage: number): number;
  _PDFium_GetPageText(textPage: number, buffer: number, bufferLen: number): number;
  _PDFium_GetLastError(): number;
  _PDFium_GetMetaText(doc: number, tag: number, buffer: number, bufferLen: number): number;
  _PDFium_GetFirstBookmark(doc: number): number;
  _PDFium_GetNextBookmark(doc: number, bookmark: number): number;
  _PDFium_GetFirstChildBookmark(doc: number, bookmark: number): number;
  _PDFium_GetBookmarkTitle(bookmark: number, buffer: number, bufferLen: number): number;
  _PDFium_GetBookmarkDest(doc: number, bookmark: number): number;
  _PDFium_GetDestPageIndex(doc: number, dest: number): number;
  _PDFium_Malloc(size: number): number;
  _PDFium_Free(ptr: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  ccall(name: string, returnType: string, argTypes: string[], args: any[]): any;
  cwrap(name: string, returnType: string, argTypes: string[]): (...args: any[]) => any;
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;
  UTF16ToString(ptr: number): string;
  stringToUTF16(str: string, buffer: number, maxBytes: number): void;
}

declare function createPDFiumModule(): Promise<PDFiumModule>;
export default createPDFiumModule;
DTSEOF

# Copy output files
echo ""
echo "Build complete! Output files:"
ls -la /build/output/

echo ""
echo "=========================================="
echo "Build completed successfully!"
echo "Output files are in /build/output/"
echo "  - pdfium.js    (JavaScript loader)"
echo "  - pdfium.wasm  (WebAssembly binary)"
echo "  - pdfium.d.ts  (TypeScript definitions)"
echo ""
echo "Usage:"
echo "  import createPDFiumModule from './pdfium.js';"
echo "  const module = await createPDFiumModule();"
echo "  module._PDFium_Init();"
echo "=========================================="
