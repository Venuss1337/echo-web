import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { World, type Program } from './world/world';
import { outlines } from './world/bake';
import { App, palettes } from './app';
import { Call } from './call';
import { BEATS, blankFilm, shoot, type Cues, type Film } from './film';
import type { Tracks } from './tracks';
import { breathe, clear, gate, land, painted, through, within } from './wait';

gsap.registerPlugin(ScrollTrigger);
const root = document.documentElement;
const $ = <T extends Element>(s: string, from: ParentNode = document) => from.querySelector<T>(s)!;
const $$ = <T extends Element>(s: string, from: ParentNode = document) => [...from.querySelectorAll<T>(s)];
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const PROGRAMS: Program[] = ['descent', 'record', 'library', 'blank'];
const smooth = (x: number) => { const v = clamp(x); return v * v * v * (v * (v * 6 - 15) + 10); };

/** The page has gone over to prints. */
const gone = () => !root.classList.contains('live');

export async function film() {
  gate(1);
  // The words hang in the paper, so the type has to be here before they are cut.
  const type = within(4000, document.fonts.load('600 40px "Stack Sans Notch Variable"'));
  await painted();
  const canvas = $<HTMLCanvasElement>('#paper');
  const preserve = new URLSearchParams(location.search).has('capture');
  const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: preserve });
  if (gone()) return;
  if (!gl || !(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) {
    root.className = 'still';
    return clear(false);
  }
  const isTall = () => innerWidth / innerHeight < 0.9;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let tall = isTall();
  const world = new World(canvas, { portrait: tall, steps: coarse ? 4 : 6, context: gl, preserve });
  Object.assign(world.state, blankFilm);
  const state = world.state as Film;
  let app = new App(world, tall);
  const call = new Call(world);

  /* ------------------------------------------------------ the length of things */
  const sections = $$<HTMLElement>('main > section');
  const cues = {} as Cues;
  let end = 0;
  for (const s of sections) {
    const len = Number(s.dataset.len);
    cues[s.id as keyof Cues] = end;
    s.style.setProperty('--len', String(len + (s.hasAttribute('data-last') ? 1 : 0)));
    end += len;
  }
  cues.end = end;

  /* --------------------------------------------------------------- one clock */
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, autoRaf: false, stopInertiaOnNavigate: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.lagSmoothing(0);

  let time = 0;
  let dirty = true;
  let tracks: Tracks<Film>;
  const wake = () => { dirty = true; };
  call.wake = wake;
  app.onload = wake;

  /* ------------------------------------------------------------------- type */
  // Each passage of type is in, not yet in, or gone. The blade itself is CSS.
  const { cover: C, folder: F, sleeve: S, player: P, light: L, library: B, radio: R, compact: K, source: Z } = cues;
  const run = B - L;
  const there = (i: number) => L + run * BEATS[i];
  const passages: Record<string, [number, number]> = {
    cover: [-1, C + 0.32], 'folder-a': [F + 0.45, F + 1.3], 'folder-b': [F + 1.7, F + 2.6], sleeve: [S + 0.4, S + 0.86],
    player: [P + 2.2, L - 0.75], light: [there(0) + 0.06, there(1) - run * 0.1], 'light-b': [there(1) + 0.06, there(2) - run * 0.1],
    'light-c': [there(2) + 0.06, there(3) - run * 0.1], 'light-d': [there(3) + 0.06, B - 0.16], list: [there(0) + 0.06, B - 0.16],
    library: [B + 1.0, B + 2.05], radio: [R + 1.15, R + 1.93], compact: [K + 0.72, K + 1.52], source: [Z + 0.2, 1e9],
  };
  const cuts = $$<HTMLElement>('.cut').map((el) => {
    $$<HTMLElement>(':scope > span', el).forEach((l, i) => l.style.setProperty('--i', String(i)));
    return { el, at: passages[el.dataset.cut!] };
  });
  const pins = sections.map((s) => {
    const at = $$<HTMLElement>('.cut', s).map((e) => passages[e.dataset.cut!]);
    return { el: $<HTMLElement>('.pin', s), from: Math.min(...at.map((w) => w[0])), to: Math.max(...at.map((w) => w[1])) };
  });

  /* --------------------------------------------------------------- layout */
  const density = (w: number, h: number) => Math.min(devicePixelRatio || 1, coarse ? 1.6 : 1.5, Math.sqrt((coarse ? 1.15e6 : 2.6e6) / (w * h)));
  function size() {
    const w = innerWidth;
    const h = canvas.clientHeight || innerHeight;
    world.resize(w, h, density(w, h));
    const g = app.shelf;
    const u = g.art / 2;
    // The cell we will come out of sits at the origin.
    const home = tall ? { c: 0, r: 2 } : { c: 4, r: 0 };
    Object.assign(world.grid, { px: g.pitch[0] / u, py: g.pitch[1] / u, cell: 1, cols: g.cols, rows: g.rows });
    world.grid.x = -home.c * world.grid.px;
    world.grid.y = home.r * world.grid.py;
    tracks = shoot(world, app, cues, w / h);
    wake();
  }

  const rail = $<HTMLElement>('.rail');
  const chapters = $$<HTMLAnchorElement>('.rail nav a');
  const records = $$<HTMLButtonElement>('[data-record]');
  const swatches = $$<HTMLElement>('.swatches i');
  let record = -1;
  let sheetOf = 0;

  function frame(t: number) {
    tracks.evaluate(t, state);
    const set = Math.round(state.set);
    const whole = Math.min(4, Math.floor(state.rec));
    const part = whole < 4 ? state.rec - whole : 0;
    if (set === 1) {
      state.kindA = state.rampA = whole;
      state.kindB = state.rampB = Math.min(4, whole + 1);
    }
    state.morph = state.pmix = set === 1 ? part : 0;
    world.aim();
    if (set === 1) app.now(state, part);
    else if (set === 2) app.albums(state);
    else if (set === 3) app.radio(state);
    else if (set === 4) app.compact(state);
    else app.none();

    rail.dataset.on = state.ink > 0.5 ? 'dark' : 'paper';
    // The app carries its own mark. One at a time.
    rail.classList.toggle('yield', (set === 1 || set === 3) && state.base > 0.5 && state.z < -2.2 && Math.abs(state.yaw) < 0.05 && state.apart < 0.5);
    for (const { el, at } of cuts) {
      el.classList.toggle('in', t >= at[0] && t <= at[1]);
      el.classList.toggle('gone', t > at[1]);
    }
    for (const p of pins) p.el.classList.toggle('on', t >= p.from && t <= p.to);
    const on = Math.min(4, Math.round(state.rec));
    if (on !== record) {
      record = on;
      records.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.record) === on)));
      swatches.forEach((s, i) => { s.style.backgroundColor = palettes[on][i]; });
      if (call.playing) call.stop();
    }
    if (call.playing && (t < P + 1.2 || t > B)) call.stop();
    chapters.forEach((a) => {
      const id = a.hash.slice(1);
      const from = id === 'player' ? S + 1.0 : cues[id as keyof Cues];
      const to = id === 'player' ? B : id === 'library' ? R : id === 'radio' ? K : end + 1;
      if (t >= from && t < to) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    document.body.classList.toggle('cuttable', cuttable());
    if (world.strokes && !drawing && !introducing && (!cuttable() || prog() !== sheetOf)) world.mend();
    sheetOf = prog();
    // Where the knife can reach on this sheet.
    const g = world.grid;
    Object.assign(world.sheetMap, sheetOf === 0 ? { x: 0, y: 0, s: 1 } : sheetOf === 1 ? { x: -0.8, y: 0, s: tall ? 2.4 : 1.35 } : sheetOf === 2 ? { x: g.x + 2, y: g.y - 4, s: tall ? 5 : 3 } : { x: 0.6, y: 0, s: tall ? 3.4 : 2.4 });
    // Fetch what the next scene needs before it is needed.
    if (t > C + 0.2) app.preload(['now-0-base', 'now-0-plaque', 'now-0-dock']);
    if (t > S) app.preload(['now-0-dock-on', ...[1, 2, 3, 4].flatMap((n) => [`now-${n}-dock`, `now-${n}-dock-on`])]);
    if (t > L) app.preload(['albums-base', 'albums-dock']);
    if (t > B) app.preload(['radio-base', 'radio-dock', 'compact-radio']);
  }

  /* ------------------------------------------------------------- landing */
  const landing: Record<string, number> = {
    cover: 0, folder: F + 0.8, sleeve: S + 0.68, player: P + 2.75, light: there(0) + 0.3, library: B + 1.6, radio: R + 1.6, compact: K + 1.15, source: end,
  };
  const px = (t: number) => (t / end) * (document.documentElement.scrollHeight - innerHeight);
  const go = (id: string, immediate = false) => {
    const t = landing[id];
    if (t === undefined) return;
    const y = px(t);
    lenis.scrollTo(y, immediate ? { immediate: true, force: true } : { duration: Math.min(3.2, 1.2 + Math.abs(y - lenis.scroll) / innerHeight / 9), easing: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2) });
  };
  for (const a of $$<HTMLAnchorElement>('a[href^="#"]'))
    a.addEventListener('click', (e) => {
      const id = a.hash.slice(1);
      if (landing[id] === undefined) return;
      e.preventDefault();
      history.pushState(null, '', a.hash);
      go(id);
    });
  addEventListener('popstate', () => go(location.hash.slice(1) || 'cover'));
  records.forEach((b, i) => b.addEventListener('click', () => lenis.scrollTo(px(there(i) + run * 0.07), { duration: 1.5 })));
  // Tabbing to something that is not on screen brings its scene to it.
  document.addEventListener('focusin', (e) => {
    const s = (e.target as Element).closest('main > section');
    if (!s) return;
    const p = pins[sections.indexOf(s as HTMLElement)];
    if (time < p.from + 0.2 || time > p.to - 0.1) go(s.id);
  });

  /* --------------------------------------------------------- hands on paper */
  const prog = () => Math.round(state.prog);
  const cuttable = () => !introducing && ((prog() === 0 && state.z < -1 && state.cutW > 0.5) || prog() === 3 || (prog() === 1 && time > P + 2.2 && time < L - 0.72) || (prog() === 2 && time > B + 0.9 && time < B + 2.15));
  const pressed = () => (prog() === 0 && state.z > 0 ? state.z + 1.6 : prog() === 1 && state.z > 0 ? state.z + 0.6 : 0);
  const want = { x: 0, y: 0 };
  const ndc = (e: { clientX: number; clientY: number }) => ({ x: (e.clientX / innerWidth) * 2 - 1, y: 1 - (e.clientY / innerHeight) * 2 });

  let down: { x: number; y: number; t: number; fine: boolean } | null = null;
  let drawing: { pts: { x: number; y: number }[]; drawn: number; length: number } | null = null;
  // A cut gapes in the middle and closes to nothing at its ends, as paper does.
  const BLADE = 0.052;
  const blade = (s: number, total: number, k: number) => BLADE * k * Math.sin((Math.PI / 2) * clamp(s / (0.75 * k))) ** 0.8 * Math.sin((Math.PI / 2) * clamp((total - s) / (0.75 * k))) ** 0.8;
  /** Draws whatever of the stroke has become certain: all but the tail, until the hand lifts. */
  function draw(final: boolean) {
    if (!drawing) return;
    const { pts } = drawing;
    let s = 0;
    const total = final ? drawing.length : 1e9;
    const k = world.sheetMap.s;
    const until = final ? drawing.length : drawing.length - 0.75 * k;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (s + d > drawing.drawn && s < until) {
        // Long steps are taken in short ones, so the taper is smooth.
        const n = Math.max(1, Math.ceil(d / (0.05 * k)));
        for (let j = 0; j < n; j++) {
          const s0 = s + (d * j) / n;
          const s1 = s + (d * (j + 1)) / n;
          if (s1 <= drawing.drawn || s0 >= until) continue;
          const mix = (f: number) => ({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f });
          world.cut(mix(j / n), mix((j + 1) / n), blade(s0, total, k), blade(s1, total, k));
        }
      }
      s += d;
    }
    drawing.drawn = Math.max(drawing.drawn, Math.min(until, drawing.length));
    wake();
  }

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') {
      want.x = (e.clientX / innerWidth) * 2 - 1;
      want.y = (e.clientY / innerHeight) * 2 - 1;
      wake();
    }
    if (!down || !down.fine) return;
    if (!drawing && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 && cuttable()) {
      const from = ndc({ clientX: down.x, clientY: down.y });
      drawing = { pts: [world.project(from.x, from.y, 0)], drawn: 0, length: 0 };
      getSelection()?.removeAllRanges();
    }
    if (!drawing) return;
    const n = ndc(e);
    const p = world.project(n.x, n.y, 0);
    const q = drawing.pts[drawing.pts.length - 1];
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < 0.008 * world.sheetMap.s) return;
    drawing.pts.push(p);
    drawing.length += d;
    call.slice(d * 14);
    draw(false);
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest('a, button')) return;
    down = { x: e.clientX, y: e.clientY, t: e.timeStamp, fine: e.pointerType !== 'touch' };
  }, { passive: true });
  const lift = (e: PointerEvent) => {
    const was = down;
    down = null;
    if (drawing) {
      const { pts, length } = drawing;
      const k = world.sheetMap.s;
      const a = pts[0];
      const b = pts[pts.length - 1];
      // Come back to where you started and the piece falls out.
      if (pts.length > 8 && length > 0.9 * k && Math.hypot(a.x - b.x, a.y - b.y) < 0.2 * k) {
        world.punch(pts);
        wake();
      } else draw(true);
      drawing = null;
      return;
    }
    if (!was || e.type === 'pointercancel' || (e.target as Element).closest('a, button')) return;
    if (Math.hypot(e.clientX - was.x, e.clientY - was.y) > 9 || e.timeStamp - was.t > 700) return;
    const n = ndc(e);
    if (Math.round(state.set) === 1 && time > P + 1.1) {
      // In the app, a press is the play button.
      if (call.playing) call.stop();
      else {
        app.playing = true;
        call.play(record);
      }
      return;
    }
    call.press(n.x, n.y, pressed());
    // A sleeve on the wall answers with its own light.
    if (prog() === 2) {
      const p = world.project(n.x, n.y, 0);
      const g = world.grid;
      Object.assign(world.flare, { x: Math.round((p.x - g.x) / g.px), y: Math.round((p.y - g.y) / g.py), v: 1.1 });
    }
  };
  addEventListener('pointerup', lift, { passive: true });
  addEventListener('pointercancel', lift, { passive: true });
  call.ended = () => { app.playing = false; wake(); };

  const sound = $<HTMLButtonElement>('.sound');
  sound.addEventListener('click', () => {
    const on = call.toggle();
    sound.setAttribute('aria-pressed', String(on));
    $('span', sound).textContent = on ? 'Sound on' : 'Sound off';
    if (on && !call.playing) call.press(0.45, 0.1, pressed());
  });

  /* ---------------------------------------------------------------- the open */
  // A blade goes round each letter, and then the letter is let go.
  const intro = { trace: 0, open: 0, light: 0, heal: 1 };
  let introducing = true;
  let armed = false;
  let traced = 0;
  const paths = () => outlines(world.layout).map((pts) => {
    const loop = [...pts, pts[0]];
    const len = loop.slice(1).map((p, i) => Math.hypot(p[0] - loop[i][0], p[1] - loop[i][1]));
    return { loop, len, total: len.reduce((a, b) => a + b, 0) };
  });
  let letters = paths();
  function trace(to: number) {
    letters.forEach((l, n) => {
      const lag = n * 0.1;
      const a = clamp((traced - lag) / (1 - 0.3)) * l.total;
      const b = clamp((to - lag) / (1 - 0.3)) * l.total;
      let s = 0;
      for (let i = 0; i < l.len.length && b > a; i++) {
        const s1 = s + l.len[i];
        if (s1 > a && s < b) {
          const f0 = clamp((a - s) / l.len[i]);
          const f1 = clamp((b - s) / l.len[i]);
          const [x0, y0] = l.loop[i];
          const [x1, y1] = l.loop[i + 1];
          world.cut({ x: x0 + (x1 - x0) * f0, y: y0 + (y1 - y0) * f0 }, { x: x0 + (x1 - x0) * f1, y: y0 + (y1 - y0) * f1 }, 0.012, 0.012);
        }
        s = s1;
      }
    });
    traced = to;
  }

  size();
  ScrollTrigger.create({
    trigger: '#film', start: 'top top', end: 'bottom bottom',
    onUpdate: (self) => { time = self.progress * end; wake(); },
    onRefresh: (self) => { time = self.progress * end; wake(); },
  });

  const paces: number[] = [];
  let wasDrawing = false;
  let settled = false;
  let last = 0;
  let shown = true;
  document.addEventListener('visibilitychange', () => { shown = !document.hidden; wake(); });
  const tick = (seconds: number) => {
    if (gone()) return stop();
    lenis.raf(seconds * 1000);
    const dt = Math.min(0.1, seconds - last);
    last = seconds;
    if (!shown) return;
    const lx = want.x * 0.028 - world.lean.x;
    const ly = want.y * 0.02 - world.lean.y;
    if (Math.abs(lx) + Math.abs(ly) > 1e-4) {
      const f = 1 - Math.exp(-dt * 4.2);
      world.lean.x += lx * f;
      world.lean.y += ly * f;
      dirty = true;
    }
    if (call.step(dt)) dirty = true;
    if (world.flare.v > 0.01) {
      world.flare.v *= Math.exp(-dt * 1.9);
      dirty = true;
    }
    if (introducing) dirty = true;
    if (dirty) frame(time);
    // Nothing is drawn until the first program has been compiled in the background.
    if (!armed) return;
    // Radio is live. Nothing else on this page moves by itself.
    if (state.live > 0.5) {
      world.time += dt;
      dirty = true;
    }
    if (!dirty) { wasDrawing = false; return; }
    dirty = false;
    if (introducing && time < C + 2) {
      if (intro.trace > traced) trace(intro.trace);
      state.open0 = smooth(intro.open * 1.7);
      state.open1 = smooth(intro.open * 1.7 - 0.2);
      state.open2 = smooth(intro.open * 1.7 - 0.4);
      state.open3 = smooth(intro.open * 1.7 - 0.6);
      // The blade works on the front sheet; stand where the letters will be when they open.
      state.z -= 0.63 * (1 - smooth(intro.open * 1.1));
      state.cutW *= intro.heal;
      state.glow *= intro.light;
    }
    world.render();
    // Resolution follows what the machine can hold. Hitches and lone frames are not evidence.
    if (settled && wasDrawing && dt < 0.07) {
      paces.push(dt);
      if (paces.length >= 48) {
        const mid = paces.sort((a, b) => a - b)[24];
        paces.length = 0;
        const next = mid > 0.0215 ? Math.max(0.5, world.scale * 0.86) : mid < 0.0125 ? Math.min(1, world.scale * 1.1) : world.scale;
        if (next !== world.scale) {
          world.scale = next;
          const h = canvas.clientHeight || innerHeight;
          world.resize(innerWidth, h, density(innerWidth, h));
          wake();
        }
      }
    }
    wasDrawing = true;
  };
  gsap.ticker.add(tick);

  let pending = 0;
  let lastW = innerWidth;
  addEventListener('resize', () => {
    // A phone's address bar coming and going is not a new layout.
    if (coarse && innerWidth === lastW) return;
    lastW = innerWidth;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      if (isTall() !== tall) {
        tall = isTall();
        world.relayout(tall);
        world.mend();
        letters = paths();
        app = new App(world, tall);
        app.onload = wake;
        void words();
      }
      size();
      ScrollTrigger.refresh();
    });
  });

  async function words() {
    await world.setType(
      tall
        ? [{ lines: ['Somewhere', 'on your', 'drive'], ring: 18, width: 0.4 }, { lines: ['there’s', 'a folder'], ring: 38, width: 0.4 }, { lines: ['nobody', 'else has'], ring: 58, width: 0.4 }]
        : [{ lines: ['Somewhere on', 'your drive'], ring: 18, width: 0.86 }, { lines: ['there’s', 'a folder'], ring: 38, width: 0.74 }, { lines: ['nobody', 'else has'], ring: 58, width: 0.78 }],
      [['Instruments', 'float.'], ['Music', 'doesn’t.']], '"Stack Sans Notch Variable"', 600,
    );
    wake();
  }

  /** Nothing of the film is left running behind the prints. */
  function stop() {
    root.className = 'still';
    gsap.ticker.remove(tick);
    lenis.destroy();
    ScrollTrigger.getAll().forEach((t) => t.kill());
    clear(false);
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
  });

  const start = location.hash.slice(1);
  // A refresh, or coming back, keeps the place the browser kept. Only a new visit goes where its address says.
  const [visit] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (landing[start] !== undefined && start !== 'cover' && (visit?.type === 'navigate' || scrollY < 2)) go(start, true);
  // Whatever stands where the visitor is about to arrive, and nothing else yet.
  const arriving = () => {
    time = (scrollY / Math.max(1, root.scrollHeight - innerHeight)) * end;
    frame(time);
    return PROGRAMS[Math.round(state.prog)];
  };
  const compiled = new Set<Program>([arriving()]);
  const compiling = world.compile([...compiled]);
  await type;
  await words();
  gate(2);
  await compiling;
  for (let p = arriving(); !compiled.has(p); p = arriving()) {
    compiled.add(p);
    await world.compile([p]);
  }
  for (let n = 0; n < 80 && world.panels.some((p) => p.o > 0 && !p.tex); n++) {
    await new Promise((done) => setTimeout(done, 50));
    arriving();
  }
  if (gone()) return stop();
  armed = true;
  wake();
  await breathe();
  gate(3);
  await land();
  if (gone()) return stop();
  const inside = time > C + 0.3;
  root.classList.add('ready', ...(inside ? ['through'] : []));
  if (inside) void through(canvas);
  setTimeout(clear, inside ? 1000 : 600);
  (window as any).__echo = { world, state, lenis, cues, call, seek: (t: number) => { lenis.scrollTo(px(t), { immediate: true, force: true }); }, get time() { return time; } };
  gsap.timeline({ onComplete: () => { introducing = false; world.mend(); wake(); } })
    .to(intro, { light: 1, duration: 0.4, ease: 'none' }, 0.15)
    .to(intro, { trace: 1, duration: 1.7, ease: 'sine.inOut' }, 0.25)
    .to(intro, { open: 1, duration: 1.7, ease: 'none' }, 1.35)
    .to(intro, { heal: 0, duration: 0.5, ease: 'none' }, 2.75)
    .add(() => { if (time < 0.2) call.press(0.55, 0.08, 0, 0.6); }, 3.1);
  // The rest is compiled while the cover is being read.
  for (const p of PROGRAMS) if (!compiled.has(p)) await world.compile([p]);
  (window as any).ready = true;
  setTimeout(() => { settled = true; }, 1500);
}
