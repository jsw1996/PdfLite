# Dockerfile for building PDFium as WebAssembly
# Uses emscripten to compile PDFium to WASM for web-based PDF viewing
#
# Build with: docker build -t pdfium-wasm-builder ./build
# Run with:   docker run --rm -v $(pwd)/dist:/build/output pdfium-wasm-builder

FROM ubuntu:22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install required dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-pip \
    curl \
    wget \
    lsb-release \
    sudo \
    pkg-config \
    libglib2.0-dev \
    ninja-build \
    xz-utils \
    build-essential \
    cmake \
    file \
    libfontconfig1 \
    libfreetype6-dev \
    libjpeg-dev \
    libpng-dev \
    zlib1g-dev \
    liblcms2-dev \
    libopenjp2-7-dev \
    && rm -rf /var/lib/apt/lists/*

# Create build directory
WORKDIR /build

# Install depot_tools (Google's build tools for Chromium-based projects)
RUN git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git /build/depot_tools
ENV PATH="/build/depot_tools:${PATH}"

# Install Emscripten SDK
RUN git clone https://github.com/emscripten-core/emsdk.git /build/emsdk \
    && cd /build/emsdk \
    && ./emsdk install 3.1.51 \
    && ./emsdk activate 3.1.51

# Set up Emscripten environment variables
ENV EMSDK=/build/emsdk
ENV PATH="/build/emsdk:/build/emsdk/upstream/emscripten:/build/emsdk/node/16.20.0_64bit/bin:${PATH}"
ENV EM_CONFIG=/build/emsdk/.emscripten
ENV EMSDK_NODE=/build/emsdk/node/16.20.0_64bit/bin/node

# Create PDFium source directory
RUN mkdir -p /build/pdfium_src
WORKDIR /build/pdfium_src

# Configure gclient to fetch PDFium
RUN gclient config --unmanaged https://pdfium.googlesource.com/pdfium.git

# Fetch PDFium source code (this takes a while - ~10GB)
# Using --no-history to speed up the fetch
RUN gclient sync --no-history

WORKDIR /build/pdfium_src/pdfium

# Note: We use the latest version since --no-history doesn't fetch branch refs
# The compile script will handle build configuration to avoid raw_ptr issues

# Install build dependencies for Linux (needed for some tools even when targeting wasm)
# Use non-interactive mode and pre-configure debconf to avoid prompts
RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive ./build/install-build-deps.sh --no-prompt --no-chromeos-fonts || true \
    && rm -rf /var/lib/apt/lists/*

# Copy the compile script and wrapper source
COPY compile.sh /build/compile.sh
COPY pdfium_wasm.cpp /build/scripts/pdfium_wasm.cpp
COPY patches/ /build/patches/
RUN chmod +x /build/compile.sh /build/patches/*.sh

# Create output directory
RUN mkdir -p /build/output

# Set the entry point to the compile script
ENTRYPOINT ["/build/compile.sh"]
