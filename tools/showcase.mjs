// node tools/showcase.mjs <url> [out dir]   The pictures in the README, taken from the running site.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , url = 'http://localhost:4173/', out = 'docs/showcase'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-showcase-'));
const b = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto(url + '?capture');
await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await p.waitForTimeout(9500);
const shots = { '1-cover': 0, '2-folder': 2.75, '3-instruments-float': 8.95, '4-bloom-count': 12.4, '5-evening': 26.1 };
for (const [name, t] of Object.entries(shots)) {
  await p.evaluate((x) => window.__echo.seek(x), t);
  await p.waitForTimeout(2200);
  const png = path.join(tmp, `${name}.png`);
  await p.screenshot({ path: png });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '84', '-compression_level', '6', path.join(out, `${name}.webp`)]);
}
await b.close();
