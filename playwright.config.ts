import { defineConfig } from '@playwright/test';

const port = 4319;
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}/`,
    channel: 'chromium',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] },
  },
  webServer: { command: `bunx vite preview --port ${port} --strictPort`, port, reuseExistingServer: false },
});
