import { useState, useRef, useCallback } from 'react'
import { createPdfiumModule, type PDFiumModule } from '@pdfviewer/pdfium-wasm'
import './App.css'

interface DocumentHandle {
  ptr: number
  pageCount: number
}

function App() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const moduleRef = useRef<PDFiumModule | null>(null)
  const documentRef = useRef<DocumentHandle | null>(null)

  // Initialize PDFium module
  const ensureInitialized = useCallback(async () => {
    if (moduleRef.current) return moduleRef.current
    
    setLoading(true)
    setError(null)
    try {
      const module = await createPdfiumModule()
      // Initialize the PDFium library
      module._PDFium_Init()
      moduleRef.current = module
      return module
    } catch (err) {
      setError(`Failed to initialize PDFium: ${err}`)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // Load PDF file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const module = await ensureInitialized()
    if (!module) return

    setLoading(true)
    setError(null)

    try {
      // Close previous document
      if (documentRef.current) {
        module._PDFium_CloseDocument(documentRef.current.ptr)
        documentRef.current = null
      }

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer()
      const data = new Uint8Array(arrayBuffer)

      // Allocate memory and copy PDF data
      const dataPtr = module._malloc(data.length)
      module.HEAPU8.set(data, dataPtr)

      // Load the document
      const docPtr = module._PDFium_LoadMemDocument(dataPtr, data.length, 0)
      module._free(dataPtr)

      if (!docPtr) {
        const errorCode = module._PDFium_GetLastError()
        throw new Error(`Failed to load PDF (error code: ${errorCode})`)
      }

      const pages = module._PDFium_GetPageCount(docPtr)
      documentRef.current = { ptr: docPtr, pageCount: pages }
      
      setPageCount(pages)
      setCurrentPage(1)

      // Render first page
      renderPage(module, docPtr, 0)
    } catch (err) {
      setError(`${err}`)
    } finally {
      setLoading(false)
    }
  }

  // Render a page to canvas
  const renderPage = (module: PDFiumModule, docPtr: number, pageIndex: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      const pagePtr = module._PDFium_LoadPage(docPtr, pageIndex)
      if (!pagePtr) {
        throw new Error('Failed to load page')
      }

      const width = module._PDFium_GetPageWidth(pagePtr)
      const height = module._PDFium_GetPageHeight(pagePtr)
      const scale = 2 // Scale for better quality

      const renderWidth = Math.floor(width * scale)
      const renderHeight = Math.floor(height * scale)

      // Render page to RGBA buffer using simplified API
      const bufferPtr = module._PDFium_RenderPageBitmap(pagePtr, renderWidth, renderHeight, 0)
      if (!bufferPtr) {
        module._PDFium_ClosePage(pagePtr)
        throw new Error('Failed to render page')
      }

      // Copy pixel data (already in RGBA format from wrapper)
      const bufferSize = renderWidth * renderHeight * 4
      const pixelData = new Uint8ClampedArray(bufferSize)
      pixelData.set(module.HEAPU8.subarray(bufferPtr, bufferPtr + bufferSize))

      // Free the buffer
      module._PDFium_FreeBuffer(bufferPtr)

      // Create ImageData and draw to canvas
      const imageData = new ImageData(pixelData, renderWidth, renderHeight)
      
      canvas.width = renderWidth
      canvas.height = renderHeight
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.putImageData(imageData, 0, 0)
      }

      // Cleanup
      module._PDFium_ClosePage(pagePtr)
    } catch (err) {
      setError(`Failed to render page: ${err}`)
    }
  }

  // Page navigation
  const goToPage = (page: number) => {
    if (!moduleRef.current || !documentRef.current) return
    if (page < 1 || page > pageCount) return
    
    setCurrentPage(page)
    renderPage(moduleRef.current, documentRef.current.ptr, page - 1)
  }

  return (
    <div className="pdf-viewer">
      <h1>PDF Viewer</h1>
      
      <div className="controls">
        <input 
          type="file" 
          accept=".pdf" 
          onChange={handleFileChange}
          disabled={loading}
        />
      </div>

      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error">{error}</div>}

      {pageCount > 0 && (
        <div className="navigation">
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            ← Previous
          </button>
          <span>Page {currentPage} of {pageCount}</span>
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount}>
            Next →
          </button>
        </div>
      )}

      <div className="canvas-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}

export default App
