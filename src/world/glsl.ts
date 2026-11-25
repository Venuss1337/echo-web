/**
 * The paper world.
 *
 * Every surface on the page is a sheet of white paper standing at some depth.
 * A pixel's ray meets the sheets front to back. Each sheet is a signed distance
 * field: positive where there is paper, negative where it has been cut away.
 * Colour is never pigment. It is light from whatever record stands at the back.
 */

export const vertex = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

const head = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;

uniform vec2 uRes;
uniform vec3 uRo;
uniform mat3 uCam;
uniform float uTan, uFocus, uAp, uTime, uGrain, uFade;
uniform vec2 uShift;         // a shift lens: the vanishing point need not be the middle of the screen
uniform int uK0, uSteps;
uniform sampler2D uNoise;

uniform sampler2D uCut;     // what the visitor has cut
uniform float uCutW;        // 1 open, 0 healed
uniform vec3 uCutMap;       // where the sheet being cut lies: centre, scale
uniform vec2 uSdfE;

uniform vec3 uL;            // toward the window light, in front of the sheets
uniform float uDay, uDayZ, uDayK, uShadow;
uniform vec3 uSky, uKey;
uniform float uGlow, uLz, uLk, uLa, uLr, uFill, uGobo, uDusk, uSide;
uniform vec3 uRampA[4];
uniform vec3 uRampB[4];
uniform float uMorph;
uniform int uKindA, uKindB;
uniform float uWarp;        // how far the light has been leaned on by the pointer

uniform int uPulseN;
uniform vec4 uPulse[4];     // x, y, age, strength

#define TAU 6.2831853
float sat(float x) { return clamp(x, 0., 1.); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// Daylight comes through a window somewhere behind us, and the window has bars.
float gobo(vec2 p, float z) {
  p += uL.xy / -uL.z * z;
  float u = dot(p, vec2(.83, .56)), v = dot(p, vec2(-.48, .88));
  float pane = smoothstep(-3.3, -1.2, u + .25 * v) * (1. - smoothstep(1.9, 4.4, u - .3 * v));
  float bars = (1. - .36 * exp(-pow(abs((u - .55) / .16), 2.))) * (1. - .30 * exp(-pow(abs((v + .62) / .13), 2.)));
  return mix(1., mix(.60, 1.06, pane) * bars, uGobo);
}
float cutSd(vec2 p) {
  vec2 uv = (p - uCutMap.xy) / (uCutMap.z * uSdfE) * .5 + .5;
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) return 1.;
  return textureLod(uCut, uv, 0.).r * uCutMap.z + (1. - uCutW) * .16;
}
vec2 nz(vec2 p) { return textureLod(uNoise, p, 0.).rg; }
float sdBox(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, q.y), 0.); }
float sdRound(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }

vec3 rampOf(vec3 a, vec3 b, vec3 c, vec3 d, float x) {
  x = sat(x);
  return x < .36 ? mix(a, b, smoothstep(0., .36, x)) : x < .70 ? mix(b, c, smoothstep(.36, .70, x)) : mix(c, d, smoothstep(.70, 1., x));
}

