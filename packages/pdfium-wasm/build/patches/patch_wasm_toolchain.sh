#!/bin/bash
# Patch wasm toolchain BUILD.gn to add -fno-stack-protector flag

echo "Patching wasm toolchain to disable stack protector..."

WASM_TOOLCHAIN_GN="build/toolchain/wasm/BUILD.gn"

if [ -f "$WASM_TOOLCHAIN_GN" ]; then
    if ! grep -q "extra_cflags.*fno-stack-protector" "$WASM_TOOLCHAIN_GN"; then
        sed -i '/toolchain_args = {/i\  extra_cflags = "-fno-stack-protector -Wno-unknown-warning-option -D_POSIX_C_SOURCE=200112"\n  extra_cxxflags = "-fno-stack-protector -Wno-unknown-warning-option -D_POSIX_C_SOURCE=200112"' "$WASM_TOOLCHAIN_GN"
        echo "  ✓ wasm/BUILD.gn patched with -fno-stack-protector"
    else
        echo "  - Already patched"
    fi
else
    echo "  Warning: $WASM_TOOLCHAIN_GN not found"
fi
