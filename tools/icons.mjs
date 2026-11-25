// node tools/icons.mjs   Raster icons from public/mark.svg, for the places that cannot take a drawing.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const mark = fs.readFileSync('public/mark.svg', 'utf8');
const b = await chromium.launch({ channel: 'chromium', headless: true });
const p = await b.newPage();
/** The mark on a sheet, or on nothing. */
async function png(size, { paper, inset }) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<style>html,body{margin:0;background:${paper ? '#eff0f2' : 'transparent'}}svg{position:absolute;inset:${inset * 100}%;width:${(1 - inset * 2) * 100}%;height:${(1 - inset * 2) * 100}%}</style>${mark}`);
  return p.screenshot({ omitBackground: !paper });
}
fs.writeFileSync('public/apple-touch-icon.png', await png(180, { paper: true, inset: 0.2 }));
fs.writeFileSync('public/icon-192.png', await png(192, { paper: true, inset: 0.2 }));
fs.writeFileSync('public/icon-512.png', await png(512, { paper: true, inset: 0.2 }));
// An .ico is a directory followed by the pictures.
const sizes = [16, 32, 48];
const pics = [];
for (const s of sizes) pics.push(await png(s, { paper: false, inset: 0 }));
const dir = Buffer.alloc(6 + 16 * sizes.length);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(sizes.length, 4);
let at = dir.length;
sizes.forEach((s, i) => {
  const o = 6 + 16 * i;
  dir.writeUInt8(s, o);
  dir.writeUInt8(s, o + 1);
  dir.writeUInt16LE(1, o + 4);
  dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(pics[i].length, o + 8);
  dir.writeUInt32LE(at, o + 12);
  at += pics[i].length;
});
fs.writeFileSync('public/favicon.ico', Buffer.concat([dir, ...pics]));
await b.close();
