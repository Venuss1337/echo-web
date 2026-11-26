import { expect, test } from '@playwright/test';

test.describe('without running anything, the page', () => {
  test.use({ javaScriptEnabled: false });

  test('says what ECHO is, what it does and where it is', async ({ page }) => {
    await page.goto('./');
    const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    for (const s of ['For Windows', 'open source', 'FLAC, MP3, WAV, OGG, AAC and M4A', 'Atmosphere 2.0', 'playlists, favourites and history', 'Radio Browser', 'compact edition', 'GPL-3.0-or-later', 'Nothing is uploaded', 'ECHO 1.0.0 is out'])
      expect(text).toContain(s);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('ECHO');
    const levels = await page.locator('h1, h2, h3').evaluateAll((e) => e.map((x) => Number(x.tagName[1])));
    levels.slice(1).forEach((l, i) => expect(l - levels[i]).toBeLessThanOrEqual(1));
    await expect(page.locator('img:not([alt])')).toHaveCount(0);
  });

  test('can be followed', async ({ page, request }) => {
    await page.goto('./');
    const links = await page.locator('a').evaluateAll((e) => e.map((a) => a.getAttribute('href')!));
    for (const l of links.filter((h) => h.startsWith('#'))) await expect(page.locator(l)).toHaveCount(1);
    expect(links).toContain('https://github.com/Venuss1337/echo');
    // The one installer is the one published with the release.
    expect(links.filter((h) => /\.(exe|msi|msix|zip)$/i.test(h))).toEqual(['https://github.com/Venuss1337/echo/releases/download/v1.0.0/ECHO-1.0.0-windows-x64-setup.exe']);
    for (const src of await page.locator('link[href]:not([rel=canonical]), img[src], script[src]').evaluateAll((e) => e.map((x) => x.getAttribute('href') ?? x.getAttribute('src')!)))
      expect((await request.get(new URL(src, page.url()).href)).status(), src).toBe(200);
  });
});

test('introduces itself accurately', async ({ page, request }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/ECHO.*Windows/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  const meta = (n: string) => page.locator(`meta[name="${n}"], meta[property="${n}"]`);
  expect((await meta('description').getAttribute('content'))!.length).toBeLessThan(180);
  await expect(meta('og:title')).toHaveCount(1);
  await expect(meta('robots')).toHaveCount(0);
  const graph = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)['@graph'] as Record<string, unknown>[];
  const app = graph.find((g) => g['@type'] === 'SoftwareApplication')!;
  expect(app.operatingSystem).toMatch(/Windows/);
  // Nothing is claimed that has not happened.
  for (const k of ['aggregateRating', 'review', 'offers']) expect(app[k]).toBeUndefined();
  expect(app.softwareVersion).toBe('1.0.0');
  expect(app.downloadUrl).toBe('https://github.com/Venuss1337/echo/releases/download/v1.0.0/ECHO-1.0.0-windows-x64-setup.exe');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://echo.wiktorfila.dev/');
  const robots = await (await request.get('./robots.txt')).text();
  expect(robots).toContain('Allow: /');
  expect(robots).not.toContain('Disallow');
});

test('asks nobody else for anything, and runs nothing it did not bring', async ({ page, baseURL }) => {
  const elsewhere: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(baseURL!) && !r.url().startsWith('data:')) elsewhere.push(r.url()); });
  await page.goto('./');
  await page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 60_000 });
  expect(elsewhere).toEqual([]);
  expect(await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.smuggled = true';
    document.head.append(s);
    return (window as any).smuggled === true;
  })).toBe(false);
});

test('an address that does not exist', async ({ page }) => {
  await page.goto('./404.html');
  await expect(page.getByRole('heading', { name: 'This sheet is blank' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await page.getByRole('link', { name: 'Back to the cover' }).click();
  await expect(page).toHaveTitle(/ECHO, a local-first/);
});