// A call travels outward across a sheet, and downward from sheet to sheet.
vec3 ringing(vec2 p, float z) {
  vec3 o = vec3(0.);
  for (int i = 0; i < uPulseN; i++) {
    vec2 q = p - uPulse[i].xy;
    float r = length(q) + 1e-4, age = uPulse[i].z - z * .085;
    float x = (r - age * 1.75) / .17;
    float w = uPulse[i].w * exp(-x * x - uPulse[i].z * .55) * clamp(age * 8., 0., 1.);
    o += vec3(w, q * (-2. * x * w / (.17 * r)));
  }
  return o;
}
float pulses(vec2 p, float z) { return ringing(p, z).x; }
`;

/** The cut patterns. One record, one pattern. Local space: the sleeve is [-1, 1]. */
const records = /* glsl */ `
#define REC_N 26
vec2 waveAt(float i, float x) {
  float f = i / float(REC_N - 1);
  float c = .34 * sin(x * 1.25 + i * .155 + .4) * (1. - .25 * f) + .16 * sin(x * 2.6 - i * .11) * (1. - f) - .04 * f + .10 * x * f;
  float pinch = .16 + .84 * smoothstep(0., 1.25, abs(x - .52 + .30 * f));
  float g = mix(1.16, .055, pow(f, .62)) * mix(1., pinch, f) + .045 * sin(x * 4.2 + i * .9) * (1. - f);
  return vec2(c, g);
}
vec2 airAt(float i, float y) {
  float f = i / float(REC_N - 1);
  float t = uTime;
  float c = .34 + .22 * sin(y * 1.05 + i * .17 + t * .62) * (1. - .45 * f) + .07 * sin(y * 2.9 - i * .26 + t * 1.05) * (1. - f);
  float g = mix(2.35, .065, pow(f, .56)) * (1. + .15 * sin(y * 1.8 - i * .37 + t * .9)) + .045 * sin(y * 5.2 + i * 1.27 + t * 1.5) * (1. - f);
  return vec2(c, g);
}
vec2 recCenter(int kind, float i) {
  float f = i / float(REC_N - 1);
  if (kind == 0) return vec2(.06, .16);
  if (kind == 2) return vec2(.10 * f, -.04 * f) + .10 * f * vec2(cos(i * .4), sin(i * .4));
  if (kind == 3) return vec2(-.05 + .12 * f, .06 * f);
  if (kind == 4) return vec2(.30 * sin(i * .17 + .3) * f, -.10);
  if (kind == 5) return vec2(.34, 0.);
  return vec2(0.);
}
float rec0(float i, vec2 p) { // Low Sun: ridges under a sky of halos
  float f = i / float(REC_N - 1);
    vec2 s = vec2(.06, .16);
    vec2 n = nz(p * .09 + vec2(i * .031, -i * .017));
    float halo = length((p - s) * vec2(1., 1.03)) - mix(2.5, .37, pow(f, .56)) + n.x * mix(.26, 0., sqrt(f));
    float lift = mix(-1.12, -.17, pow(f, .78));
    vec2 r = nz(vec2(p.x * mix(.085, .16, f) + i * .137, i * .0713));
    vec2 r2 = nz(vec2(p.x * .33 + i * .31, i * .041 + .3));
    float ridge = lift + mix(.30, .13, f) * r.x + .05 * r2.y - .10 * (1. - f) * sin(p.x * 1.4 + i * .9);
    return max(halo, (ridge - p.y) * .86);
}
float air(float i, vec2 p) { // Curtains at an open window. They never hold still.
  vec2 c = airAt(i, p.y);
  return (abs(p.x - c.x) - c.y) * .84;
}
float rec(int kind, float i, vec2 p) {
  float f = i / float(REC_N - 1);
  if (kind == 0) return rec0(i, p);
  if (kind == 1) { // Undertow: one channel, narrowing
    vec2 w = waveAt(i, p.x);
    return (abs(p.y - w.x) - w.y) * .80;
  }
  if (kind == 2) { // Stairwell: square landings, turning
    vec2 q = rot(i * .112) * (p - recCenter(2, i));
    float s = mix(1.62, .10, pow(f, .60));
    return sdBox(q, vec2(s)) ;
  }
  if (kind == 3) { // Bloom Count: petals, each layer turned by the golden angle
    vec2 q = p - recCenter(3, i);
    float a = atan(q.y, q.x) + i * 2.39996 * .25;
    float R = mix(1.72, .13, pow(f, .62));
    float petal = abs(cos(a * 4.));
    return (length(q) - R * (.80 + .30 * sqrt(petal + .02))) * .78;
  }
  if (kind == 4) { // Arcade: arches down a bending corridor
    vec2 q = p - recCenter(4, i);
    float w = mix(1.50, .20, pow(f, .55));
    float spring = mix(.30, .02, f);
    float top = q.y > spring ? length(q - vec2(0., spring)) - w : abs(q.x) - w;
    float floorY = mix(-1.25, -.26, pow(f, .70));
    return max(top, floorY - p.y);
  }
  return air(i, p);
}
float recDist(int kind, float i, vec2 p) {
  if (kind == 1) { vec2 w = waveAt(i, p.x); return length(vec2((p.x - .50) * .72, abs(p.y - w.x))); }
  if (kind == 5) { vec2 w = airAt(i, p.y); return length(vec2((p.x - w.x) * 1.3, p.y * .40)); }
  return length(p - recCenter(kind, i));
}
`;

/** How far each board of the cover stands back from the letters. */
const steps = /* glsl */ `
float stepAt(int k) { return k == 0 ? .600 : k == 1 ? .430 : k == 2 ? .310 : k == 3 ? .220 : k == 4 ? .150 : k == 5 ? .052 : 0.; }
`;

const oneLight = /* glsl */ `
vec3 lightRamp(float m, float x) {
  vec3 a = rampOf(uRampA[0], uRampA[1], uRampA[2], uRampA[3], x);
  if (m <= .001) return a;
  return mix(a, rampOf(uRampB[0], uRampB[1], uRampB[2], uRampB[3], x), m);
}
`;

/** The same patterns, already cut: one array layer per sheet. Air is never baked, it moves. */
const baked = /* glsl */ `
uniform highp sampler2DArray uRecs;
float recLookup(int kind, float i, vec2 p) {
  if (kind == 5) return air(i, p);
  float ext = mix(2.8, 1.9, i / float(REC_N - 1));
  return textureLod(uRecs, vec3(p / ext * .5 + .5, float(kind * REC_N) + i), 0.).r;
}
`;

/** Writes one sheet of one record into the array. */
export const cutter = /* glsl */ `
${head}
${records}
uniform int uKind;
uniform float uSheet;
void main() {
  float ext = mix(2.8, 1.9, uSheet / float(REC_N - 1));
  outColor = vec4(rec(uKind, uSheet, (vUv * 2. - 1.) * ext), 0., 0., 1.);
}
`;

/** The march itself. A program supplies COUNT, zAt, sheetAt, distAt, mixAt, floorAt. */
const march = /* glsl */ `
vec3 shade(int k, vec2 p, float z, float d) {
  vec2 ls = uL.xy / -uL.z;
  float sh = 0., ao = 1.;
  for (int j = 1; j <= uSteps; j++) {
    if (k - j < 0) break;
    float dz = z - zAt(k - j);
    float fj = float(j);
    float s = .006 + .085 * dz;
    float dd = liteAt(k - j, p + ls * dz);
    sh = max(sh, smoothstep(-s, s, dd) * (1. - .045 * fj));
    float dv = liteAt(k - j, p);
    ao *= 1. - .34 * exp(min(dv, 0.) / (.05 + .05 * fj)) / pow(fj, .8);
  }
  sh *= uShadow;
#ifdef PANELS
  sh = max(sh, panelShadow(p, z, k));
#endif
  float m = mixAt(k);
  float dist = distAt(k, p);
  vec2 fp = p * .83 + float(k) * .17;
  vec4 fibre = .5 * (textureLod(uNoise, fp, 0.) + textureLod(uNoise, rot(.71) * fp * 1.63 + .37, 0.));
  float und = textureLod(uNoise, p * .14 + float(k) * .231, 2.).r;
  vec3 alb = vec3(.955, .957, .962) * (.968 + .105 * (fibre.b - .5) + .03 * (fibre.a - .5));

  float day = uDay * exp(-max(z - uDayZ, 0.) * uDayK);
  vec3 c = alb * day * mix(vec3(1.), vec3(.62, .66, 1.02), uDusk) * (uSky * ao + uKey * (1. - sh) * (1. + .15 * und) * (uGobo > .0 ? gobo(p, z) : 1.));

  float depth = exp(-max(uLz - z, 0.) * uLk);
  float lat = exp(-max(dist - uLr, 0.) * uLa);
  float near = exp(-max(d, 0.) / .10);
  float E = depth * lat * (.68 + .80 * near) * mix(.50, 1., ao) * (1. - .22 * sh);
#ifdef SPILL
  E += spill(k, p, z);
#endif
#ifdef WORDS
  if (k >= NF) {
    int ti = textAt(k);
    if (ti >= 0) {
      int e = echoAt(k, ti);
      if (e == 0) return alb * vec3(1.02, .985, .955);
      return lightRamp(0., mix(.66, .20, float(e) / float(WN - 1))) * (1.05 - .18 * float(e)) * (.35 + .65 * ao);
    }
  }
#endif
#ifdef LEAK
  E += leak(k, p) * mix(.45, 1., ao) * (1. - .25 * sh);
#endif
  E += uFill * fillAt(k) * mix(.4, 1., ao) * (1. - .35 * sh);
  vec3 ramp = lightRamp(m, E);
  c += alb * ramp * uGlow * smoothstep(0., .26, E) * (1. + .55 * E);

  // A call carries a little of the record's light along with it.
  if (uPulseN > 0) {
    vec3 pg = ringing(p, z);
    float pw = pg.x;
    float emboss = -.07 * dot(pg.yz, normalize(uL.xy));
    c *= 1. + clamp(emboss * 1.5, -.5, .7);
    c += lightRamp(m, .80) * max(pw, 0.) * (.05 + .22 * near) * max(uGlow, .25);
  }
  float edge = smoothstep(.012, .002, d) * smoothstep(-.003, .001, d);
  c += edge * (vec3(.14) * day + lightRamp(m, min(1., E * 1.35 + .1)) * E * .75 * uGlow);
  return c;
}

