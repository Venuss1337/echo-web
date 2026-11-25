import { defineConfig } from 'vite';
import { sitePlugin } from './site.plugin.ts';

export default defineConfig({
  // Every path is relative, so the site works at a domain's root or in any subdirectory of it.
  base: './',
  plugins: [sitePlugin()],
  build: {
    target: 'es2022',
    // Three.js is one chunk, loaded only by visitors who see the film.
    chunkSizeWarningLimit: 800,
    modulePreload: { polyfill: false },
    // Other people's notices travel with their code.
    license: { fileName: 'licenses/third-party.md' },
    rolldownOptions: { output: { comments: { legal: true, annotation: false, jsdoc: false } } },
  },
});
