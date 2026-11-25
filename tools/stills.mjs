// node tools/stills.mjs <url> <out dir>   The prints that stand in for the film.
// Frames are taken from the film itself, without type, then encoded by ffmpeg.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , url = 'http://localhost:5310/', out = 'public/stills'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-stills-'));
const b = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, bypassCSP: true });
await p.goto(url + '?capture');
await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await p.waitForTimeout(8000);
await p.addStyleTag({ content: '.pin,.rail{visibility:hidden!important}' });
const at = await p.evaluate(() => window.__echo.cues);
const shots = {
  cover: 0, folder: at.folder + 1.5, sleeve: at.sleeve + 0.68, player: at.player + 2.8, light: at.light + 1.5,
  library: at.library + 1.6, radio: at.radio + 1.6, compact: at.compact + 1.2, source: at.end,
};
for (const [name, t] of Object.entries(shots)) {
  await p.evaluate((x) => window.__echo.seek(x), t);
  await p.waitForTimeout(900);
  const png = path.join(tmp, `${name}.png`);
  await p.screenshot({ path: png });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6', path.join(out, `${name}.webp`)]);
}
await b.close();
