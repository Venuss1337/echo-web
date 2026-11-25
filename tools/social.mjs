// node tools/social.mjs <url> [out]   The picture shown when a link to the site is shared.
// The cover of the film itself, with the real playback dock floating over it.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , url = 'http://localhost:4173/', out = 'public/social.jpg'] = process.argv;
const b = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2, bypassCSP: true });
const p = await ctx.newPage();
await p.goto(url + '?capture');
await p.waitForFunction(() => window.ready === true, null, { timeout: 90000, polling: 200 });
await p.waitForTimeout(9500);
await p.addStyleTag({ content: `
  .pin, .rail { visibility: hidden !important; }
  .og { position: fixed; inset: 0; z-index: 50; color: #17182e; font-family: 'Stack Sans Notch Variable'; }
  .og p { position: absolute; left: 44px; bottom: 33px; font-weight: 500; font-size: 50px; line-height: 0.96; letter-spacing: -0.03em; }
  .og small { position: absolute; right: 46px; bottom: 40px; font: 400 25px/1.22 'Stack Sans Text Variable'; text-align: left; }
  .og img { position: absolute; width: 548px; left: 608px; top: 429px; filter: drop-shadow(0 4px 5px rgb(12 6 20 / 0.5)) drop-shadow(18px 34px 26px rgb(12 6 20 / 0.5)); }` });
await p.evaluate(() => {
  const w = window.__echo.world;
  w.resize(1200, 630, 2);
  w.pulses.length = 0;
  w.lean.x = w.lean.y = 0;
  w.render();
  const d = document.createElement('div');
  d.className = 'og';
  d.innerHTML = '<img src="./app/now-0-dock.webp" alt=""><p>A music player<br>for the records you keep</p><small>Local-first, open source.<br>For Windows.</small>';
  document.body.append(d);
});
await p.waitForTimeout(900);
const png = path.join(os.tmpdir(), 'echo-social.png');
await p.screenshot({ path: png });
await b.close();
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', 'scale=1200:630:flags=lanczos', '-q:v', '3', '-pix_fmt', 'yuvj444p', out]);
console.log(out, fs.statSync(out).size);
