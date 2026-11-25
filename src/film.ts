import { Tracks } from './tracks';
import { initial, type State, type World } from './world/world';
import { rest } from './world/light';
import type { App } from './app';

/** What the film needs beyond the paper itself. */
const extra = {
  set: 0, // which captures are standing: 0 none, 1 now playing, 2 albums, 3 radio, 4 compact
  rec: 0, // which record is on, 0 to 4, in between while it is being recut
  base: 0, plaque: 0, dock: 0, bz: -0.05, pz: -0.06, dz: -0.07,
  adrift: 0, // how far the instruments have wandered from where they sit
  follow: 0, // the dock leaves the window and travels with you
  duck: 0, // the dock drops out of sight
  shx: 0, // the first sheet slides
  line: 0, apart: 0, // a blade goes down the window, and the halves part
  floats: 0, cut: 0, lift: 0.9, // the two lines of type on the wall
  cx: 0, cy: 0, cz: -0.045, co: 0,
  ink: 0, // colour of the rail: 0 ink on paper, 1 paper on dark
};
export type Film = State & typeof extra;
export const blankFilm: Film = { ...initial, ...extra };

/** Chapter starts, in viewport heights of scroll. Filled from the document. */
export type Cues = Record<'cover' | 'folder' | 'sleeve' | 'player' | 'light' | 'library' | 'radio' | 'compact' | 'source' | 'end', number>;

const tan = (fov: number) => Math.tan((fov * Math.PI) / 360);

/** When each place in Light has been reached, as fractions of the chapter. Record 1 is first. */
export const BEATS = [0.03, 0.29, 0.54, 0.79];

