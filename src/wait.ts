/**
 * The sheet before it is cut. The drawing is wait.css, and is on screen before any
 * of this runs; here it is told what has really happened, and put away.
 */
const root = document.documentElement;
const el = document.querySelector<HTMLElement>('#wait');
const SOFT = 'cubic-bezier(0.62, 0, 0.14, 1)';

/** 1: the film has arrived. 2: its type is loaded and its sheets are cut. 3: the first scene has been drawn. */
export function gate(n: 1 | 2 | 3) {
  root.dataset.load = String(n);
  performance.mark(`echo:${n}`);
}

/** Lets what was just changed reach the screen before something heavy is started. */
export const breathe = () =>
  new Promise<void>((done) => {
    const t = setTimeout(done, 60);
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); done(); }));
  });

/** Resolves once the waiting sheet is on the screen. Starting WebGL before that would hold it back. */
export const painted = () =>
  within(700, new Promise<void>((done) => {
    if (document.hidden || performance.getEntriesByName('first-contentful-paint').length) return done();
    new PerformanceObserver((l, o) => { if (l.getEntriesByName('first-contentful-paint').length) { o.disconnect(); done(); } }).observe({ type: 'paint', buffered: true });
  }));

/** Resolves when a promise does, or when there has been enough waiting for it. */
export const within = (ms: number, p: Promise<unknown>) =>
  Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, ms))]).then(() => {});

/** The ring turns to face the sheet, its echoes catch up with it, and it touches down where the O will be. */
export async function land() {
  if (!el) return;
  const shades = ['.h1', '.h2', '.h3'].map((s) => el.querySelector<HTMLElement>(s)!);
  const paper = el.querySelector<HTMLElement>('.air .hang')!;
  const here = Number(getComputedStyle(shades[0]).opacity);
  // Too fast to have been noticed: there is nothing to put away.
  if (here < 0.06) return;
  const ms = 220 + 480 * here;
  const played: Animation[] = [];
  const to = (e: Element, frames: Keyframe[], duration: number, easing = SOFT) => played.push(e.animate(frames, { fill: 'forwards', duration, easing }));
  shades.forEach((h, n) => {
    const at = getComputedStyle(h);
    const turned = getComputedStyle(h.firstElementChild!).transform;
    const took = ms * (1 - n * 0.06);
    // The ring comes down along its own light and meets its shadow.
    for (const e of n ? [h] : [h, paper]) {
      to(e, [{ transform: getComputedStyle(e).transform }, { transform: 'none' }], took);
      to(e.firstElementChild!, [{ transform: turned }, { transform: 'none' }], took);
    }
    to(h, n ? [{ opacity: at.opacity }, { opacity: at.opacity, offset: 0.35 }, { opacity: 0, offset: 0.9 }, { opacity: 0 }] : [{ opacity: at.opacity }, { opacity: 1 }], took, 'linear');
  });
  to(paper, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: here, offset: 0.8 }, { opacity: here }], ms, 'linear');
  await within(ms + 400, Promise.all(played.map((a) => a.finished)));
}

/** Straight into a chapter: the O opens until there is no sheet left. */
export async function through(canvas: HTMLElement) {
  const ring = el?.querySelector<HTMLElement>('.air i');
  if (!ring) return;
  // Its inner edge is the O.
  const r = ring.getBoundingClientRect();
  const edge = ring.clientLeft;
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const a = r.width / 2 - edge;
  const b = r.height / 2 - edge;
  // Far enough that the furthest corner is inside.
  const s = 1.02 * Math.max(...[[0, 0], [innerWidth, 0], [0, canvas.clientHeight], [innerWidth, canvas.clientHeight]].map(([u, v]) => Math.hypot((u - x) / a, (v - y) / b)));
  const at = (n: number) => `ellipse(${a * n}px ${b * n}px at ${x}px ${y}px)`;
  const o = { duration: 820, easing: 'cubic-bezier(0.62, 0, 0.2, 1)', fill: 'forwards' } as const;
  // The chapter's type is on the far side of the sheet too.
  const type = [...document.querySelectorAll('.pin.on')].map((e) => e.animate([{ clipPath: at(1) }, { clipPath: at(s) }], o));
  const cut = canvas.animate([{ clipPath: at(1) }, { clipPath: at(s) }], o);
  for (const h of el!.querySelectorAll('.h1, .air .hang')) h.animate([{ transform: 'none' }, { transform: `scale(${s})` }], o);
  await within(1200, cut.finished);
  for (const c of [cut, ...type]) c.cancel();
}

/** It has done its work. */
export function clear(opened = true) {
  el?.remove();
  try { if (opened) localStorage.setItem('echo', '1'); } catch { /* a private window may say no */ }
}
