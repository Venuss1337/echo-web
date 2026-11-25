import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { release, site } from './site.config.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/'/g, '&rsquo;');
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const sha = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;

/** What search engines are told. Only what can be checked against the ECHO repository. */
function structured() {
  const id = (s: string) => (site.url ? `${site.url}/#${s}` : `#${s}`);
  const app = {
    '@type': 'SoftwareApplication',
    '@id': id('echo'),
    name: site.name,
    description: site.description,
    applicationCategory: 'MultimediaApplication',
    applicationSubCategory: 'Music player',
    operatingSystem: 'Windows 10, Windows 11',
    isAccessibleForFree: true,
    license: site.license,
    sameAs: site.repository,
    creativeWorkStatus: release.available ? 'Published' : 'In development, no public release yet',
    featureList: [
      'Local playback of FLAC, MP3, WAV, OGG, AAC and M4A files',
      'Indexed music library with albums, artists, folders and search',
      'Playlists, favourites and listening history',
      'Atmosphere 2.0 interface and Now Playing, coloured from each sleeve',
      'Compact player',
      'Internet radio from the Radio Browser directory or a stream address',
    ],
    ...(release.available ? { softwareVersion: release.version, downloadUrl: release.download } : {}),
  };
  const code = { '@type': 'SoftwareSourceCode', name: `${site.name} source code`, codeRepository: site.repository, programmingLanguage: ['Rust', 'TypeScript'], license: site.license, targetProduct: { '@id': id('echo') } };
  const web = { '@type': 'WebSite', '@id': id('site'), name: site.name, description: site.social, inLanguage: 'en-GB', about: { '@id': id('echo') }, ...(site.url ? { url: `${site.url}/` } : {}) };
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [web, app, code] }).replace(/</g, '\\u003c');
}

function head() {
  const image = site.url ? `${site.url}/${site.socialImage.path}` : '';
  return [
    `<title>${esc(site.title)}</title>`,
    `<meta name="description" content="${attr(site.description)}" />`,
    `<meta name="theme-color" content="${site.themeColor}" />`,
    '<meta name="color-scheme" content="light" />',
    '<meta name="referrer" content="strict-origin-when-cross-origin" />',
    site.url && `<link rel="canonical" href="${site.url}/" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${site.name}" />`,
    '<meta property="og:locale" content="en_GB" />',
    `<meta property="og:title" content="${attr(site.title)}" />`,
    `<meta property="og:description" content="${attr(site.social)}" />`,
    site.url && `<meta property="og:url" content="${site.url}/" />`,
    image && `<meta property="og:image" content="${image}" />`,
    image && '<meta property="og:image:type" content="image/jpeg" />',
    image && `<meta property="og:image:width" content="${site.socialImage.width}" />`,
    image && `<meta property="og:image:height" content="${site.socialImage.height}" />`,
    image && `<meta property="og:image:alt" content="${attr(site.socialImage.alt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<script type="application/ld+json">${structured()}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** Fills the slots in index.html, and settles what the first paint waits for. */
export function sitePlugin(): Plugin {
  let building = false;
  return {
    name: 'echo-site',
    configResolved(c) { building = c.command === 'build'; },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const spans = (lines: string[]) => lines.map((l) => `<span>${esc(l)}</span>`).join('\n            ');
        const slots: Record<string, string> = {
          head: head(),
          'release:cover': spans(release.cover),
          'release:status': spans(release.status),
          'release:links': release.links.map((l) => `<span><a href="${attr(l.href)}">${esc(l.text)}</a></span>`).join('\n              '),
        };
        for (const [k, v] of Object.entries(slots)) {
          if (!html.includes(`<!-- ${k} -->`)) throw new Error(`index.html has no slot for ${k}`);
          html = html.replace(`<!-- ${k} -->`, () => v);
        }
        const bundle = ctx.bundle;
        if (!building || !bundle) return html.replace('@@film@@', '');

        // The stylesheet is small and everything waits for it, so it travels with the page.
        const css = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.css'));
        if (css && css.type === 'asset') {
          const text = String(css.source).replace(/url\(\.\//g, 'url(./assets/').trim();
          html = html.replace(/[ \t]*<link rel="stylesheet"[^>]*>\n?/, '').replace('</head>', () => `  <style>${text}</style>\n  </head>`);
          delete bundle[css.fileName];
        }
        // The two faces on the first screen, and the film itself for those who will see it.
        const fonts = Object.keys(bundle).filter((f) => /-latin-wght-normal.*\.woff2$/.test(f));
        html = html.replace('</head>', () => `${fonts.map((f) => `  <link rel="preload" as="font" type="font/woff2" crossorigin href="./${f}" />\n  `).join('')}</head>`);
        const film = Object.values(bundle).find((f) => f.type === 'chunk' && f.isDynamicEntry);
        if (!film) throw new Error('the film has no chunk of its own');
        html = html.replace('@@film@@', `./${film.fileName}`);

        // Nothing but this site's own files may run or load here.
        const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => sha(m[1]));
        const style = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => sha(m[1]));
        const policy = [
          "default-src 'none'", `script-src 'self' ${inline.join(' ')}`, `style-src 'self' ${style.join(' ')}`, "img-src 'self' data:", "font-src 'self'",
          "connect-src 'self'", "manifest-src 'self'", "base-uri 'none'", "form-action 'none'",
        ].join('; ');
        return html.replace('<meta charset="utf-8" />', () => `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n${site.url ? `\nSitemap: ${site.url}/sitemap.xml\n` : ''}` });
      if (site.url) {
        const url = `${site.url}/`;
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}</loc></url>\n</urlset>\n` });
      } else this.warn('SITE_URL is not set: no canonical link, sitemap or social image will be written.');
      // Served from any depth, so it can lean on nothing but the site's root.
      const home = site.url ? `${new URL(site.url).pathname.replace(/\/$/, '')}/` : '/';
      const face = (n: string) => Object.keys(bundle).find((f) => f.includes(`stack-sans-${n}-latin-wght`)) ?? '';
      const tokens: Record<string, string> = { home, notch: face('notch'), text: face('text') };
      this.emitFile({ type: 'asset', fileName: '404.html', source: readFileSync('404.html', 'utf8').replace(/@@(\w+)@@/g, (_m, k: string) => tokens[k]) });
    },
  };
}
