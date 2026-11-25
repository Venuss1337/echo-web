/**
 * Everything about the site that changes without touching its design:
 * where it lives, how it introduces itself, and what can truthfully be downloaded.
 */

export const site = {
  /**
   * The public address, from the SITE_URL environment variable at build time, for example
   * https://example.com or https://venuss1337.github.io/echo-web.
   * Until it is set, nothing that needs an absolute address is written: no canonical link,
   * no sitemap, no og:url and no og:image.
   */
  url: (process.env.SITE_URL ?? '').trim().replace(/\/+$/, ''),
  name: 'ECHO',
  title: 'ECHO, a local-first music player for Windows',
  description:
    'An open-source desktop music player for Windows, built around the music files you own. Offline library, a Now Playing lit by every sleeve, and internet radio. No account.',
  social: 'A music player for the records you keep. Local-first, open source, for Windows.',
  socialImage: { path: 'social.jpg', width: 1200, height: 630, alt: 'The word ECHO cut as windows through thick white paper, lit by a low sun, with the playback dock floating in front of it. A music player for the records you keep.' },
  themeColor: '#eff0f2',
  repository: 'https://github.com/Venuss1337/echo',
  license: 'https://www.gnu.org/licenses/gpl-3.0.html',
};

/**
 * What the page says about getting ECHO. Each string is one line of type on the page,
 * broken by hand, so keep them about as long as they are.
 *
 * When a public release exists: set `available`, give `version` and `download`, rewrite the
 * lines, and put the download first in `links`. Nothing else needs to change.
 */
export const release = {
  available: false,
  version: '',
  download: '',
  /** On the cover, bottom right. */
  cover: ['For Windows. Free, open source,', 'and still being made.'],
  /** At the end, beside the pattern. */
  status: [
    'There is no public installer. Local playback,',
    'the library and radio run in private builds.',
    'A public one waits on hardware testing and',
    'clearing the decoder for redistribution.',
  ],
  links: [
    { text: 'Read the source on GitHub', href: 'https://github.com/Venuss1337/echo' },
    { text: 'See what is left to do', href: 'https://github.com/Venuss1337/echo/blob/main/docs/ROADMAP.md' },
  ],
};
