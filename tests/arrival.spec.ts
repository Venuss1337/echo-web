import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

const html = (page: Page) => page.locator('html');
const ready = (page: Page, timeout = 60_000) => page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout });
const watch = (page: Page) => {
  const found: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') found.push(m.text()); });
  page.on('pageerror', (e) => found.push(e.message));
  return found;
};
/** Scrolling, links and focus all work. */
async function usable(page: Page, tab = true) {
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  if (!tab) return;
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toMatch(/^(A|BUTTON)$/);
}
async function prints(page: Page) {
  await expect(html(page)).toHaveClass('still', { timeout: 30_000 });
  await expect(page.locator('#paper')).toBeHidden();
  await expect(page.locator('#wait')).toBeHidden();
  await expect(page.getByText('A music player')).toBeVisible();
  await usable(page);
}

test('the sheet is on screen before the film has been fetched', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  await page.route('**/stage-*.js', async (r) => { await held; await r.continue(); });
  await page.goto('./', { waitUntil: 'commit' });
  await expect(page.locator('#wait')).toBeVisible();
  await expect.poll(() => page.locator('.h1').evaluate((e) => Number(getComputedStyle(e).opacity))).toBeGreaterThan(0.9);
  // Only what has really happened is shown: no film yet, so no echo.
  expect(await page.evaluate(() => document.documentElement.dataset.load)).toBeUndefined();
  expect(await page.locator('.h2').evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(0);
  // The first screen can already be read, and nothing is stretched across it.
  await expect(page.getByText('for the records you keep')).toBeVisible();
  await page.getByRole('link', { name: 'Library' }).focus();
  release();
  await ready(page);
  await expect(page.locator('#wait')).toHaveCount(0);
  expect(await page.evaluate(() => performance.getEntriesByType('mark').filter((m) => m.name.startsWith('echo:')).map((m) => m.name))).toEqual(['echo:1', 'echo:2', 'echo:3']);
});

test('readiness is real: nothing is revealed before a frame of it has been drawn', async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver((_, o) => {
      if (!document.documentElement.classList.contains('ready')) return;
      o.disconnect();
      const gl = document.querySelector<HTMLCanvasElement>('#paper')!.getContext('webgl2')!;
      (window as any).atReady = { width: gl.drawingBufferWidth, drawn: performance.getEntriesByName('echo:3').length, opacity: getComputedStyle(document.querySelector('#paper')!).opacity };
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.goto('./');
  await ready(page);
  const at = await page.evaluate(() => (window as any).atReady);
  expect(at.drawn).toBe(1);
  expect(Number(at.opacity)).toBeLessThan(0.1);
  expect(at.width).toBeGreaterThan(1000);
  expect(await page.evaluate(() => (window as any).__echo.world.frames)).toBeGreaterThan(0);
});

test('opens without shifting anything', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).shift = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e: any) => { if (!e.hadRecentInput) (window as any).shift += e.value; })).observe({ type: 'layout-shift', buffered: true });
  });
  const found = watch(page);
  await page.goto('./');
  await ready(page);
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => (window as any).shift)).toBeLessThan(0.01);
  expect(found).toEqual([]);
});

test('a second visit is not made to watch it again', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await page.waitForTimeout(900);
  await page.addInitScript(() => {
    (window as any).most = 0;
    const look = () => { const h = document.querySelector('.h1'); if (h) (window as any).most = Math.max((window as any).most, Number(getComputedStyle(h).opacity)); requestAnimationFrame(look); };
    requestAnimationFrame(look);
  });
  await page.reload();
  await expect(html(page)).toHaveClass(/again/);
  await ready(page);
  const took = await page.evaluate(() => performance.getEntriesByName('echo:3')[0].startTime);
  // Fast enough, and no shadow ever falls. Slower, and it falls late.
  if (took < 500) expect(await page.evaluate(() => (window as any).most)).toBeLessThan(0.06);
  // Moving between chapters does not bring it back.
  await page.getByRole('link', { name: 'Radio' }).click();
  await page.waitForTimeout(600);
  await expect(page.locator('#wait')).toHaveCount(0);
});

test('a refresh, and going away and back, keep the place', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__echo.seek(15.4));
  await page.waitForTimeout(500);
  const was = await page.evaluate(() => scrollY);
  await page.reload();
  await ready(page);
  await page.waitForTimeout(1600);
  expect(Math.abs((await page.evaluate(() => scrollY)) - was)).toBeLessThan(80);
  expect(await page.locator('#paper').evaluate((e) => getComputedStyle(e).clipPath)).toBe('none');
  await expect(page.getByText('Point it at')).toBeVisible();
  await page.goto('./robots.txt');
  await page.goBack();
  await ready(page);
  await page.waitForTimeout(1600);
  expect(Math.abs((await page.evaluate(() => scrollY)) - was)).toBeLessThan(80);
});

test('straight into a chapter, its own scene is what opens', async ({ page }) => {
  const found = watch(page);
  await page.goto('./#player');
  await ready(page);
  await expect(html(page)).toHaveClass(/through/);
  expect(await page.evaluate(() => Math.round((window as any).__echo.state.prog))).toBe(1);
  expect(await page.evaluate(() => (window as any).__echo.world.panels[0].tex !== null)).toBe(true);
  await page.waitForTimeout(1500);
  await expect(page.locator('#wait')).toHaveCount(0);
  await expect(page.getByText('Play, seek and volume')).toBeVisible();
  expect(found).toEqual([]);
});

