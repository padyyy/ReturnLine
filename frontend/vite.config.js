import { defineConfig } from 'vite';
import dataTools from './tools/data-tools.js';

// Relative base so the build also works from a GitHub Pages sub-path.
// dataTools: the "Add data" endpoints for `npm run dev` only (never part of the build).
export default defineConfig({
  base: './',
  plugins: [dataTools()],
});
