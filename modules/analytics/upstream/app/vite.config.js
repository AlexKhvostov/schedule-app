import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      // ApexCharts 6: без alias Vite тянет SSR-бандл, график в браузере пустой
      apexcharts: path.resolve(root, 'node_modules/apexcharts/dist/apexcharts.esm.js')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3010',
      '/health': 'http://127.0.0.1:3010'
    }
  },
  build: {
    // Простые имена без mixed-case hash — Hostland (Linux) + Total Commander
    // иначе легко получить 404 из‑за регистра или «пустого» assets/
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (info) => {
          const n = info.name || '';
          if (n.endsWith('.css')) return 'assets/app.css';
          return 'assets/[name][extname]';
        }
      }
    },
    chunkSizeWarningLimit: 1200
  }
});
