#!/bin/bash
# Patch fpdf_editpage.cpp to replace raw_ptr with regular pointer
# The raw_ptr template is part of Chromium's MiraclePtr and not available in standalone PDFium builds

echo "Patching fpdfsdk/fpdf_editpage.cpp for raw_ptr..."

if grep -q "raw_ptr<CPDF_PageObject>" fpdfsdk/fpdf_editpage.cpp; then
    sed -i 's/raw_ptr<CPDF_PageObject>/CPDF_PageObject*/g' fpdfsdk/fpdf_editpage.cpp
    echo "  ✓ Patch applied successfully."
else
    echo "  - No patching needed (already patched or pattern not found)"
fi
