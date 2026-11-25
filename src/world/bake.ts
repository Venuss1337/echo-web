import * as THREE from 'three';
import { cutter } from './glsl';
import { field } from './field';

type P = [number, number];

/* The four letters, drawn as a knife would cut them: no edge quite parallel. */
const E: P[] = [
  [-0.42, 0.86], [0.4, 0.83], [0.375, 0.44], [0.02, 0.455], [0.015, 0.215], [0.31, 0.2],
  [0.295, -0.17], [0.015, -0.185], [0.02, -0.435], [0.42, -0.41], [0.4, -0.86], [-0.43, -0.83],
];
const H: P[] = [
  [-0.46, 0.84], [-0.04, 0.86], [-0.03, 0.24], [0.06, 0.23], [0.05, 0.86], [0.47, 0.83],
  [0.46, -0.86], [0.05, -0.83], [0.055, -0.21], [-0.035, -0.2], [-0.03, -0.85], [-0.45, -0.84],
];
const C: P[] = [];
{
  const n = 48;
  const a0 = 0.5;
  const a1 = Math.PI * 2 - 0.53;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    C.push([Math.cos(a) * 0.52, Math.sin(a) * 0.88]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + 0.05 + ((a1 - a0 - 0.1) * i) / n;
    C.push([0.07 + Math.cos(a) * 0.14, Math.sin(a) * 0.41]);
  }
}
/* On its side the word needs wider counters. */
const wideC: P[] = [];
{
  const n = 48;
  const a0 = 0.6;
  const a1 = Math.PI * 2 - 0.64;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    wideC.push([Math.cos(a) * 0.52, Math.sin(a) * 0.88]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + 0.02 + ((a1 - a0 - 0.04) * i) / n;
    wideC.push([0.03 + Math.cos(a) * 0.27, Math.sin(a) * 0.4]);
  }
}
const wideH: P[] = H.map(([x, y]) => [Math.abs(x) < 0.1 ? x * 1.5 : x, Math.abs(y) < 0.3 ? y * 0.82 : y]);
/* The O has no counter. It is where the light comes out, and where you go in. */
const O: P[] = Array.from({ length: 64 }, (_, i) => {
  const a = (i / 64) * Math.PI * 2;
  return [Math.cos(a) * 0.74, Math.sin(a) * 0.88];
});

export interface Layout {
  extent: THREE.Vector2;
  source: THREE.Vector2;
  place: [number, number, number, number][]; // x, y, scaleX, scaleY
  size: [number, number];
}

export const landscape: Layout = {
  extent: new THREE.Vector2(5.2, 3.25),
  source: new THREE.Vector2(1.74, 0.1),
  place: [
    [-1.66, 0.1, 0.97, 0.97],
    [-0.66, 0.1, 0.97, 0.97],
    [0.4, 0.1, 0.97, 0.97],
    [1.74, 0.1, 1.08, 1.08],
  ],
  size: [1600, 1000],
};

/* On a phone the word is a column, and the O is at the bottom, the way the thumb goes. */
export const portrait: Layout = {
  extent: new THREE.Vector2(2.6, 4.16),
  source: new THREE.Vector2(0.02, -1.34),
  place: [
    [-0.02, 1.36, 1.5, 0.47],
    [0, 0.5, 1.32, 0.47],
    [0, -0.36, 1.38, 0.47],
    [0.02, -1.34, 0.96, 0.58],
  ],
  size: [900, 1440],
};

/** The four letters as closed paths, where a layout puts them. */
export function outlines(layout: Layout): P[][] {
  const tall = layout === portrait;
  return [E, tall ? wideC : C, tall ? wideH : H, O].map((poly, n) => {
    const [x, y, sx, sy] = layout.place[n];
    return poly.map(([a, b]): P => [a * sx + x, b * sy + y]);
  });
}

