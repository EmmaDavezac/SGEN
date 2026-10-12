import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    // Escuchar en todas las interfaces (IPv4 + IPv6) para que
    // http://localhost:5173 funcione en el navegador sin fallos de familia IP.
    host: true,
    port: 5173,
    strictPort: false
  },
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json}']
      }
    })
  ],
  build: {
    rollupOptions: {
      input: {
        app: 'index.html',
        notFound: '404.html'
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});
