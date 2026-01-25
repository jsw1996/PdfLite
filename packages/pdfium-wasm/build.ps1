# Build the Docker image
Write-Host "Building PDFium WASM Docker image..." -ForegroundColor Cyan
Write-Host "This will take a while (downloading PDFium source ~10GB)" -ForegroundColor Yellow

# Ensure Docker is in PATH
$env:PATH = "$env:ProgramFiles\Docker\Docker\resources\bin;$env:PATH"

# Get the script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildDir = Join-Path $ScriptDir "build"
$WasmDir = Join-Path $ScriptDir "wasm"

# Create wasm directory if it doesn't exist
if (-not (Test-Path $WasmDir)) {
    New-Item -ItemType Directory -Path $WasmDir | Out-Null
}

# Build the Docker image
Write-Host "`nStep 1: Building Docker image..." -ForegroundColor Green
docker build -t pdfium-wasm-builder $BuildDir

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build Docker image" -ForegroundColor Red
    exit 1
}

# Run the container to compile PDFium to WASM
Write-Host "`nStep 2: Compiling PDFium to WebAssembly..." -ForegroundColor Green
docker run --rm -v "${WasmDir}:/build/output" pdfium-wasm-builder

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to compile PDFium to WASM" -ForegroundColor Red
    exit 1
}

Write-Host "`nBuild complete!" -ForegroundColor Green
Write-Host "Output files are in: $WasmDir" -ForegroundColor Cyan
Write-Host "  - pdfium.js    (JavaScript loader)"
Write-Host "  - pdfium.wasm  (WebAssembly binary)"
Write-Host ""
Write-Host "Note: TypeScript types are defined in src/index.ts (IPDFiumModule interface)"
