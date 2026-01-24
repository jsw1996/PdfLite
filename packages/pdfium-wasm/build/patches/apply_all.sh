#!/bin/bash
# Apply all patches required for PDFium WebAssembly build
# Uses git-style patch files for better maintainability and reviewability
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PDFIUM_DIR="${PDFIUM_DIR:-/build/pdfium_src/pdfium}"

echo "Applying patches to PDFium source..."
echo "PDFium directory: $PDFIUM_DIR"
echo ""

cd "$PDFIUM_DIR"

# Function to apply a patch with fallback to sed for simple replacements
apply_patch() {
    local patch_file="$1"
    local patch_name="$(basename "$patch_file")"
    
    echo "[$patch_name] Applying..."
    
    # Try git apply first (preferred method)
    if git apply --check "$patch_file" 2>/dev/null; then
        git apply "$patch_file"
        echo "  ✓ Applied successfully with git apply"
        return 0
    fi
    
    # If git apply fails, fall back to patch command
    if command -v patch &>/dev/null; then
        if patch -p1 --dry-run < "$patch_file" 2>/dev/null; then
            patch -p1 < "$patch_file"
            echo "  ✓ Applied successfully with patch"
            return 0
        fi
    fi
    
    echo "  - Patch may already be applied or needs manual intervention"
    return 0
}

# Apply patch 1: raw_ptr fix
# This is a simple string replacement, use sed as it's more reliable
echo "[1/5] Patching raw_ptr in fpdf_editpage.cpp..."
if grep -q "raw_ptr<CPDF_PageObject>" fpdfsdk/fpdf_editpage.cpp 2>/dev/null; then
    sed -i 's/raw_ptr<CPDF_PageObject>/CPDF_PageObject*/g' fpdfsdk/fpdf_editpage.cpp
    echo "  ✓ raw_ptr replaced with CPDF_PageObject*"
else
    echo "  - Already patched or pattern not found"
fi

# Apply patch 2: BUILDCONFIG.gn emscripten target
echo ""
echo "[2/5] Patching BUILDCONFIG.gn for emscripten target..."
BUILDCONFIG="build/config/BUILDCONFIG.gn"
if [ -f "$BUILDCONFIG" ]; then
    if grep -q 'emscripten is not a supported target_os' "$BUILDCONFIG" 2>/dev/null; then
        sed -i '/} else if (target_os == "emscripten") {/,/emscripten is not a supported target_os[^"]*")/{
            s/# Because it.*//
            s/assert(//
            s/false,//
            s/"emscripten is not a supported target_os.*/_default_toolchain = "\/\/build\/toolchain\/wasm:wasm"/
        }' "$BUILDCONFIG"
        # Clean up any remaining assertion syntax
        sed -i 's/^[[:space:]]*)[[:space:]]*$//' "$BUILDCONFIG"
        echo "  ✓ Emscripten assertion replaced with toolchain config"
    else
        echo "  - Already patched or pattern not found"
    fi
else
    echo "  - Warning: $BUILDCONFIG not found"
fi

# Apply patch 3: Disable skia
echo ""
echo "[3/5] Patching BUILD.gn to disable skia for emscripten..."
if [ -f "BUILD.gn" ]; then
    if grep -q 'checkout_skia && !is_android)' BUILD.gn && ! grep -q 'target_os != "emscripten"' BUILD.gn; then
        sed -i 's/if (defined(checkout_skia) && checkout_skia && !is_android) {/# Patched: Disabled skia for emscripten\/wasm builds\n  if (defined(checkout_skia) \&\& checkout_skia \&\& !is_android \&\& target_os != "emscripten") {/' BUILD.gn
        echo "  ✓ Skia dependency disabled for emscripten"
    else
        echo "  - Already patched or pattern not found"
    fi
else
    echo "  - Warning: BUILD.gn not found"
fi

# Apply patch 4: WASM toolchain flags
echo ""
echo "[4/5] Patching wasm toolchain BUILD.gn..."
WASM_TOOLCHAIN="build/toolchain/wasm/BUILD.gn"
if [ -f "$WASM_TOOLCHAIN" ]; then
    if ! grep -q "fno-stack-protector" "$WASM_TOOLCHAIN" 2>/dev/null; then
        sed -i '/toolchain_args = {/i\  extra_cflags = "-fno-stack-protector -Wno-unknown-warning-option -D_POSIX_C_SOURCE=200112"\n  extra_cxxflags = "-fno-stack-protector -Wno-unknown-warning-option -D_POSIX_C_SOURCE=200112"' "$WASM_TOOLCHAIN"
        echo "  ✓ WASM toolchain flags added"
    else
        echo "  - Already patched"
    fi
else
    echo "  - Warning: $WASM_TOOLCHAIN not found"
fi

# Apply patch 5: openjpeg fseeko fix
echo ""
echo "[5/5] Patching libopenjpeg for Emscripten..."
OPENJPEG="third_party/libopenjpeg/opj_includes.h"
if [ -f "$OPENJPEG" ]; then
    if grep -q '#  define fseek  fseeko' "$OPENJPEG" && ! grep -q '__EMSCRIPTEN__' "$OPENJPEG"; then
        sed -i 's/#  define fseek  fseeko\n#  define ftell  ftello/\/* Patched for Emscripten *\/\n#  ifdef __EMSCRIPTEN__\n\/* Use standard fseek\/ftell for Emscripten *\/\n#  else\n#  define fseek  fseeko\n#  define ftell  ftello\n#  endif/' "$OPENJPEG"
        # If multiline sed didn't work, try a different approach
        if ! grep -q '__EMSCRIPTEN__' "$OPENJPEG"; then
            # Use perl for multiline replacement
            perl -i -p0e 's/#  define fseek  fseeko\n#  define ftell  ftello/\/* Patched for Emscripten: dont redefine fseek\/ftell to fseeko\/ftello *\/\n#  ifdef __EMSCRIPTEN__\n\/* Use standard fseek\/ftell for Emscripten *\/\n#  else\n#  define fseek  fseeko\n#  define ftell  ftello\n#  endif/g' "$OPENJPEG"
        fi
        echo "  ✓ fseeko/ftello patched for Emscripten"
    else
        echo "  - Already patched or pattern not found"
    fi
else
    echo "  - Warning: $OPENJPEG not found"
fi

echo ""
echo "=========================================="
echo "All patches applied!"
echo "=========================================="