export function shoot(world: World, app: App, c: Cues, aspect: number): Tracks<Film> {
  const tall = aspect < 0.9;
  const src = world.layout.source;
  const V = world.valleyZ;
  const vc = world.centre(V);
  const valley = { x: vc.x - 0.02, y: vc.y - 0.06 };
  const k = new Tracks<Film>({ ...blankFilm });

  /* ------------------------------------------------------------------ cover */
  const back = tall ? Math.max(6.3, 1.0 / (tan(40) * aspect) - 0.63) : Math.max(3.25, 2.45 / (tan(40) * aspect) - 0.63);
  const reach = back + 0.63;
  const stand = (far: number, middle: number): Partial<Film> => {
    const z = back * far;
    const r = z + 0.63;
    return tall
      ? { x: 0.02, y: src.y + 0.12, z: -z, sx: 0, sy: (middle - (src.y + 0.12)) / r, fov: 40 }
      : { x: src.x - 0.1, y: src.y - 0.06, z: -z, sx: (0.235 - (src.x - 0.1)) / r, sy: (middle - (src.y - 0.06)) / r, fov: 40 };
  };
  const cover = stand(1, tall ? -0.36 : -0.14);
  k.cut(0, { prog: 0, ...cover, focus: back + 0.1, ap: 0.004, day: 1, dayZ: 0.45, dayK: 2.3, lz: 9.5, lk: 0.205, la: 0.36, lr: 0.36, fill: 0.17, side: 0.06, glow: 1, ink: 0, gobo: 0.3, cutW: 1 });
  const C = c.cover;
  const F = c.folder;
  k.move(C + 0.1, C + 0.75, { cutW: 0 }, 'sine.in');
  k.move(C + 0.0, C + 0.75, { z: -back * 0.82, sx: (cover.sx as number) * 0.62, sy: (cover.sy as number) * 0.8 }, 'sine.in');
  k.move(C + 0.75, F, { z: 0.62, sx: 0, sy: 0, x: src.x, y: src.y, fov: 52 }, 'sine.inOut');
  k.move(C + 0.6, F, { focus: 2.2, ap: 0, dayK: 1.8, lz: 9, lk: 0.24, la: 0.55, lr: 0.3, fill: 0.02, side: 0 }, 'sine.inOut');
  k.move(C + 1.0, C + 1.35, { ink: 1 }, 'none');
  k.move(C + 1.4, F + 0.5, { bend: 1 }, 'sine.inOut');

  /* ----------------------------------------------------------------- folder */
  const span = c.sleeve - F;
  const w = (i: number) => world.ringZ([18, 38, 58][i]) - 0.13;
  // [time, depth]: approach, hang in front of the words, pass.
  const stops: [number, number][] = [
    [F + span * 0.16, w(0) - 1.95], [F + span * 0.29, w(0) - 1.5], [F + span * 0.47, w(1) - 1.95], [F + span * 0.6, w(1) - 1.5],
    [F + span * 0.78, w(2) - 1.95], [F + span * 0.91, w(2) - 1.45], [c.sleeve + 0.05, w(2) + 0.35],
  ];
  let t = F;
  const look = tall ? 1.65 : 2.2;
  const turn = tall ? 1 : 0.72;
  for (const [at, z] of stops) {
    const p = world.centre(z);
    const ahead = world.centre(z + look);
    k.move(t, at, { z, x: p.x, y: p.y, yaw: Math.atan2(ahead.x - p.x, look) * turn, pitch: -Math.atan2(ahead.y - p.y, look) * turn, lz: z + (tall ? 8.7 : 7.6) }, 'sine.inOut');
    t = at;
  }
  // The vanishing point is never allowed to settle in the middle.
  const drift: [number, number][] = tall ? [[0, 0.07], [0, -0.05], [0, 0.05]] : [[0.2, -0.02], [-0.22, 0.06], [0.1, -0.06]];
  k.move(F, F + span * 0.2, { sx: drift[0][0], sy: drift[0][1] }, 'sine.inOut');
  k.move(F + span * 0.3, F + span * 0.5, { sx: drift[1][0], sy: drift[1][1] }, 'sine.inOut');
  k.move(F + span * 0.61, F + span * 0.81, { sx: drift[2][0], sy: drift[2][1] }, 'sine.inOut');
  k.move(F - 0.6, F + span * 0.4, { roll: 0.1 }, 'sine.inOut').move(F + span * 0.4, F + span * 0.82, { roll: -0.08 }, 'sine.inOut').move(F + span * 0.82, c.sleeve + 0.3, { roll: 0 }, 'sine.inOut');
  // 0 uncut, 1 there, 2 cut away again.
  const out = tall ? 0.05 : 0;
  k.move(F + 0.02, F + span * 0.13, { t0: 1 }, 'none').move(F + span * (0.35 - out), F + span * (0.42 - out), { t0: 2 }, 'none');
  k.move(F + span * 0.37, F + span * 0.45, { t1: 1 }, 'none').move(F + span * (0.66 - out), F + span * (0.72 - out), { t1: 2 }, 'none');
  k.move(F + span * 0.68, F + span * 0.76, { t2: 1 }, 'none').move(F + span * (0.94 - out), F + span * (0.99 - out), { t2: 2 }, 'none');
  k.move(F, F + span * 0.3, { dayK: 2, focus: 1.75 }, 'none');

  /* ----------------------------------------------------------------- sleeve */
  const S = c.sleeve;
  const P = c.player;
  k.move(S + 0.05, S + 0.55, { x: valley.x - (tall ? 0.02 : 0.3), y: valley.y + 0.06, z: V - 2.2, yaw: 0, pitch: 0, sx: tall ? 0 : -0.17, sy: tall ? 0 : 0.03, lz: V + 2.8, lk: 0.55, la: 0.82, lr: 0.15, focus: 3.4, fov: tall ? 62 : 50 }, 'sine.inOut');
  k.move(S + 0.55, S + 0.8, { z: V - 1.95 }, 'none');
  k.move(S + 0.8, P, { x: valley.x, y: valley.y, z: V + 0.3, sx: 0, sy: 0, fov: 40, lk: rest.lk!, la: rest.la!, ap: 0, focus: 3 }, 'sine.inOut');

  /* ----------------------------------------------------------------- player */
  // Same place, same light. From here the valley belongs to a sleeve in a wall.
  const s = tall ? { w: 1.613, h: 3.072, x: 0.355, y: -1.081 } : { w: 2.759, h: 1.724, x: 1.2345, y: -0.111 };
  k.cut(P, { prog: 1, x: 0, y: 0, z: 0.4, ...rest, lz: 2.9, day: 1, dayZ: 0, dayK: 26, gobo: 0.6, dusk: 0, side: 0.3, cutW: 1, set: 1, rec: 0, base: 1, plaque: 1, dock: 1, spill: 0, focus: 3, ap: 0, bz: -0.05, pz: -0.06, dz: -0.07 });
  // Close enough that the window has no edges: the screen is the application.
  const full = Math.min(s.h / tan(40), s.w / (aspect * tan(40))) * (tall ? 0.9 : 0.985);
  const seen = full * tan(40);
  // If something must be cut off, it is the title bar, never the dock.
  const mid = { x: tall ? 0.18 : s.x, y: s.y - Math.max(0, s.h - seen) + (tall ? 0.0 : 0.005) };
  k.move(P, P + 1.3, { z: -full, x: mid.x, y: mid.y, focus: full }, 'power2.inOut');
  k.move(P + 0.95, P + 1.2, { ink: 1 }, 'none');
  // Instruments lift off; the record does not. Nor do the words.
  const O = P + 1.5;
  const L = c.light;
  const far = Math.max(1, 1.6 / aspect);
  if (tall) k.move(O, O + 0.95, { x: -1.4, y: -1.35, z: -15.4, yaw: 0.115, pitch: 0.0, sx: 0, sy: 0.0, dz: -1.5, pz: -0.8, focus: 15, adrift: 1 }, 'sine.inOut');
  else k.move(O, O + 0.95, { x: -1.45, y: 0.46, z: -6.75 * far, yaw: 0.1, pitch: 0.072, sx: 0, sy: 0.0, dz: -1.5, pz: -0.8, focus: 6.6 * far, fov: 42, adrift: 1 }, 'sine.inOut');
  k.move(O + 0.1, O + 0.45, { ink: 0 }, 'none');
  k.move(O + 0.55, O + 0.85, { floats: 1 }, 'none');
  k.move(O + 0.75, O + 1.1, { cut: 1 }, 'none');
  k.move(O + 0.55, O + 1.5, { lift: 1.35 }, 'sine.out');
  if (tall) k.move(O + 0.95, L - 0.75, { x: -2.1, yaw: 0.15 }, 'none');
  else k.move(O + 0.95, L - 0.75, { x: -2.05, y: 0.56, yaw: 0.18 }, 'none');

  /* ------------------------------------------------------------------ light */
  // Four records, four places to stand. Only the dock comes along.
  const B = c.library;
  const run = B - L;
  const seats: Partial<Film>[] = tall
    ? [
        { x: -0.3, y: 0.08, z: 0.3, yaw: 0.06, pitch: 0, sx: 0, sy: -0.03, fov: 58 },
        { x: 0.05, y: 0, z: 0.4, yaw: 0, pitch: 0, sx: -0.05, sy: 0.06, fov: 58 },
        { x: 0, y: 0.05, z: 0.58, yaw: 0, pitch: 0, sx: -0.12, sy: 0.15, fov: 56 },
        { x: 0.1, y: 0.02, z: 0.3, yaw: 0, pitch: 0, sx: 0.02, sy: -0.02, fov: 60 },
      ]
    : [
        { x: -0.55, y: 0.08, z: 0.3, yaw: 0.1, pitch: 0, sx: -0.1, sy: 0.0, fov: 50 },
        { x: 0.05, y: -0.02, z: 0.42, yaw: 0, pitch: 0, sx: -0.36, sy: -0.12, fov: 50 },
        { x: 0.02, y: 0.05, z: 0.74, yaw: 0, pitch: 0, sx: -0.52, sy: 0.2, fov: 50 },
        { x: 0.42, y: -0.02, z: 0.25, yaw: -0.3, pitch: -0.02, sx: -0.05, sy: 0.02, fov: 52 },
      ];
  const at = (i: number) => L + run * BEATS[i];
  // Going in through one sleeve and coming out in another.
  k.move(L - 0.72, at(0), { ...seats[0], focus: 2.4, dayK: 40, la: 0.95, lk: 0.68 }, 'sine.inOut');
  k.move(L - 0.46, L - 0.02, { rec: 1 }, 'none');
  k.move(L - 0.72, L - 0.45, { floats: 0, cut: 0 }, 'none');
  k.move(L - 0.72, L + 0.0, { follow: 1, adrift: 0 }, 'sine.inOut');
  k.move(L - 0.35, L - 0.12, { ink: 1 }, 'none');
  k.move(L - 0.12, L, { plaque: 0 }, 'none');
  const lingers: Partial<Film>[] = [{ x: tall ? 0.2 : 0.4, yaw: 0.02 }, { spin: 1.15, z: 0.62 }, { z: 0.95, spin: 1.35 }, { z: 0.75, x: 0.12, yaw: -0.12, spin: 1.35 }];
  for (let i = 0; i < 4; i++) {
    if (i > 0) {
      const t0 = at(i) - run * 0.085;
      k.move(t0, at(i) - run * 0.005, { rec: i + 1 }, 'none');
      k.move(t0, at(i) + run * 0.015, { ...seats[i], ...(i === 3 ? { spin: 0 } : {}) }, 'sine.inOut');
    }
    k.move(Math.max(at(i) + run * 0.015, L + 0.14), i < 3 ? at(i + 1) - run * 0.09 : B - 0.1, i === 3 ? { z: 0.75, x: 0.12, yaw: -0.12 } : lingers[i], 'none');
  }

  /* ---------------------------------------------------------------- library */
  const g = world.grid;
  const home = tall ? { c: 0, r: 2 } : { c: 4, r: 0 };
  k.move(B - 0.1, B + 0.15, { duck: 1 }, 'power2.in');
  k.cut(B + 0.15, { prog: 2, homeX: home.c, homeY: -home.r, homeKind: 4, homeRamp: 4, homeLit: 1, others: 1, shut: 1, set: 2, base: 0, dock: 0, day: 1, dayK: 26, dusk: 0, holeOn: 1, gobo: 1, side: 0.2, over: 0, la: 0.95, lk: 0.68 });
  if (tall) {
    k.move(B + 0.15, B + 1.25, { z: -11.6, x: g.x + 1.1, y: g.y + 0.55, yaw: 0, pitch: 0, sx: 0, sy: 0, fov: 40, focus: 11 }, 'power2.inOut');
    k.move(B + 1.25, B + 1.95, { y: g.y - 0.2 }, 'none').move(B + 1.95, B + 2.15, { y: g.y - 1.6 }, 'sine.in');
  } else {
    k.move(B + 0.15, B + 1.25, { z: -7.4, x: g.x - 2.8, y: g.y - 2.2, yaw: 0.31, pitch: 0.02, sx: 0, sy: 0, focus: 8.5, fov: 46 }, 'power2.inOut');
    k.move(B + 1.25, B + 2.15, { y: g.y - 6.4, x: g.x - 2.45 }, 'none');
  }
  k.move(B + 0.7, B + 0.95, { ink: 0 }, 'none');
  // The albums page is one more sheet. It slides across, and its ten windows find theirs.
  const sh = app.shelf;
  const u = sh.art / 2;
  const win = { x: g.x + (sh.window[0] / 2 - sh.first[0] - u) / u, y: g.y - (sh.window[1] / 2 - sh.first[1] - u) / u, w: sh.window[0] / 2 / u, h: sh.window[1] / 2 / u };
  const fitB = Math.max(win.h / (tall ? 0.78 : 0.86), win.w / (aspect * 0.9)) / tan(40);
  k.cut(B + 2.1, { bz: -0.06, dz: -0.1, base: 1, dock: 1, shx: win.w * 3.4 });
  k.move(B + 2.15, B + 2.9, { x: win.x, y: win.y, z: -fitB, yaw: 0, pitch: 0, fov: 40, focus: fitB }, 'sine.inOut');
  k.move(B + 2.15, B + 2.65, { shut: 0, over: 1 }, 'sine.inOut');
  k.move(B + 2.2, B + 2.95, { shx: 0 }, 'power3.out');
  k.move(B + 2.95, B + 3.3, { dz: -0.9, z: -fitB * 0.97 }, 'sine.out');

  /* ------------------------------------------------------------------ radio */
  const R = c.radio;
  const rc = { c: 1, r: 1 };
  const rx = g.x + rc.c * g.px;
  const ry = g.y - rc.r * g.py;
  // The page goes back the way it came, the house lights go down, and one window is left on.
  k.move(R - 0.5, R - 0.05, { shx: -win.w * 3.4, over: 0 }, 'power2.in');
  k.cut(R - 0.04, { base: 0, dock: 0 });
  k.move(R - 0.25, R + 0.1, { others: 0.07, homeLit: 0.07, day: 0.03, dusk: 1, gobo: 0 }, 'sine.inOut');
  k.move(R - 0.1, R + 0.1, { ink: 1 }, 'none');
  k.move(R + 0.1, R + 0.16, { homeLit: 0 }, 'none');
  k.cut(R + 0.17, { homeX: rc.c, homeY: -rc.r, homeKind: 5, homeRamp: 10, live: 1 });
  k.move(R + 0.17, R + 0.45, { homeLit: 1 }, 'power1.in');
  k.move(R + 0.05, R + 0.9, { x: rx, y: ry, z: -0.04, focus: 2.6 }, 'power2.in');
  k.cut(R + 0.9, { prog: 1, x: 0, y: 0, z: -0.04, kindA: 5, kindB: 5, rampA: 10, rampB: 10, rec: 0, spin: 0, follow: 0, duck: 0, set: 3, shx: 0, bz: -0.05, dz: -0.07, pz: -0.06, spill: 0, dayK: 14, lk: 0.7, la: 0.95, fill: 0.012, day: 0.02, side: 0.1 });
  k.move(R + 0.9, R + 1.4, { z: 0.35, x: tall ? 0.0 : -0.05, fov: tall ? 58 : 52, sx: tall ? -0.215 : -0.27 }, 'sine.out');
  k.move(R + 1.4, R + 1.95, { z: 0.5, sx: tall ? -0.2 : -0.22 }, 'none');
  k.cut(R + 1.95, { base: 1, dock: 1 });
  k.move(R + 1.95, R + 2.7, { z: -full, x: mid.x, y: mid.y, fov: 40, sx: 0, sy: 0, focus: full, dz: -0.2 }, 'power2.inOut');

  /* ---------------------------------------------------------------- compact */
  const K = c.compact;
  // A blade goes down the window. The halves part, and what was behind them all along is a desk by day.
  k.move(K - 0.62, K - 0.28, { line: 1 }, 'sine.in');
  k.cut(K - 0.26, { co: 1, cx: s.x + (tall ? 0 : 0.35), cy: s.y, cz: -0.045, day: 1, dayK: 14, dusk: 0, gobo: 1, side: 0.2, cutW: 1 });
  k.move(K - 0.24, K + 0.4, { apart: tall ? 3.6 : 6.2 }, 'power2.inOut');
  k.move(K - 0.05, K + 0.15, { ink: 0 }, 'none');
  k.move(K + 0.0, K + 0.4, { cz: -0.5 }, 'sine.out');
  k.cut(K + 0.42, { base: 0, dock: 0, live: 0 });
  k.move(K + 0.3, K + 0.62, { hw: 0, hh: 0 }, 'sine.inOut');
  const away = full * (tall ? 1.75 : 2.35);
  k.move(K + 0.05, K + 0.78, { z: -away, focus: away, x: s.x, y: s.y, sx: tall ? 0 : -0.2, sy: tall ? 0.09 : 0.02 }, 'sine.inOut');
  k.cut(K + 0.8, { prog: 3, set: 4, apart: 0, line: 0, rampA: 0, rampB: 0, fill: 0, side: 0.1, glow: 1, lz: 2.8, lk: 0.6, la: 1, lr: 0 });
  k.move(K + 0.8, K + 1.5, { cz: -0.8, z: -away * 0.94 }, 'none');
  k.move(K + 1.5, K + 1.95, { cy: s.y + (tall ? 9 : 7), cz: -1.8 }, 'power2.in');

  /* ----------------------------------------------------------------- source */
  const Z = c.source;
  const squat = aspect > 0.6;
  // Back where we began, with the sheet still whole.
  const last = tall ? stand(squat ? 2.1 : 1.68, squat ? -2.35 : -1.6) : stand(1.1, -0.4);
  k.move(Z - 0.5, Z, { ...last, focus: 5 }, 'sine.inOut');
  k.cut(Z, { prog: 0, set: 0, co: 0, open0: 0, open1: 0, open2: 0, open3: 0, o: 0, bend: 0, glow: 0, dayZ: 0.45, dayK: 2.3, lz: 9.5, lk: 0.205, la: 0.36, lr: 0.36, fill: 0.17, side: 0.06, rampA: 0, rampB: 0, lineFloor: tall ? -9 : src.y - 1.2, cutW: 1 });
  k.move(Z - 0.0, Z + 1.3, { lines: 1 }, 'none');
  k.move(Z + 1.1, Z + 1.6, { glow: 1 }, 'sine.in');
  k.move(Z + 1.2, Z + 1.75, { open0: 1 }, 'sine.inOut').move(Z + 1.35, Z + 1.95, { open1: 1 }, 'sine.inOut').move(Z + 1.5, Z + 2.15, { open2: 1 }, 'sine.inOut').move(Z + 1.65, Z + 2.4, { open3: 1 }, 'sine.inOut');
  // Evening. Now the letters are the lamp.
  k.move(Z + 1.75, c.end - 0.2, { day: 0.045, dusk: 1, gobo: 0, rim: 0.40 }, 'sine.inOut');
  k.move(Z + 2.2, Z + 2.3, { ink: 1 }, 'none');
  return k;
}
