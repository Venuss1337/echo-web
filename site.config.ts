/**
 * Everything about the site that changes without touching its design:
 * where it lives, how it introduces itself, and what can truthfully be downloaded.
 */

export const site = {
  /**
   * The public address, without a trailing slash. It writes the canonical link, og:url, og:image,
   * the sitemap and the addresses in the structured data. SITE_URL at build time overrides it,
   * for example to build the site for another host.
   */
  url: (process.env.SITE_URL?.trim() || 'https://echo.wiktorfila.dev').replace(/\/+$/, ''),
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
 * For a new release: change `version` (check the installer's name on the release),
 * and the version in `status`. Nothing else needs to change.
 */
const version = '1.0.0';
/** The installer, exactly as published on the release. */
const download = `https://github.com/Venuss1337/echo/releases/download/v${version}/ECHO-${version}-windows-x64-setup.exe`;

export const release = {
  available: true,
  version,
  download,
  /** On the cover, bottom right. */
  cover: ['For Windows. Free, open source,', 'and out now.'],
  /** At the end, beside the pattern. */
  status: [
    'ECHO 1.0.0 is out, for Windows 10 and 11,',
    '64-bit. It installs for you alone, without',
    'administrator rights. Its notes, checksums',
    'and sources are with the release on GitHub.',
  ],
  links: [
    { text: 'Download for Windows', href: download },
    { text: 'Read the source on GitHub', href: site.repository },
  ],
};