vec3 tone(vec3 x) {
  x *= 1.04;
  x = x * (1. + x * .05) / (1. + x * .205);
  // Light this strong starts to bleach.
  float l = max(max(x.r, x.g), x.b);
  x = mix(x, vec3(l), smoothstep(.92, 1.6, l) * .35);
  return pow(clamp(x, 0., 1.), vec3(1. / 2.2));
}

vec3 paper(vec3 ro, vec3 rd, float px) {
#ifdef CELLS
  pick(ro.z < -.001 ? cellOf(ro.xy + rd.xy * (-ro.z / rd.z)) : uHome);
#endif
  vec3 col = vec3(0.);
  float acc = 0.;
  for (int k = uK0; k < COUNT; k++) {
    float z = zAt(k);
    float t = (z - ro.z) / rd.z;
    if (t < .03) continue;
    vec2 p = ro.xy + rd.xy * t;
    float d = sheetAt(k, p);
    float w = max(px * t * .75, abs(t - uFocus) * uAp);
    float a = smoothstep(-w, w, d);
#ifdef THICK
    // The cut side of a heavy board: open at the face, paper at the back.
    float th = thickAt(k);
    if (th > 0. && a < .99) {
      vec2 pb = p + rd.xy * th;
      float db = boardAt(k, pb);
      float b = smoothstep(-w, w, db) * (1. - a);
      if (b > .01) {
        float m = mixAt(k);
        float E = exp(-max(uLz - z, 0.) * uLk) * exp(-max(distAt(k, pb) - uLr, 0.) * uLa) + uSide;
        float day = uDay * exp(-max(z - uDayZ, 0.) * uDayK);
        float lit = .5 + .5 * smoothstep(-.4, .4, dot(normalize(-rd.xy + 1e-5), normalize(uL.xy)));
        vec3 sc = vec3(.97) * day * (uSky * .75 + uKey * .78 * lit) + lightRamp(m, E * 1.2) * uGlow * (E * 1.4);
        col += (1. - acc) * b * sc;
        acc += (1. - acc) * b;
      }
    }
#endif
    if (a < .004) continue;
    vec3 c = shade(k, p, z, d);
    float cover = a;
    float veil = veilAt(k, t);
    cover *= veil;
    col += (1. - acc) * cover * c;
    acc += (1. - acc) * cover;
    if (acc > .992) break;
  }
  if (acc < .992) {
    float t = (zAt(COUNT) - ro.z) / rd.z;
    col += (1. - acc) * floorAt(ro.xy + rd.xy * t);
  }
  return col;
}

void main() {
  vec2 ndc = (vUv * 2. - 1.) * vec2(uRes.x / uRes.y, 1.) * uTan;
  vec3 rd = uCam * vec3(ndc + uShift, 1.);
  vec3 ro = uRo;
  float px = uTan * 2. / uRes.y;
  vec4 over = vec4(0.);
#ifdef PANELS
  over = panels(ro, rd, px);
#endif
  vec3 c = vec3(0.);
  if (over.a < .996) c = tone(finish(paper(ro, rd, px), ro, rd, px));
  c = over.rgb + (1. - over.a) * c;
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5;
  c += g * .013 * uGrain;
  outColor = vec4(mix(c, vec3(.937, .941, .949), uFade), 1.);
}
`;

const plain = /* glsl */ `
float fillAt(int k) { return k == 0 ? 0. : 1.; }
float veilAt(int k, float t) { return 1.; }
vec3 finish(vec3 c, vec3 ro, vec3 rd, float px) { return c; }
`;

/** Cover, canyon and the valley at the end of it. */
export const descent = /* glsl */ `
${head}
${records}
${oneLight}
uniform sampler2D uSdf;
uniform float uBend, uRim, uLines, uLineFloor;
uniform vec2 uLetter[4];       // middle of each letter
uniform vec3 uInk;
uniform vec4 uOpen;            // how far each letter has been cut open
uniform float uO;              // the O keeps opening as you reach it
uniform sampler2D uText[3];
uniform vec4 uTextBox[3];      // z, half width, half height, weight
uniform vec2 uSource;          // centre of the O

