/* Felzenszwalb and Huttenlocher's linear-time distance transform, one row at a time. */
function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number) {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
function edt(grid: Float64Array, w: number, h: number) {
  const m = Math.max(w, h);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
}

/** Signed distance to the edge of a coverage mask, in widths of the picture. Positive inside. */
export function field(alpha: Uint8Array, w: number, h: number) {
  const out = new Float64Array(w * h), inn = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = alpha[i] / 255;
    out[i] = v === 1 ? 0 : v === 0 ? 1e20 : Math.max(0, 0.5 - v) ** 2;
    inn[i] = v === 1 ? 1e20 : v === 0 ? 0 : Math.max(0, v - 0.5) ** 2;
  }
  edt(out, w, h);
  edt(inn, w, h);
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = (inn[i] - out[i]) / w;
  return d;
}
