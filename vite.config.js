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
      manifest: false,
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectManifest: {
        // El HTML nunca entra al precache: las navegaciones siempre van a red
        // (ver public/sw.js). Si se precacheara, workbox respondería el
        // index.html viejo antes de que corra el network-first y un rebuild
        // no llegaría al navegador hasta actualizar el service worker.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json}'],
        globIgnores: ['**/*.html']
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
