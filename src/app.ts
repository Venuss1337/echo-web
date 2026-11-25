import * as THREE from 'three';
import type { World } from './world/world';
import type { Film } from './film';

/**
 * Geometry of the real captures. Every rectangle was measured in the running
 * application when the capture was taken, in CSS pixels.
 */
type Rect = [number, number, number, number];
interface Screen { window: [number, number]; art: Rect; dock: Rect; plaque?: Rect }

const wide: Record<'now' | 'radio', Screen> = {
  now: { window: [1440, 900], art: [136.8, 160, 522, 522], dock: [270, 795, 900, 85], plaque: [700, 140, 700, 560] },
  radio: { window: [1440, 900], art: [136.8, 160, 522, 522], dock: [270, 795, 900, 85] },
};
const narrow: Record<'now' | 'radio', Screen> = {
  now: { window: [420, 800], art: [33.6, 129, 260.4, 260.4], dock: [14, 656, 392, 128], plaque: [0, 340, 420, 300] },
  radio: { window: [420, 800], art: [33.6, 129.9, 260.4, 260.4], dock: [14, 656, 392, 128] },
};
const shelf = {
  wide: { window: [1440, 900], art: 206.4, first: [280.02, 183.31], pitch: [226.39, 305], cols: 5, rows: 2, dock: [242, 769, 1188, 131] as Rect },
  narrow: { window: [420, 800], art: 172, first: [28, 152.55], pitch: [192, 270], cols: 2, rows: 2, dock: [14, 656, 392, 128] as Rect },
};
/** The compact edition is a 420 by 640 window of its own. */
const CARD: [number, number] = [210, 320];
const LAST = 4;

/** ink, glow and accent, as ECHO's own extractor derives them from these sleeves. */
export const palettes = [
  ['#452125', '#85333c', '#e3abb1'],
  ['#1c424a', '#226f7f', '#a2dfec'],
  ['#242642', '#383f7f', '#afb3df'],
  ['#4a371c', '#875e24', '#eece9f'],
  ['#224432', '#2e734e', '#ace2c5'],
];

