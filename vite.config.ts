import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Served as a GitHub Pages project site: https://subhayu.in/world/
export default defineConfig({
  base: '/world/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
});
