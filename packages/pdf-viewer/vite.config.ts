import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the path to the pdfium-wasm package's wasm folder
const pdfiumWasmPath = path.resolve(__dirname, 'node_modules/@pdfviewer/pdfium-wasm/wasm');

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-pdfium-wasm',
      configureServer(server) {
        // Serve pdfium.wasm from the pdfium-wasm package during dev
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith('/pdfium.wasm')) {
            const filePath = path.join(pdfiumWasmPath, 'pdfium.wasm');
            res.writeHead(200, { 'Content-Type': 'application/wasm' });
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
  ],
  optimizeDeps: {
    exclude: ['@pdfviewer/pdfium-wasm'],
  },
  assetsInclude: ['**/*.wasm'],
});