const vs = /* glsl */ `out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

export class Baker {
  private mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  constructor(private r: THREE.WebGLRenderer) {
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  private run(rt: THREE.WebGLRenderTarget, fs: string, uniforms: Record<string, THREE.IUniform> = {}) {
    const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: fs, uniforms, depthTest: false });
    this.mesh.material = m;
    this.r.setRenderTarget(rt);
    this.r.render(this.scene, this.cam);
    this.r.setRenderTarget(null);
    m.dispose();
  }

  noise() {
    const rt = new THREE.WebGLRenderTarget(512, 512, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    this.run(rt, /* glsl */ `precision highp float; in vec2 vUv; out vec4 o;
      float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float vn(vec2 p,float per){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
        float a=h(mod(i,per)+.17),b=h(mod(i+vec2(1,0),per)+.17),c=h(mod(i+vec2(0,1),per)+.17),d=h(mod(i+1.,per)+.17);
        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
      float fbm(vec2 p,float per){float a=0.,w=.5;for(int i=0;i<4;i++){a+=w*vn(p*per,per);per*=2.;w*=.5;}return a;}
      void main(){
        float grain=fbm(vUv,64.);
        float fib=vn(vUv*vec2(256.,32.),512.)*.5+vn(vUv.yx*vec2(224.,32.)+7.,512.)*.5;
        o=vec4(fbm(vUv,4.)*2.-1., fbm(fract(vUv+.37),6.)*2.-1., grain, fib);
      }`);
    return rt;
  }

  /** Exact distance to each letter, one per channel. */
  letters(layout: Layout) {
    const verts: number[] = [];
    const ranges: THREE.Vector2[] = [];
    outlines(layout).forEach((pts) => {
      ranges.push(new THREE.Vector2(verts.length / 4, pts.length));
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        verts.push(p[0], p[1], q[0], q[1]);
      });
    });
    const tex = new THREE.DataTexture(new Float32Array(verts), verts.length / 4, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    const rt = new THREE.WebGLRenderTarget(layout.size[0], layout.size[1], {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.run(rt, /* glsl */ `precision highp float; in vec2 vUv; out vec4 o;
      uniform sampler2D uV; uniform vec2 uR[4]; uniform vec2 uE;
      float poly(vec2 p,int s,int n){
        float d=1e9,sg=1.;
        for(int i=0;i<n;i++){
          vec4 e=texelFetch(uV,ivec2(s+i,0),0); vec2 a=e.xy,b=e.zw,ab=b-a,w=p-a;
          vec2 q=w-ab*clamp(dot(w,ab)/dot(ab,ab),0.,1.); d=min(d,dot(q,q));
          bvec3 c=bvec3(p.y>=a.y,p.y<b.y,ab.x*w.y>ab.y*w.x); if(all(c)||all(not(c))) sg=-sg;
        }
        return sg*sqrt(d);
      }
      void main(){ vec2 p=(vUv*2.-1.)*uE;
        o=vec4(poly(p,int(uR[0].x),int(uR[0].y)),poly(p,int(uR[1].x),int(uR[1].y)),poly(p,int(uR[2].x),int(uR[2].y)),poly(p,int(uR[3].x),int(uR[3].y))); }`,
      { uV: { value: tex }, uR: { value: ranges }, uE: { value: layout.extent } });
    tex.dispose();
    return rt;
  }

  /** Five records, twenty-six sheets each, cut once and kept. */
  records(size: number) {
    const rt = new THREE.WebGLArrayRenderTarget(size, size, 5 * 26, {
      type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    const noise = this.noiseTexture!;
    const uniforms = { uKind: { value: 0 }, uSheet: { value: 0 }, uNoise: { value: noise }, uTime: { value: 0 } };
    const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: cutter, uniforms, depthTest: false });
    this.mesh.material = m;
    for (let k = 0; k < 5; k++)
      for (let i = 0; i < 26; i++) {
        uniforms.uKind.value = k;
        uniforms.uSheet.value = i;
        m.uniformsNeedUpdate = true;
        this.r.setRenderTarget(rt, k * 26 + i);
        this.r.render(this.scene, this.cam);
      }
    this.r.setRenderTarget(null);
    m.dispose();
    return rt;
  }

  noiseTexture: THREE.Texture | null = null;
  dispose() { this.mesh.geometry.dispose(); }
}

/** The arithmetic is done on another thread where there is one to be had. */
let hand: Worker | null | undefined;
async function measure(alpha: Uint8Array<ArrayBuffer>, w: number, h: number): Promise<Float32Array> {
  try {
    hand ??= new Worker(new URL('./field.worker.ts', import.meta.url), { type: 'module' });
    const { port1, port2 } = new MessageChannel();
    return await new Promise<Float32Array>((done, fail) => {
      hand!.addEventListener('error', fail, { once: true });
      port1.onmessage = (e) => done(e.data);
      hand!.postMessage({ alpha, w, h, to: port2 }, [port2]);
    });
  } catch {
    return field(alpha, w, h);
  }
}

/** Lines of type as a distance field, so they can be cut out of paper. */
export async function textField(lines: string[], font: string, weight: number, align: 'center' | 'left' = 'center', tracking = -0.02) {
  const w = 1024;
  const probe = document.createElement('canvas').getContext('2d')!;
  const size = 200;
  probe.font = `${weight} ${size}px ${font}`;
  (probe as any).letterSpacing = `${tracking * size}px`;
  const widest = Math.max(...lines.map((l) => probe.measureText(l).width));
  const px = (size * (w * 0.9)) / widest;
  const lead = px * 0.92;
  const h = Math.ceil(lead * lines.length + px * 0.32);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.font = `${weight} ${px}px ${font}`;
  (g as any).letterSpacing = `${tracking * px}px`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  lines.forEach((l, i) => g.fillText(l, align === 'left' ? w * 0.05 : w / 2, px * 0.92 + i * lead));
  const a = g.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = a[i * 4 + 3];
  const distance = await measure(alpha, w, h);
  const data = new Uint16Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data[(h - 1 - y) * w + x] = THREE.DataUtils.toHalfFloat(distance[y * w + x]);
  const t = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { texture: t, aspect: w / h };
}
