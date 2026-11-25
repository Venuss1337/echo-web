# Third-party material

None of the following is covered by this repository's [LICENSE](LICENSE). Each keeps its own.

## In the published site

| | Copyright | License | Where |
|---|---|---|---|
| [Three.js](https://github.com/mrdoob/three.js) | three.js authors | MIT | Bundled from npm |
| [Lenis](https://github.com/darkroomengineering/lenis) | darkroom.engineering | MIT | Bundled from npm |
| [GSAP and ScrollTrigger](https://gsap.com) | GreenSock, Webflow | [Standard "no charge" license](https://gsap.com/standard-license) | Bundled from npm, notices intact |
| [Stack Sans Notch, Stack Sans Text](https://github.com/DylanYoungKoto/Stack-Sans) | The Stack Sans Project Authors | SIL Open Font License 1.1 | Bundled from npm (Fontsource). Texts in [public/licenses](public/licenses) |

`bun run build` writes the full license texts of bundled packages to `dist/licenses/third-party.md`, next to the font licenses, and keeps license comments in the scripts.

## Captures of ECHO

The pictures in `public/app/` are captures of the front end of [ECHO](https://github.com/Venuss1337/echo), which is licensed under GPL-3.0-or-later by its authors. They were taken from the running application with an invented music library and with sleeves made for this site. The same captures appear inside `public/stills/`, `public/social.jpg` and `docs/showcase/`.

Visible in them, as pixels only:

| | License |
|---|---|
| ECHO's interface and mark | GPL-3.0-or-later, ECHO's authors |
| [Lucide](https://lucide.dev) icons | ISC |
| [Instrument Serif](https://github.com/Instrument/instrument-serif) and [DM Sans](https://github.com/googlefonts/dm-fonts) | SIL Open Font License 1.1 |

`public/mark.svg` and the raster icons made from it follow ECHO's mark.

## Used to build and test, not published

[Vite](https://github.com/vitejs/vite) (MIT), [TypeScript](https://github.com/microsoft/TypeScript) (Apache-2.0), [Playwright](https://github.com/microsoft/playwright) (Apache-2.0), [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) (MIT).

No recordings are used. All sound on the site is synthesised in the browser, and only after the visitor asks for it.
