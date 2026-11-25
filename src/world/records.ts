/**
 * Light, per record: four stops from the far dark to the source itself.
 * Values are linear RGB. The paper has no colour of its own.
 */
export type Ramp = [number[], number[], number[], number[]];

export const ramps: Ramp[] = [
  // 0 Low Sun
  [[0.105, 0.006, 0.04], [0.7, 0.03, 0.035], [1.0, 0.27, 0.035], [1.0, 0.82, 0.5]],
  // 1 Undertow
  [[0.002, 0.03, 0.075], [0.0, 0.2, 0.31], [0.08, 0.6, 0.62], [0.82, 1.0, 0.9]],
  // 2 Stairwell
  [[0.014, 0.012, 0.1], [0.05, 0.07, 0.56], [0.36, 0.4, 1.0], [0.93, 0.93, 1.0]],
  // 3 Bloom Count
  [[0.085, 0.022, 0.0], [0.5, 0.17, 0.0], [1.0, 0.58, 0.03], [1.0, 0.95, 0.58]],
  // 4 Arcade
  [[0.0, 0.04, 0.02], [0.012, 0.25, 0.085], [0.4, 0.74, 0.07], [0.95, 1.0, 0.66]],
  // 5 Second Evening (Low Sun, later)
  [[0.012, 0.018, 0.075], [0.16, 0.06, 0.36], [0.86, 0.24, 0.42], [1.0, 0.82, 0.74]],
  // 6 Long Shore (Undertow, at dusk)
  [[0.05, 0.015, 0.012], [0.34, 0.1, 0.06], [0.9, 0.44, 0.26], [1.0, 0.9, 0.76]],
  // 7 Civic (Stairwell, by day)
  [[0.05, 0.03, 0.02], [0.36, 0.24, 0.14], [0.86, 0.68, 0.42], [1.0, 0.96, 0.84]],
  // 8 Seed Packet (Bloom Count, red)
  [[0.07, 0.0, 0.02], [0.5, 0.0, 0.1], [0.98, 0.14, 0.22], [1.0, 0.78, 0.7]],
  // 9 Allotment (Arcade, in rain)
  [[0.004, 0.03, 0.04], [0.02, 0.16, 0.2], [0.26, 0.56, 0.58], [0.86, 0.98, 0.94]],
  // 10 Air: whatever comes in off the radio
  [[0.012, 0.016, 0.05], [0.07, 0.1, 0.3], [0.42, 0.56, 0.92], [0.95, 0.98, 1.0]],
];

export const names = ['Low Sun', 'Undertow', 'Stairwell', 'Bloom Count', 'Arcade'] as const;
