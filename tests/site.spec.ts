import { chromium, expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    ready?: boolean;
    __echo: {
      world: { frames: number; scale: number; pulses: unknown[]; state: Record<string, number>; canvas: HTMLCanvasElement };
      state: Record<string, number>;
      lenis: { scroll: number; isScrolling: unknown };
      cues: Record<string, number>;
      seek(t: number): void;
      time: number;
    };
  }
}

const problems = new WeakMap<Page, string[]>();

async function open(page: Page, path = './', wait = true) {
  const found: string[] = [];
  problems.set(page, found);
  page.on('console', (m) => { if (m.type() === 'error') found.push(m.text()); });
  page.on('pageerror', (e) => found.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400) found.push(`${r.status()} ${r.url()}`); });
  await page.goto(path);
  if (wait) {
    await page.waitForFunction(() => window.ready === true, null, { timeout: 60_000 });
    await page.waitForTimeout(3200);
  }
}
const clean = (page: Page) => expect(problems.get(page)).toEqual([]);
const time = (page: Page) => page.evaluate(() => window.__echo.time);
const seek = async (page: Page, t: number) => {
  await page.evaluate((x) => window.__echo.seek(x), t);
  await page.waitForTimeout(350);
};

/** A coarse picture of the canvas: 32 by 20 averaged cells. */
async function look(page: Page) {
  const png = await page.locator('#paper').screenshot();
  return page.evaluate(async (b64) => {
    const i = new Image();
    i.src = `data:image/png;base64,${b64}`;
    await i.decode();
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 20;
    const g = c.getContext('2d')!;
    g.drawImage(i, 0, 0, 32, 20);
    return [...g.getImageData(0, 0, 32, 20).data].filter((_, k) => k % 4 !== 3);
  }, png.toString('base64'));
}
const distance = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

test('opens without errors, and the paper is drawn', async ({ page }) => {
  await open(page);
  const px = await look(page);
  expect(Math.max(...px) - Math.min(...px)).toBeGreaterThan(120);
  await expect(page.locator('html')).toHaveClass(/live/);
  await expect(page.getByText('for the records you keep')).toBeVisible();
  clean(page);
});

test('Lenis carries the wheel, and every chapter changes the scene', async ({ page }) => {
  await open(page);
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(60);
  const early = await page.evaluate(() => scrollY);
  await page.waitForTimeout(1600);
  const late = await page.evaluate(() => scrollY);
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(late * 0.9);
  const seen: number[][] = [];
  for (const t of [0, 2.4, 3.6, 5.4, 7.4, 8.9, 10.4, 11.4, 12.3, 13.4, 15.3, 17.0, 18.15, 19.4, 22.2, 24.4, 26.1]) {
    await seek(page, t);
    seen.push(await look(page));
  }
  for (let i = 1; i < seen.length; i++) expect(distance(seen[i], seen[i - 1])).toBeGreaterThan(9);
  clean(page);
});

test('scrolling back arrives at the same frame', async ({ page }) => {
  await open(page);
  await seek(page, 9.0);
  await page.waitForTimeout(1200); // type arrives on its own clock
  const first = await look(page);
  await seek(page, 26.1);
  await seek(page, 0);
  await seek(page, 9.0);
  await page.waitForTimeout(1200);
  expect(distance(first, await look(page))).toBeLessThan(1.5);
});

test('a fast fling ends where it should and nothing is left behind', async ({ page }) => {
  await open(page);
  await page.mouse.move(700, 450);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 900);
  await page.waitForTimeout(3500);
  expect(await time(page)).toBeGreaterThan(26.0);
  await expect(page.getByRole('link', { name: 'Read the source on GitHub' })).toBeVisible();
  await expect(page.getByText('for the records you keep')).toBeHidden();
  for (let i = 0; i < 44; i++) await page.mouse.wheel(0, -900);
  await page.waitForTimeout(3500);
  expect(await time(page)).toBeLessThan(0.05);
  await expect(page.getByText('for the records you keep')).toBeVisible();
  clean(page);
});