#define THICK
#define LEAK
#define WORDS
#define NF 7
#define NC 84
#define NV REC_N
#define WN 4
#define COUNT (NF + NC + NV + 3 * WN)
#define Z_C .80
#define H_C .150
#define Z_V (Z_C + float(NC) * H_C + .25)
#define H_V .12
#define SHADOW_STEPS Q_SHADOW
${steps}
// The sheets with words on them sit between rings; the index skips over them.
int textAt(int k) {
  for (int i = 0; i < 3; i++) if (k >= NF + int(uTextBox[i].x) + i * WN && k < NF + int(uTextBox[i].x) + i * WN + WN) return i;
  return -1;
}
int echoAt(int k, int ti) { return k - (NF + int(uTextBox[ti].x) + ti * WN); }
int ringAt(int k) {
  int r = k - NF;
  int off = 0;
  for (int i = 0; i < 3; i++) off += clamp(k - (NF + int(uTextBox[i].x) + i * WN) , 0, WN);
  return r - off;
}
float zAt(int k) {
  if (k < NF) return float(k) * .105;
  int ti = textAt(k);
  if (ti >= 0) return Z_C + (uTextBox[ti].x - .85 + .25 * float(echoAt(k, ti))) * H_C;
  int r = ringAt(k);
  if (r < NC) return Z_C + float(r) * H_C;
  return Z_V + float(r - NC) * H_V;
}
vec2 ctr(float z) {
  float u = z - Z_C;
  return uSource + mix(vec2(.30 * sin(u * .30), -.20 * sin(u * .37)) * smoothstep(1., 7., u), vec2(1.15 * sin(u * .47), .55 * sin(u * .62 + .4) - .21) * smoothstep(.2, 3.2, u) * (1. - smoothstep(9.4, 12.4, u)), uBend);
}
vec2 valleyAt() { return ctr(Z_V) + vec2(-.02, -.06); }

