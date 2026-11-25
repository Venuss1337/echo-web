import type { State } from './world';

/** The light inside a sleeve when the house lights are down. Covers are shot under it. */
export const rest: Partial<State> = {
  dayZ: 0, dayK: 1, lz: 2.9, lk: 0.62, la: 0.75, lr: 0.15, fill: 0.02, glow: 1, fov: 40,
};
