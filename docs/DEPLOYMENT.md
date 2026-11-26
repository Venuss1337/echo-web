# Deployment

The build is a folder of static files. There is one page, no server, no client-side routing and no request to any other origin.

| | |
|---|---|
| Install | `bun install --frozen-lockfile` |
| Build | `bun run build` |
| Output | `dist` |
| Bun | 1.4.4 (`packageManager` in package.json) |
| Environment | none required. `SITE_URL` overrides the address, see below |
| Base path | none needed. Every path is relative, so a domain's root and a subdirectory both work |
| Fallback | `404.html`. Do not rewrite unknown addresses to `index.html` |

## Address

The site's address is `https://echo.wiktorfila.dev`, set in [site.config.ts](../site.config.ts). It decides:

- the canonical link, `og:url` and `og:image` (which must be absolute)
- `sitemap.xml`, and the line in `robots.txt` that points to it
- the addresses in the structured data
- where `404.html` finds its type and its way home

Served from another host, such as a `pages.dev` address, the page still works and points search engines and link previews to the official address. To build for a different address, set `SITE_URL` without a trailing slash:

```sh
SITE_URL=https://example.com bun run build                           # POSIX shells
$env:SITE_URL = 'https://example.com'; bun run build                 # PowerShell
```

## Cloudflare Pages

1. Workers & Pages → Create → Pages → Connect to Git → `Venuss1337/echo-web`.
2. Production branch `main`. Framework preset: None.
3. Build command `bun install --frozen-lockfile && bun run build`. Output directory `dist`. Root directory empty.
4. Environment variables, for both environments: `BUN_VERSION` = `1.4.4`, and `SKIP_DEPENDENCY_INSTALL` = `1` so dependencies are installed once, by the build command, from `bun.lock`.
5. Deploy.
6. Custom domains → add `echo.wiktorfila.dev`. Redirect the `pages.dev` address to it, so there is one canonical address.

`_headers` in the output sets the security headers and a year's caching for hashed files. `404.html` is served for unknown addresses by itself. Preview deployments are kept out of search engines by Cloudflare.

## GitHub Pages

Settings → Pages → Source: GitHub Actions. Then add this as `.github/workflows/pages.yml`:

```yaml
name: Pages
on:
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency: pages
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: package.json
      - run: bun install --frozen-lockfile
      - run: bun run build
        env:
          SITE_URL: https://venuss1337.github.io/echo-web
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist
      - id: deploy
        uses: actions/deploy-pages@v5
```

It runs when started by hand. Add `push: { branches: [main] }` under `on:` to deploy every push.

What differs on GitHub Pages:

- The site lives under `/echo-web/`. Nothing needs changing, because paths are relative.
- `_headers` is ignored. The content security policy still applies, because it is also in the page. `X-Frame-Options`, long caching and the rest are not available.
- Crawlers read `robots.txt` only at the root of a host, so `venuss1337.github.io/echo-web/robots.txt` has no effect. Submit `sitemap.xml` to Search Console directly.
- With a custom domain, set it under Settings → Pages and change `SITE_URL` in the workflow.

## Caching

| Path | Policy |
|---|---|
| `/assets/*` | One year, immutable. Names contain a hash of the contents |
| `/app/*`, `/stills/*` | One day, then revalidated in the background |
| `/`, `404.html` | The host's default, revalidated each time |

## After the first deployment

1. Open the address with an empty cache, and again with a full one.
2. Check the link preview (the Open Graph image has to be reachable at the absolute address).
3. Add the property in Search Console and submit `sitemap.xml`. Being indexed is then up to the search engine.

## When ECHO has a new release

Change `version` and the status lines in `release` in [site.config.ts](../site.config.ts), after checking the installer's name on the release. Build and deploy. Nothing else mentions the release.
