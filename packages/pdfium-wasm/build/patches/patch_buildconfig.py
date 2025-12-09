#!/usr/bin/env python3
"""Patch build/config/BUILDCONFIG.gn to allow emscripten as a valid target_os"""

import re
import sys

BUILDCONFIG_FILE = "build/config/BUILDCONFIG.gn"

try:
    with open(BUILDCONFIG_FILE, "r") as f:
        content = f.read()
except FileNotFoundError:
    print(f"  Warning: {BUILDCONFIG_FILE} not found")
    sys.exit(0)

# Replace the emscripten block that has an assertion with one that sets a toolchain
old_block = '''} else if (target_os == "emscripten") {
  # Because it's too hard to remove all targets from //BUILD.gn that do not work with it.
  assert(
      false,
      "emscripten is not a supported target_os. It is available only as secondary toolchain.")'''

new_block = '''} else if (target_os == "emscripten") {
  # Patched to allow emscripten as primary target for WebAssembly builds
  _default_toolchain = "//build/toolchain/wasm:wasm"'''

if old_block in content:
    content = content.replace(old_block, new_block)
    print("  ✓ Patch applied: replaced emscripten assertion block")
else:
    # Try with different whitespace
    pattern = r'\} else if \(target_os == "emscripten"\) \{\s*#[^\n]*\n\s*assert\(\s*false,\s*"emscripten is not a supported target_os[^"]*"\)'
    if re.search(pattern, content):
        content = re.sub(pattern, '''} else if (target_os == "emscripten") {
  # Patched to allow emscripten as primary target for WebAssembly builds
  _default_toolchain = "//build/toolchain/wasm:wasm"''', content)
        print("  ✓ Patch applied via regex")
    else:
        print("  - Already patched or pattern not found")

with open(BUILDCONFIG_FILE, "w") as f:
    f.write(content)
