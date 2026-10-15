import { defineConfig } from 'vite';

// Relative base so the build works from any static host or sub path
// (Vercel, Netlify, GitHub Pages project sites). Routing uses the URL hash only.
export default defineConfig({
  base: './',
  build: { target: 'es2020', sourcemap: false },
});
