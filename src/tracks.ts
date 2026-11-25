import { gsap } from 'gsap';

type Key = { t: number; v: number; e: (x: number) => number };

/**
 * A film is a set of numeric tracks over scroll distance, measured in viewport
 * heights. Any moment can be evaluated on its own, so jumping, reversing and
 * resizing all land on exactly the same frame.
 */
export class Tracks<T extends Record<string, number>> {
  private keys = new Map<string, Key[]>();
  constructor(private start: T) {
    for (const k in start) this.keys.set(k, [{ t: -1, v: start[k], e: (x) => x }]);
  }

  private last(k: string) {
    const a = this.keys.get(k);
    if (!a) throw new Error(`no track ${k}`);
    return a[a.length - 1];
  }

  /** Hold until t0, then move to these values by t1. */
  move(t0: number, t1: number, to: Partial<T>, ease = 'sine.inOut') {
    const e = gsap.parseEase(ease) as (x: number) => number;
    for (const k in to) {
      const p = this.last(k);
      if (t0 < p.t - 1e-6) throw new Error(`${k}: ${t0} begins before ${p.t}`);
      const a = this.keys.get(k)!;
      if (t0 > p.t) a.push({ t: t0, v: p.v, e: (x) => x });
      a.push({ t: t1, v: to[k] as number, e });
    }
    return this;
  }

  /** Change at once. */
  cut(t: number, to: Partial<T>) {
    for (const k in to) {
      const a = this.keys.get(k)!;
      const p = this.last(k);
      if (t > p.t) a.push({ t, v: p.v, e: (x) => x });
      a.push({ t, v: to[k] as number, e: (x) => x });
    }
    return this;
  }

  /** The value a track will have settled on so far. */
  at(k: keyof T & string) { return this.last(k).v; }

  evaluate(t: number, into: T) {
    for (const [k, a] of this.keys) {
      let i = a.length - 1;
      while (i > 0 && a[i].t > t) i--;
      const n = a[i + 1];
      const c = a[i];
      let v = c.v;
      if (n && n.t > c.t) v = c.v + (n.v - c.v) * n.e(Math.min(1, Math.max(0, (t - c.t) / (n.t - c.t))));
      (into as Record<string, number>)[k] = v;
    }
  }

  get base() { return this.start; }
}