test('chapters, history and keyboard', async ({ page }) => {
  await open(page);
  await page.getByRole('link', { name: 'Library' }).click();
  await page.waitForTimeout(4200);
  const cues = await page.evaluate(() => window.__echo.cues);
  const t = await time(page);
  expect(t).toBeGreaterThan(cues.library);
  expect(t).toBeLessThan(cues.radio);
  expect(new URL(page.url()).hash).toBe('#library');
  await expect(page.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'true');
  await page.goBack();
  await page.waitForTimeout(4200);
  expect(await time(page)).toBeLessThan(0.1);
  await page.keyboard.press('End');
  await page.waitForTimeout(1500);
  expect(await time(page)).toBeGreaterThan(25.9);
  await page.keyboard.press('Home');
  await page.waitForTimeout(1500);
  expect(await time(page)).toBeLessThan(0.1);
  clean(page);
});

test('a link into the middle opens there', async ({ page }) => {
  await open(page, './#radio');
  const cues = await page.evaluate(() => window.__echo.cues);
  expect(await time(page)).toBeGreaterThan(cues.radio);
  expect(await time(page)).toBeLessThan(cues.compact);
  clean(page);
});

test('putting on a record changes the light', async ({ page }) => {
  await open(page);
  await seek(page, 10.6);
  const before = await look(page);
  await page.getByRole('button', { name: 'Stairwell' }).click();
  await page.waitForTimeout(2600);
  await expect(page.getByRole('button', { name: 'Stairwell' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => Math.round(window.__echo.state.rec))).toBe(2);
  expect(distance(before, await look(page))).toBeGreaterThan(15);
  clean(page);
});

test('the paper answers a press, and sound waits to be asked for', async ({ page }) => {
  await page.addInitScript(() => {
    const A = window.AudioContext;
    (window as any).contexts = 0;
    (window as any).AudioContext = class extends A { constructor() { super(); (window as any).contexts++; } };
  });
  await open(page);
  await page.waitForTimeout(4500);
  const rest = await look(page);
  await page.mouse.click(640, 380);
  await page.waitForTimeout(420);
  expect(await page.evaluate(() => window.__echo.world.pulses.length)).toBe(4);
  expect(distance(rest, await look(page))).toBeGreaterThan(0.6);
  expect(await page.evaluate(() => (window as any).contexts)).toBe(0);
  await page.getByRole('button', { name: 'Sound off' }).click();
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).contexts)).toBe(1);
  await page.waitForTimeout(6500);
  expect(await page.evaluate(() => window.__echo.world.pulses.length)).toBe(0);
  clean(page);
});

test('a drag cuts the cover, and the cut is mended on the way in', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(4500);
  const whole = await look(page);
  await page.mouse.move(120, 730);
  await page.mouse.down();
  await page.mouse.move(700, 760, { steps: 20 });
  await page.mouse.move(1180, 715, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window.__echo.world as any).strokes)).toBeGreaterThan(10);
  expect(distance(whole, await look(page))).toBeGreaterThan(0.4);
  expect(await time(page)).toBe(0);
  // Come back to where you began and the piece falls out.
  const before = await page.evaluate(() => (window.__echo.world as any).strokes);
  const slit = await look(page);
  await page.mouse.move(1180, 690);
  await page.mouse.down();
  for (const [x, y] of [[1290, 700], [1300, 790], [1190, 800], [1178, 694]]) await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window.__echo.world as any).strokes)).toBeGreaterThan(before);
  expect(distance(slit, await look(page))).toBeGreaterThan(0.3);
  await seek(page, 2.4);
  expect(await page.evaluate(() => (window.__echo.world as any).strokes)).toBe(0);
  clean(page);
});

test('in the app, a press is the play button', async ({ page }) => {
  await open(page);
  await seek(page, 11.8);
  await page.waitForTimeout(700);
  await page.mouse.click(900, 420);
  expect(await page.evaluate(() => (window.__echo as any).call.playing)).toBe(true);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (window.__echo.world as any).beat)).toBeGreaterThan(0);
  await page.mouse.click(900, 420);
  expect(await page.evaluate(() => (window.__echo as any).call.playing)).toBe(false);
  clean(page);
});

