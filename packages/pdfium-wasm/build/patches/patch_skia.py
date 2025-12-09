#!/usr/bin/env python3
"""Patch BUILD.gn to disable skia dependency for emscripten builds"""

import sys

BUILD_GN_FILE = "BUILD.gn"

try:
    with open(BUILD_GN_FILE, "r") as f:
        content = f.read()
except FileNotFoundError:
    print(f"  Warning: {BUILD_GN_FILE} not found")
    sys.exit(0)

# Comment out the skia dependency block
old_skia = '''  if (defined(checkout_skia) && checkout_skia && !is_android) {
    deps += [ "//skia" ]
  }'''

new_skia = '''  # Patched: Disabled skia for emscripten/wasm builds
  if (defined(checkout_skia) && checkout_skia && !is_android && target_os != "emscripten") {
    deps += [ "//skia" ]
  }'''

if old_skia in content:
    content = content.replace(old_skia, new_skia)
    print("  ✓ Skia dependency patched successfully")
else:
    print("  - Already patched or pattern not found")

with open(BUILD_GN_FILE, "w") as f:
    f.write(content)