test('where programs cannot be linked alongside drawing, all of them are linked before the opening', async ({ page }) => {
  const found = watch(page);
  await page.addInitScript(() => {
    const get = WebGL2RenderingContext.prototype.getExtension as (n: string) => unknown;
    (WebGL2RenderingContext.prototype as any).getExtension = function (n: string) { return n === 'KHR_parallel_shader_compile' ? null : get.call(this, n); };
    const link = WebGL2RenderingContext.prototype.linkProgram;
    (window as any).late = 0;
    WebGL2RenderingContext.prototype.linkProgram = function (p) {
      const fs = this.getAttachedShaders(p)!.map((s) => this.getShaderSource(s)!.length);
      // The small ones, for the knife, are nothing. The four scenes are not.
      if (document.documentElement.classList.contains('ready') && Math.max(...fs) > 10_000) (window as any).late++;
      link.call(this, p);
    };
  });
  await page.goto('./');
  await page.waitForFunction(() => document.documentElement.dataset.load === '2');
  expect(await page.evaluate(() => document.documentElement.classList.contains('ready'))).toBe(false);
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.dataset.cut)).toBe('4');
  await page.waitForFunction(() => window.ready === true);
  expect(await page.evaluate(() => (window as any).late)).toBe(0);
  expect(found).toEqual([]);
});

test('scrolling hard as soon as it opens', async ({ page }) => {
  const found = watch(page);
  await page.goto('./');
  await ready(page);
  await page.mouse.move(700, 450);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 900);
  await page.waitForTimeout(6000);
  expect(await page.evaluate(() => (window as any).__echo.time)).toBeGreaterThan(20);
  const gap = await page.evaluate(() => Math.abs((window as any).__echo.lenis.scroll - scrollY));
  expect(gap).toBeLessThan(2);
  expect(found).toEqual([]);
});

test('scrolling while it is still loading is honoured', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  await page.route('**/stage-*.js', async (r) => { await held; await r.continue(); });
  await page.goto('./', { waitUntil: 'commit' });
  await expect(page.locator('#wait')).toBeVisible();
  await page.getByRole('link', { name: 'Library' }).click();
  release();
  await ready(page);
  await page.waitForTimeout(1500);
  const { t, cues } = await page.evaluate(() => ({ t: (window as any).__echo.time, cues: (window as any).__echo.cues }));
  expect(t).toBeGreaterThan(cues.library);
  expect(t).toBeLessThan(cues.radio);
});

test.describe('when something does not arrive', () => {
  test('the film is missing', async ({ page }) => {
    await page.route('**/stage-*.js', (r) => r.fulfill({ status: 404, body: '' }));
    await page.goto('./');
    await prints(page);
  });

  test('the first script is missing', async ({ page }) => {
    await page.route('**/assets/index-*.js', (r) => r.abort());
    await page.goto('./');
    await prints(page);
  });

  test('the film never comes', async ({ page }) => {
    await page.route('**/stage-*.js', () => {});
    const from = Date.now();
    await page.goto('./', { waitUntil: 'commit' });
    await prints(page);
    expect(Date.now() - from).toBeLessThan(20_000);
  });

  test('the film has a fault in it', async ({ page }) => {
    await page.route('**/stage-*.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("broken"); export {}' }));
    await page.goto('./');
    await prints(page);
  });

  test('the type is missing', async ({ page }) => {
    await page.route('**/*.woff2', (r) => r.abort());
    await page.goto('./');
    await ready(page);
    await expect(page.getByText('for the records you keep')).toBeVisible();
    await usable(page);
  });

  test('the type never comes', async ({ page }) => {
    await page.route('**/*.woff2', () => {});
    await page.goto('./', { waitUntil: 'commit' });
    await ready(page, 25_000);
    await usable(page);
  });

  test('the captures are missing', async ({ page }) => {
    await page.route('**/app/*.webp', (r) => r.abort());
    await page.goto('./#player');
    await ready(page, 25_000);
    await expect(page.getByText('Play, seek and volume')).toBeVisible();
    await usable(page, false);
  });

  test('the graphics context is lost on the way in', async ({ page }) => {
    await page.addInitScript(() => {
      new MutationObserver((_, o) => {
        if (document.documentElement.dataset.load !== '2') return;
        o.disconnect();
        document.querySelector<HTMLCanvasElement>('#paper')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
      }).observe(document, { subtree: true, attributes: true });
    });
    await page.goto('./');
    await prints(page);
  });

  test('scripts are turned off', async ({ browser }) => {
    const ctx: BrowserContext = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('./');
    await expect(page.getByText('A music player')).toBeVisible();
    await expect(page.locator('#wait')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Read the source on GitHub' })).toBeAttached();
    await ctx.close();
  });

  test('there is no WebGL', async () => {
    const browser = await chromium.launch({ channel: 'chromium', args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
    const page = await browser.newPage({ baseURL: 'http://localhost:4319/' });
    const found = watch(page);
    await page.goto('./');
    await prints(page);
    expect(found).toEqual([]);
    await browser.close();
  });

  test('the connection is slow', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 });
    await page.goto('./', { waitUntil: 'commit' });
    await expect.poll(() => page.locator('.h1').evaluate((e) => Number(getComputedStyle(e).opacity)).catch(() => 0), { timeout: 8000 }).toBeGreaterThan(0.9);
    await ready(page, 30_000);
    await expect(html(page)).toHaveClass(/live/);
  });
});
