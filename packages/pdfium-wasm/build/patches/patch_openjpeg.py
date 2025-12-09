#!/usr/bin/env python3
"""Patch libopenjpeg to fix fseeko/ftello issue with Emscripten"""

import sys

OPENJPEG_INCLUDES = "third_party/libopenjpeg/opj_includes.h"

try:
    with open(OPENJPEG_INCLUDES, "r") as f:
        content = f.read()
except FileNotFoundError:
    print(f"  Warning: {OPENJPEG_INCLUDES} not found")
    sys.exit(0)

# Comment out the fseek/ftell to fseeko/ftello redefinitions that break Emscripten
old_defines = '''#  define fseek  fseeko
#  define ftell  ftello'''

new_defines = '''/* Patched for Emscripten: don't redefine fseek/ftell to fseeko/ftello */
#  ifdef __EMSCRIPTEN__
/* Use standard fseek/ftell for Emscripten */
#  else
#  define fseek  fseeko
#  define ftell  ftello
#  endif'''

if old_defines in content:
    content = content.replace(old_defines, new_defines)
    print("  ✓ fseeko/ftello patched successfully")
else:
    print("  - Already patched or pattern not found")

with open(OPENJPEG_INCLUDES, "w") as f:
    f.write(content)
