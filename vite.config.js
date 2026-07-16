import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'

export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: {
      stream: path.resolve('src/utils/streamMock.js'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-lib': ['react-pdf', 'pdfjs-dist'],
        },
      },
    },
  },
})
