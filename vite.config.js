import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'index' || chunkInfo.name === 'app') {
            return 'app.js';
          }
          return '[name].js';
        },
        chunkFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'style.css';
          }
          return '[name].[ext]';
        }
      }
    }
  }
});
