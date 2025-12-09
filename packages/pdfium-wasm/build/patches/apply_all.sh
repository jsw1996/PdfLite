#!/bin/bash
# Apply all patches required for PDFium WebAssembly build
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Applying patches..."

echo ""
echo "[1/5] Patching raw_ptr in fpdf_editpage.cpp..."
bash "$SCRIPT_DIR/patch_raw_ptr.sh"

echo ""
echo "[2/5] Patching BUILDCONFIG.gn for emscripten target..."
python3 "$SCRIPT_DIR/patch_buildconfig.py"

echo ""
echo "[3/5] Patching BUILD.gn to disable skia..."
python3 "$SCRIPT_DIR/patch_skia.py"

echo ""
echo "[4/5] Patching wasm toolchain..."
bash "$SCRIPT_DIR/patch_wasm_toolchain.sh"

echo ""
echo "[5/5] Patching libopenjpeg for Emscripten..."
python3 "$SCRIPT_DIR/patch_openjpeg.py"

echo ""
echo "All patches applied!"