test('the page rests when nothing is happening, except on air', async ({ page }) => {
  await open(page);
  const drawn = async (ms: number) => {
    const a = await page.evaluate(() => window.__echo.world.frames);
    await page.waitForTimeout(ms);
    return (await page.evaluate(() => window.__echo.world.frames)) - a;
  };
  await seek(page, 5.4);
  await page.waitForTimeout(6000);
  expect(await drawn(1000)).toBe(0);
  await seek(page, 19.4);
  await page.waitForTimeout(1200);
  expect(await drawn(1000)).toBeGreaterThan(20);
  const a = await look(page);
  await page.waitForTimeout(900);
  expect(distance(a, await look(page))).toBeGreaterThan(0.8);
});

test('resizing, through a change of orientation', async ({ page }) => {
  await open(page);
  await seek(page, 7.4);
  for (const [w, h] of [[1920, 1080], [1280, 720], [820, 1180], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const c = window.__echo.world.canvas;
      return { ratio: c.width / c.height, over: document.documentElement.scrollWidth - innerWidth };
    });
    expect(Math.abs(r.ratio - w / h)).toBeLessThan(0.02);
    expect(r.over).toBeLessThanOrEqual(0);
    const px = await look(page);
    expect(Math.max(...px) - Math.min(...px)).toBeGreaterThan(60);
  }
  clean(page);
});

test('held upright, by touch', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  const cdp = await ctx.newCDPSession(page);
  // A finger, not a wheel: touch events, which the browser scrolls natively.
  const swipe = async (from: number, to: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: from }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: from + ((to - from) * i) / 12 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  for (let i = 0; i < 3; i++) await swipe(700, 200);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(1200);
  const carried = await time(page);
  expect(carried).toBeGreaterThan(1.3);
  await swipe(200, 700);
  await page.waitForTimeout(900);
  expect(await time(page)).toBeLessThan(carried);
  await seek(page, 26.1);
  const link = page.getByRole('link', { name: 'Read the source on GitHub' });
  await expect(link).toBeVisible();
  const box = (await link.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  clean(page);
  await ctx.close();
});

test('type stays inside the window at every stop', async ({ page }) => {
  await open(page);
  for (const [w, h] of [[1440, 900], [1280, 720], [1920, 1080], [390, 844], [768, 1024], [844, 390], [667, 375]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(700);
    for (const t of [0, 2.8, 4.0, 5.5, 8.9, 10.5, 11.4, 12.4, 13.4, 15.3, 19.3, 22.1, 26.1]) {
      await seek(page, t);
      const out = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.pin.on .cut > span, .pin.on button, .pin.on a')]
          .filter((e) => e.getClientRects().length)
          .map((e) => ({ r: e.getBoundingClientRect(), s: e.textContent }))
          .filter(({ r }) => r.left < -2 || r.right > innerWidth + 2 || r.top < -2 || r.bottom > innerHeight + 2)
          .map(({ s }) => s),
      );
      expect(out, `${w}x${h} at ${t}`).toEqual([]);
    }
  }
});

test('with motion turned down, the same story as prints', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await open(page, './', false);
  await expect(page.locator('html')).toHaveClass(/still/);
  await expect(page.locator('#paper')).toBeHidden();
  for (const id of ['cover', 'folder', 'sleeve', 'player', 'light', 'library', 'radio', 'compact', 'source']) {
    const s = page.locator(`#${id}`);
    await s.scrollIntoViewIfNeeded();
    const img = s.locator('.still-print img');
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(400);
  }
  await expect(page.getByRole('link', { name: 'Read the source on GitHub' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  clean(page);
  await ctx.close();
});

test('without WebGL, the same prints', async () => {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const page = await browser.newPage({ baseURL: 'http://localhost:4319/' });
  await open(page, 'http://localhost:4319/', false);
  await expect(page.locator('html')).toHaveClass(/still/);
  await expect(page.getByRole('heading', { name: 'Instruments float. Music doesn’t.' })).toBeVisible();
  clean(page);
  await browser.close();
});