float plainFront(int k, vec2 p) {
    float i = float(k);
    float u = i / float(NF - 1);
    vec2 n2 = nz(p * .10 + vec2(i * .011, -i * .007));
    float n = n2.x + .4 * n2.y;
    vec4 s = textureLod(uSdf, p / uSdfE * .5 + .5, 0.);
    // rgba: distance to each letter. Every letter is cut on its own time.
    vec4 q = s - (uOpen - 1.) * 1.0;
    float e = min(min(q.x, q.y), min(q.z, q.w - uO));
    float T = stepAt(k) * smoothstep(.55, 1.15, (uOpen.x + uOpen.y + uOpen.z + uOpen.w) * .25 + .15);
    return e - T + n * mix(.085, 0., pow(u, .6));
}
float frontAt(int k, vec2 p) {
  float b = plainFront(k, p);
  if (uPulseN > 0) b -= pulses(p, zAt(k)) * mix(.20, .11, float(k) / float(NF - 1));
  if (uCutW > .001) b = min(b, cutSd(p) + .0085 * float(k));
  return b;
}
float ringSd(float i, vec2 p) {
  float z = Z_C + i * H_C;
  vec2 q = p - ctr(z);
  vec2 n2 = nz(p * .13 + vec2(i * .013, -i * .009));
  float u = z - Z_C;
  float R = 1.00 + 4.5 * exp(-u * .60) + .09 * sin(u * 1.1) * smoothstep(1., 4., u) + .62 * smoothstep(9.6, 12.4, u);
  return length(q * vec2(1., 1.03)) - R + (n2.x + .4 * n2.y) * mix(.34, .13, smoothstep(0., 3., u));
}
float sheetAt(int k, vec2 p) {
  if (k < NF) return frontAt(k, p);
  int ti = textAt(k);
  if (ti >= 0) {
    float z = zAt(k);
    vec2 q = (p - ctr(z)) / uTextBox[ti].yz;
    if (abs(q.x) > 1. || abs(q.y) > 1.) return -.2;
    vec2 uv = q * .5 + .5;
    float s = ti == 0 ? textureLod(uText[0], uv, 0.).r : ti == 1 ? textureLod(uText[1], uv, 0.).r : textureLod(uText[2], uv, 0.).r;
    float blade = (mix(-1.35, 1.35, clamp(uTextBox[ti].w, 0., 1.)) - (q.x + .24 * q.y)) * uTextBox[ti].y;
    if (uTextBox[ti].w > 1.) blade = min(blade, (q.x + .24 * q.y - mix(-1.35, 1.35, uTextBox[ti].w - 1.)) * uTextBox[ti].y);
    return min(s * uTextBox[ti].y * 2. - .0035 * float(echoAt(k, ti)), blade);
  }
  int r = ringAt(k);
  if (r < NC) {
    float d = ringSd(float(r), p);
    return uPulseN > 0 ? d - pulses(p, Z_C + float(r) * H_C) * .30 : d;
  }
  return rec0(float(r - NC), p - valleyAt());
}
float distAt(int k, vec2 p) {
  float z = zAt(k);
  if (k >= NF) {
    int r = ringAt(k);
    if (r >= NC) return length(p - valleyAt() - recCenter(0, 0.));
  }
  return length(p - ctr(z)) * .86 ;
}
float liteAt(int k, vec2 p) {
  if (k < NF) return plainFront(k, p);
  if (textAt(k) >= 0) return -.2;
  int r = ringAt(k);
  if (r < NC) return ringSd(float(r), p);
  return rec0(float(r - NC), p - valleyAt());
}
float boardAt(int k, vec2 p) { return k < NF ? frontAt(k, p) : -1.; }
float leak(int k, vec2 p) {
  if (k > NF + 8) return 0.;
  float l = 0.;
  if (uCutW > .001) {
    float d = max(cutSd(p), 0.);
    l = k == 0 ? .05 * exp(-d / .035) : k < NF ? (.26 + .11 * float(k)) * exp(-d / .075) : 1.05 * exp(-d / .22);
  }
  // After dark the letters are the lamp, and the steps around them are what it lights.
  if (uRim > .001 && k < NF) {
    vec4 s = textureLod(uSdf, p / uSdfE * .5 + .5, 0.);
    float near = 0.;
    for (int c = 0; c < 4; c++) {
      float o = smoothstep(.55, 1., uOpen[c]);
      float reach = c == 3 ? .34 : .20 + .045 * float(c);
      near = max(near, o * (c == 3 ? 1. : .52 + .14 * float(c)) * exp(-max(s[c], 0.) / reach));
    }
    l += uRim * near * (.22 + .78 * float(k) / float(NF - 1));
  }
  return l;
}
float mixAt(int k) { return 0.; }
float thickAt(int k) { return k < NF ? (k == NF - 1 ? .05 : .03) : 0.; }
vec3 floorAt(vec2 p) {
  float s = length(p - valleyAt() - recCenter(0, 0.));
  return lightRamp(0., .80 + .4 * smoothstep(.40, .06, s)) * (1.05 + .5 * smoothstep(.5, 0., s)) * uGlow;
}
float veilAt(int k, float t) {
  if (k >= NF && textAt(k) >= 0) return smoothstep(.42, .60, t);
  return 1.;
}
float fillAt(int k) { return k < NF ? 0. : 1.; }
// The cutting pattern: every contour drawn where its board will be cut.
vec3 finish(vec3 c, vec3 ro, vec3 rd, float px) {
  if (uLines <= 0.) return c;
  float ink = 0.;
  for (int k = 0; k < NF; k++) {
    float t = (zAt(k) - ro.z) / rd.z;
    vec2 p = ro.xy + rd.xy * t;
    float w = px * t * .62;
    vec4 s = textureLod(uSdf, p / uSdfE * .5 + .5, 0.);
    float floor_ = smoothstep(uLineFloor, uLineFloor + .30, p.y);
    if (k == NF - 1) {
      // The letters first, one after another.
      for (int l = 0; l < 4; l++) {
        vec2 r = p - uLetter[l];
        float turn = fract(atan(r.y, r.x) / TAU + .3);
        float here = step(turn, (uLines - .03 - float(l) * .12) / .26);
        ink = max(ink, (1. - smoothstep(w * 1.15, w * 2.7, abs(s[l]))) * here);
      }
    } else {
      float u = float(k) / float(NF - 1);
      vec2 n2 = nz(p * .10 + vec2(float(k) * .011, -float(k) * .007));
      float d = min(min(s.x, s.y), min(s.z, s.w)) - stepAt(k) + (n2.x + .4 * n2.y) * mix(.085, 0., pow(u, .6));
      float turn = fract(atan(p.y - uSource.y, p.x - .2) / TAU + .55 + float(k) * .13);
      float here = step(turn, (uLines - .34 - float(NF - 2 - k) * .085) / .24);
      ink = max(ink, (1. - smoothstep(w * .62, w * 1.5, abs(d))) * here * .8 * floor_);
    }
  }
  float shut = 1. - smoothstep(.35, .9, (uOpen.x + uOpen.y + uOpen.z + uOpen.w) * .25);
  return mix(c, uInk, ink * .92 * shut);
}
${march}
`;

/** Real captures of the app, each standing at its own depth in front of the paper. */
const panelChunk = /* glsl */ `
#define PANELS
#define PN 4
uniform sampler2D uPT[PN];
uniform vec4 uPR[PN];      // centre, half size
uniform vec4 uPP[PN];      // z, corner radius, opacity, texture detail bias
uniform sampler2D uPTB[PN];  // the capture each panel is turning into
uniform float uPMix;
uniform vec2 uPOff;          // the first panel can be moved, and its holes go with it
uniform vec4 uSlit;          // where the blade goes: a point, a slope, how far the halves have parted
uniform float uBlade;        // how far down it has gone
uniform sampler2D uWord[2];  // one line that floats, one that is cut
uniform vec4 uWordBox[2];    // centre, half size
uniform vec3 uWordOn;        // how much of each is there; how far the first one floats
uniform vec4 uHole;        // centre, half size: where the sleeve is
uniform float uHoleOn, uPanelI, uPanelSh;
float holeSd(vec2 p);
float panelHole(vec2 p);
float wordSd(int i, vec2 p) {
  vec2 q = (p - uWordBox[i].xy) / uWordBox[i].zw;
  if (abs(q.x) > 1. || abs(q.y) > 1.) return -.3;
  float s = (i == 0 ? textureLod(uWord[0], q * .5 + .5, 0.).r : textureLod(uWord[1], q * .5 + .5, 0.).r) * uWordBox[i].z * 2.;
  float on = i == 0 ? uWordOn.x : uWordOn.y;
  return min(s, (mix(-1.35, 1.35, on) - (q.x + .24 * q.y)) * uWordBox[i].z);
}
float slitX(float y) { return uSlit.x + uSlit.z * (y - uSlit.y); }
float panelShadow(vec2 p, float z, int k) {
  vec2 ls = uL.xy / -uL.z;
  float s = 0.;
  for (int i = 0; i < PN; i++) {
    if (uPP[i].z < .01) continue;
    if (i == 0 && k > 0) continue;
    float dz = z - uPP[i].x;
    if (dz < .0) continue;
    float w = .012 + .22 * dz;
    s = max(s, smoothstep(w, -w, sdRound(p + ls * dz * .8 - uPR[i].xy, uPR[i].zw, uPP[i].y)) * uPP[i].z * .78 * (uSlit.w > 0. && i != 3 ? 0. : 1.));
  }
  if (uWordOn.x > 0. && z > -uWordOn.z) {
    float dz = z + uWordOn.z;
    float w = .010 + .11 * dz;
    s = max(s, smoothstep(-w, w, wordSd(0, p + ls * dz * .55)) * .62);
  }
  return s * uPanelSh;
}
vec4 panelTex(int i, vec2 uv, vec2 uvb, float lod, float m) {
  vec4 a, b;
  if (i == 0) { a = textureLod(uPT[0], uv, lod); b = m > 0. ? textureLod(uPTB[0], uvb, lod) : a; }
  else if (i == 1) { a = textureLod(uPT[1], uv, lod); b = m > 0. ? textureLod(uPTB[1], uv, lod) : a; }
  else if (i == 2) { a = textureLod(uPT[2], uv, lod); b = m > 0. ? textureLod(uPTB[2], uv, lod) : a; }
  else { a = textureLod(uPT[3], uv, lod); b = m > 0. ? textureLod(uPTB[3], uv, lod) : a; }
  return mix(a, b, m);
}
vec4 panelAt(int i, vec3 ro, vec3 rd, float px) {
  if (uPP[i].z < .004) return vec4(0.);
  float t = (uPP[i].x - ro.z) / rd.z;
  if (t < .03) return vec4(0.);
  vec2 p = ro.xy + rd.xy * t;
  float w = max(px * t * .75, abs(t - uFocus) * uAp);
  float a = 1.;
  if (uSlit.w > 0. && i != 3) {
    // Cut through: the halves part.
    vec2 pl = p + vec2(uSlit.w, 0.), pr = p - vec2(uSlit.w, 0.);
    float l = slitX(pl.y) - pl.x, r = pr.x - slitX(pr.y);
    p = l > r ? pl : pr;
    a = smoothstep(-w, w, max(l, r));
  }
  vec2 q = p - uPR[i].xy;
  float d = sdRound(q, uPR[i].zw, uPP[i].y);
  a *= 1. - smoothstep(-w, w, d);
  if (i == 0 && uHoleOn > .5) a *= smoothstep(-w, w, panelHole(p - uPOff));
  if (a < .004) return vec4(0.);
  vec2 uv = (q / uPR[i].zw * .5 + .5);
  float texel = px * t / (uPR[i].z * 2.) * uPP[i].w;
  float lod = max(0., log2(max(texel, w / (uPR[i].z * 2.) * uPP[i].w * .6)) - .35);
  // New light leaves the sleeve and crosses the interface.
  float m = uPMix <= 0. ? 0. : smoothstep(0., 1., uPMix * 2.4 - length(p - uHole.xy) / 3.2);
  vec4 c = panelTex(i, uv, uv, lod, m);
  if (i == 0) c = vec4(c.rgb, 1.);
  // A thin light along the upper edge, as every instrument in Atmosphere has.
  float e = smoothstep(w * 2.5, 0., abs(d + w)) * smoothstep(-.2, 1., q.y / uPR[i].w);
  if (uPP[i].y > 0.) c.rgb += e * .10 * c.a;
  if (uBlade > 0. && uSlit.w <= 0. && i != 3) {
    float line = 1. - smoothstep(w * 1.1, w * 2.6, abs(p.x - slitX(p.y)));
    c.rgb = mix(c.rgb, vec3(.98) * c.a, line * step(mix(uPR[0].y + uPR[0].w, uPR[0].y - uPR[0].w, uBlade), p.y));
  }
  // What floats above the window throws its shadow on it.
  if (i < 2 && uSlit.w <= 0.) {
    vec2 ls = uL.xy / -uL.z;
    float dz = uPP[i].x - uPP[2].x;
    if (dz > .05) {
      float sw = .02 + .20 * dz;
      c.rgb *= 1. - .55 * uPP[2].z * smoothstep(sw, -sw, sdRound(p + ls * dz * .55 - uPR[2].xy, uPR[2].zw, uPP[2].y));
    }
    if (uWordOn.x > 0.) {
      float wz = uPP[i].x + uWordOn.z;
      if (wz > 0.) c.rgb *= 1. - .5 * smoothstep(-.02 - .1 * wz, .02 + .1 * wz, wordSd(0, p + ls * wz * .55));
    }
  }
  // Captures arrive with their alpha already multiplied in.
  return vec4(c.rgb * uPanelI, c.a) * (a * uPP[i].z);
}
vec4 panels(vec3 ro, vec3 rd, float px) {
  vec4 o = vec4(0.);
  for (int n = PN - 1; n >= 0; n--) {
    if (n == 3 && uBlade > 0.) continue; // still behind the window it will be seen through
    vec4 c = panelAt(n, ro, rd, px);
    o += (1. - o.a) * c;
    if (n == 2 && uWordOn.x > 0.) {
      float t = (-uWordOn.z - ro.z) / rd.z;
      vec2 p = ro.xy + rd.xy * t;
      float w = max(px * t * .75, .0005);
      float a = smoothstep(-w, w, wordSd(0, p)) * step(.03, t);
      float lit = smoothstep(w * 3., 0., abs(wordSd(0, p) - w)) * .10;
      o += (1. - o.a) * vec4(vec3(.066, .070, .150) + lit, 1.) * a;
    }
    if (o.a > .996) break;
  }
  if (uBlade > 0.) o += (1. - o.a) * panelAt(3, ro, rd, px);
  return o;
}
`;

/** One sleeve in a wall, looked into. Two cut patterns, one becoming the other. */
export const record = /* glsl */ `
${head}
${records}
${baked}
${oneLight}
${panelChunk}
uniform float uScale;        // half size of the sleeve in world units
uniform float uWall;         // presence of the wall the sleeve is cut from
uniform vec3 uSpillC;
uniform float uFlip, uSpin;
#define THICK
#define SPILL
#define LEAK
#define COUNT (REC_N + 1)
#define H_V .12
#define SHADOW_STEPS Q_SHADOW
float zAt(int k) { return k == 0 ? 0. : .10 + float(k - 1) * H_V * uScale; }
float mixAt(int k) {
  // The change arrives from the light outward: deep sheets are recut first.
  float f = float(k) / float(COUNT);
  return smoothstep(0., 1., uMorph * 1.9 - (1. - f) * .9);
}
float holeSd(vec2 p) { return sdBox(p - uHole.xy, uHole.zw); }
float panelHole(vec2 p) { return holeSd(p); }
float sheetAt(int k, vec2 p) {
  if (k == 0) {
    if (uWall < .5) return -1.;
    float d = sdBox(p - uHole.xy, uHole.zw * 1.1);
    if (uCutW > .001) d = min(d, cutSd(p));
    if (uWordOn.y > 0.) d = min(d, -wordSd(1, p));
    return d;
  }
  float i = float(k - 1);
  vec2 q = rot(uSpin) * ((p - uHole.xy) / uScale * vec2(uFlip, 1.));
  float m = mixAt(k);
  float d;
  if (m < .002) d = recLookup(uKindA, i, q);
  else if (m > .998) d = recLookup(uKindB, i, q);
  else d = mix(recLookup(uKindA, i, q), recLookup(uKindB, i, q), m);
  float pu = uPulseN > 0 ? pulses(p, zAt(k) * 2.) * .17 / uScale : 0.;
  return (d - pu) * uScale;
}
float liteAt(int k, vec2 p) {
  if (k == 0) return uWall < .5 ? -1. : min(sdBox(p - uHole.xy, uHole.zw * 1.1), min(uCutW > .001 ? cutSd(p) : 1., uWordOn.y > 0. ? -wordSd(1, p) : 1.));
  float i = float(k - 1);
  vec2 q = rot(uSpin) * ((p - uHole.xy) / uScale * vec2(uFlip, 1.));
  return mix(recLookup(uKindA, i, q), recLookup(uKindB, i, q), mixAt(k)) * uScale;
}
float distAt(int k, vec2 p) {
  float i = float(max(k - 1, 0));
  vec2 q = rot(uSpin) * ((p - uHole.xy) / uScale * vec2(uFlip, 1.));
  float m = mixAt(k);
  return mix(recDist(uKindA, i, q), recDist(uKindB, i, q), m);
}
float spill(int k, vec2 p, float z) {
  if (k > 0) return 0.;
  float d = sdBox(p - uPR[0].xy, uPR[0].zw);
  return uPP[0].z * (.062 * exp(-max(d, 0.) * 2.4) + .052 * exp(-max(d, 0.) * .7)) * uSpillC.x;
}
float boardAt(int k, vec2 p) { return sheetAt(0, p); }
float leak(int k, vec2 p) {
  float l = 0.;
  if (uCutW > .001) { float d = max(cutSd(p), 0.); l = k == 0 ? .05 * exp(-d / .05) : .72 * exp(-d / .30); }
  if (uWordOn.y > 0.) { float d = max(-wordSd(1, p), 0.); l += k == 0 ? .05 * exp(-d / .05) : .60 * exp(-d / .16); }
  return l;
}
float thickAt(int k) { return k == 0 ? .095 : 0.; }
vec3 floorAt(vec2 p) {
  vec2 q = rot(uSpin) * ((p - uHole.xy) / uScale * vec2(uFlip, 1.));
  float m = mixAt(COUNT);
  float s = mix(recDist(uKindA, float(REC_N), q), recDist(uKindB, float(REC_N), q), m);
  return lightRamp(m, clamp(1.22 - .95 * s, .42, 1.22)) * (1.55 - .42 * min(s, 2.)) * uGlow;
}
${plain}
${march}
`;

/** The library: a wall of sleeves, every one a window. */
export const library = /* glsl */ `
${head}
${records}
${baked}
${panelChunk}
uniform vec4 uGrid;          // centre of cell 0,0 and pitch
uniform float uCell;         // half size of one sleeve
uniform vec2 uCells;         // columns and rows that belong to the app's page
uniform vec2 uHome;          // the cell we came out of
uniform int uHomeKind, uHomeRamp;
uniform float uHomeLit, uCloseUp;
uniform vec3 uRamps[44];     // eleven records, four stops each
uniform float uOthers;       // light in the windows we did not come from
uniform float uShut;         // sleeves beyond the page can be closed
uniform float uOver;         // the page laid over them hides their edges
uniform vec3 uFlare;         // a sleeve that has been pressed
#define THICK
#define LEAK
#define CELLS
#define COUNT (REC_N + 1)
#define SHADOW_STEPS Q_SHADOW
vec2 gCell; int gKind; int gRamp; float gFlip; float gLit;
float hash(vec2 c) { return fract(sin(dot(c, vec2(41.3, 289.1))) * 4758.5453); }
vec2 cellOf(vec2 p) { return floor((p - uGrid.xy) / uGrid.zw + .5); }
vec2 centreOf(vec2 c) { return uGrid.xy + c * uGrid.zw; }
bool onPage(vec2 c) { return c.x > -.5 && c.x < uCells.x - .5 && c.y < .5 && c.y > -uCells.y + .5; }
bool onWall(vec2 c) { return c.x > -.5 && c.x < uCells.x - .5 && c.y < .5 && c.y > -40. / uCells.x + .5; }
float holeSd(vec2 p) {
  vec2 c = cellOf(p);
  if (!onWall(c)) return .5;
  return sdBox(p - centreOf(c), vec2(uCell * (onPage(c) ? 1. + .05 * uOver : uShut)));
}
float panelHole(vec2 p) {
  vec2 c = cellOf(p);
  return onPage(c) ? sdBox(p - centreOf(c), vec2(uCell)) : 1.;
}
void pick(vec2 c) {
  gCell = c;
  float h = hash(c);
  int n = int(h * 9.999);
  if (onWall(c)) n = int(c.x - c.y * uCells.x + .5) % 10;
  gKind = n % 5; gRamp = n; gFlip = n > 4 ? -1. : 1.;
  gLit = uOthers;
  if (abs(c.x - uHome.x) + abs(c.y - uHome.y) < .1) { gLit = uHomeLit; gKind = uHomeKind; gRamp = uHomeRamp; gFlip = 1.; }
  if (abs(c.x - uFlare.x) + abs(c.y - uFlare.y) < .1) gLit *= 1. + uFlare.z;
}
float zAt(int k) { return k == 0 ? 0. : .10 * uCell + float(k - 1) * .12 * uCell; }
float mixAt(int k) { return 0.; }
float sheetAt(int k, vec2 p) {
  if (k == 0) return uCutW > .001 ? min(holeSd(p) - .004 * uCell, cutSd(p)) : holeSd(p) - .004 * uCell;
  return recLookup(gKind, float(k - 1), (p - centreOf(gCell)) / uCell * vec2(gFlip, 1.)) * uCell;
}
float liteAt(int k, vec2 p) {
  if (k == 0) return uCutW > .001 ? min(sdBox(p - centreOf(gCell), vec2(uCell)), cutSd(p)) : sdBox(p - centreOf(gCell), vec2(uCell));
  return recLookup(gKind, float(k - 1), (p - centreOf(gCell)) / uCell * vec2(gFlip, 1.)) * uCell;
}
float distAt(int k, vec2 p) { return recDist(gKind, float(max(k - 1, 0)), (p - centreOf(gCell)) / uCell * vec2(gFlip, 1.)); }
float boardAt(int k, vec2 p) { return sheetAt(0, p); }
float leak(int k, vec2 p) { if (uCutW < .001) return 0.; float d = max(cutSd(p), 0.); return k == 0 ? .05 * exp(-d / .06) : .75 * exp(-d / .35); }
float thickAt(int k) { return k == 0 ? .08 * uCell : 0.; }
vec3 lightRamp(float m, float x) {
  int b = gRamp * 4;
  return rampOf(uRamps[b], uRamps[b + 1], uRamps[b + 2], uRamps[b + 3], x) * gLit;
}
vec3 floorAt(vec2 p) {
  float s = recDist(gKind, float(REC_N), (p - centreOf(gCell)) / uCell * vec2(gFlip, 1.));
  return lightRamp(0., .80 + .4 * smoothstep(.40, .06, s)) * (1.05 + .5 * smoothstep(.5, 0., s)) * uGlow;
}
${plain}
${march}
`;

/** One blank sheet, six more behind it, and a lamp behind those. */
export const blank = /* glsl */ `
${head}
${oneLight}
${panelChunk}
#define THICK
#define LEAK
#define NF 5
#define COUNT NF
#define SHADOW_STEPS Q_SHADOW
float zAt(int k) { return float(k) * .11; }
float mixAt(int k) { return 0.; }
float holeSd(vec2 p) { return 1.; }
float panelHole(vec2 p) { return 1.; }
float sheetAt(int k, vec2 p) {
  float pu = uPulseN > 0 ? pulses(p, zAt(k)) * .12 : 0.;
  return (uCutW > .001 ? min(1., cutSd(p) + .016 * float(k)) : 1.) - pu;
}
float liteAt(int k, vec2 p) { return uCutW > .001 ? min(1., cutSd(p) + .016 * float(k)) : 1.; }
float distAt(int k, vec2 p) { return 9.; }
float leak(int k, vec2 p) { if (uCutW < .001) return 0.; float d = max(cutSd(p), 0.); return k == 0 ? .05 * exp(-d / .06) : (.24 + .11 * float(k)) * exp(-d / .16); }
float boardAt(int k, vec2 p) { return sheetAt(k, p); }
float thickAt(int k) { return .03; }
vec3 floorAt(vec2 p) { return lightRamp(0., .86) * 1.25 * uGlow; }
float veilAt(int k, float t) { return 1.; }
float fillAt(int k) { return 0.; }
vec3 finish(vec3 c, vec3 ro, vec3 rd, float px) { return c; }
${march}
`;

/** Adds one stroke of the knife to everything already cut. */
export const knife = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uA, uB, uE;
uniform vec2 uW;
void main() {
  vec2 p = (vUv * 2. - 1.) * uE;
  vec2 ab = uB - uA, w = p - uA;
  float h = clamp(dot(w, ab) / max(dot(ab, ab), 1e-7), 0., 1.);
  outColor = vec4(length(w - ab * h) - mix(uW.x, uW.y, h), 0., 0., 1.);
}
`;

/** A loop that closes on itself falls out. */
export const punch = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uPoly[64];
uniform int uN;
uniform vec2 uE;
void main() {
  vec2 p = (vUv * 2. - 1.) * uE;
  float d = 1e9, s = 1.;
  for (int i = 0; i < uN; i++) {
    vec2 a = uPoly[i], b = uPoly[i + 1 == uN ? 0 : i + 1];
    vec2 e = b - a, w = p - a;
    vec2 q = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-7), 0., 1.);
    d = min(d, dot(q, q));
    bvec3 c = bvec3(p.y >= a.y, p.y < b.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  outColor = vec4(s * sqrt(d), 0., 0., 1.);
}
`;