export class App {
  private loader = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'premultiply' });
  private cache = new Map<string, THREE.Texture | null>();
  onload: () => void = () => {};
  /** The transport, as the visitor left it. */
  playing = false;
  constructor(private world: World, private small: boolean) {}

  /** Loads on first use, decoded off the main thread. A sheet with no picture yet is simply not there. */
  tex(name: string): THREE.Texture | null {
    const key = this.small && !name.startsWith('compact') ? `narrow-${name}` : name;
    if (!this.cache.has(key)) {
      this.cache.set(key, null);
      this.loader.load(`./app/${key}.webp`, (bitmap) => {
        const t = new THREE.Texture(bitmap as unknown as HTMLImageElement);
        t.flipY = false;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        this.world.renderer.initTexture(t);
        this.cache.set(key, t);
        this.onload();
      });
    }
    return this.cache.get(key) ?? null;
  }

  /** Centre and half size of a rectangle, in units where the sleeve is [-1, 1] about the origin. */
  private place(s: Screen, r: Rect) {
    const u = s.art[2] / 2;
    const ox = s.art[0] + u;
    const oy = s.art[1] + u;
    return { x: (r[0] + r[2] / 2 - ox) / u, y: -(r[1] + r[3] / 2 - oy) / u, w: r[2] / 2 / u, h: r[3] / 2 / u };
  }

  now(f: Film, mix: number) {
    const s = (this.small ? narrow : wide).now;
    const p = this.world.panels;
    const a = Math.min(LAST, Math.floor(f.rec));
    const b = Math.min(LAST, a + 1);
    const u = s.art[2] / 2;
    const dock = (n: number) => (this.playing && this.tex(`now-${n}-dock-on`)) || this.tex(`now-${n}-dock`);
    const pick = (part: string, n: number) => ({ tex: this.tex(`now-${n}-${part}`), next: null });
    Object.assign(p[0], this.place(s, [0, 0, ...s.window]), { z: f.bz, r: 0, o: f.base, ...pick('base', Math.min(a, 0)) });
    Object.assign(p[1], this.place(s, s.plaque!), { z: f.pz, r: 0, o: f.plaque, ...pick('plaque', 0) });
    const d = { ...this.place(s, s.dock), z: f.dz, r: 24 / u };
    d.x -= (this.small ? 0.1 : 0.55) * f.adrift;
    d.y += (this.small ? 0.25 : 0.12) * f.adrift;
    if (f.follow > 0) {
      // The dock has left its window. It keeps its place on the screen instead.
      const z = f.z + 1.5;
      const k = this.world.span(z);
      const at = this.world.project(0, this.small ? -0.64 : -0.81, z);
      const w = Math.min(k.x * (this.small ? 0.9 : 0.42), (this.small ? 0.5 : 0.9) * k.y);
      const to = { x: at.x, y: at.y - f.duck * k.y * 0.6, z, w, h: (w * s.dock[3]) / s.dock[2], r: (24 * 2 * w) / s.dock[2] };
      for (const key of ['x', 'y', 'z', 'w', 'h', 'r'] as const) d[key] += (to[key] - d[key]) * f.follow;
    }
    Object.assign(p[2], d, { o: f.dock, tex: dock(a), next: mix > 0 ? dock(b) : null });
    p[3].o = 0;
    this.still();
    // Two lines of type, doing what they say.
    Object.assign(this.world.saying, { floats: f.floats, cut: f.cut, lift: f.lift });
    if (this.small) {
      this.world.placeSaying(0, 0.2, 2.72, 1.55);
      this.world.placeSaying(1, 0.1, -5.75, 1.45);
    } else {
      this.world.placeSaying(0, -2.77, 0.84, 1.2);
      this.world.placeSaying(1, -3.26, -0.60, 1.3);
    }
  }

  radio(f: Film) {
    const s = (this.small ? narrow : wide).radio;
    const p = this.world.panels;
    const u = s.art[2] / 2;
    const base = this.place(s, [0, 0, ...s.window]);
    Object.assign(p[0], base, { z: f.bz, r: 0, o: f.base, tex: this.tex('radio-base'), next: null });
    Object.assign(p[2], this.place(s, s.dock), { z: f.dz, r: 24 / u, o: f.dock, tex: this.tex('radio-dock'), next: null });
    p[1].o = 0;
    Object.assign(p[3], { x: f.cx, y: f.cy, w: CARD[0] / u, h: CARD[1] / u, z: f.cz, r: 0, o: f.co, tex: this.tex('compact-radio'), next: null });
    this.still();
    Object.assign(this.world.slit, { x: base.x + 0.1, y: base.y, line: f.line, apart: f.apart });
  }

  /** The albums page, in units where one sleeve is [-1, 1] and the first is at the grid's origin. */
  get shelf() { return this.small ? shelf.narrow : shelf.wide; }
  albums(f: Film) {
    const s = this.shelf;
    const u = s.art / 2;
    const g = this.world.grid;
    const p = this.world.panels;
    const at = (r: Rect) => ({ x: g.x + (r[0] + r[2] / 2 - s.first[0] - u) / u + f.shx, y: g.y - (r[1] + r[3] / 2 - s.first[1] - u) / u, w: r[2] / 2 / u, h: r[3] / 2 / u });
    Object.assign(p[0], at([0, 0, s.window[0], s.window[1]]), { z: f.bz, r: 0, o: f.base, tex: this.tex('albums-base'), next: null });
    Object.assign(p[2], at(s.dock), { z: f.dz, r: 0, o: f.dock, tex: this.tex('albums-dock'), next: null });
    p[1].o = 0;
    p[3].o = 0;
    this.still();
    this.world.sheet.x = f.shx;
  }

  compact(f: Film) {
    const p = this.world.panels;
    const u = (this.small ? narrow : wide).radio.art[2] / 2;
    p[0].o = p[1].o = p[2].o = 0;
    Object.assign(p[3], { x: f.cx, y: f.cy, w: CARD[0] / u, h: CARD[1] / u, z: f.cz, r: 0, o: f.co, tex: this.tex('compact-radio'), next: null });
    this.still();
  }

  private still() {
    Object.assign(this.world.sheet, { x: 0, y: 0 });
    Object.assign(this.world.slit, { line: 0, apart: 0 });
    Object.assign(this.world.saying, { floats: 0, cut: 0 });
  }

  none() { this.world.panels.forEach((p) => { p.o = 0; }); this.still(); }

  preload(names: string[]) { names.forEach((n) => this.tex(n)); }
}
