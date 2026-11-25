import * as THREE from 'three';
import * as glsl from './glsl';
import { Baker, landscape, portrait, textField, type Layout } from './bake';
import { ramps, type Ramp } from './records';

export type Program = 'descent' | 'record' | 'library' | 'blank';

export interface Panel {
  tex: THREE.Texture | null;
  next: THREE.Texture | null;
  x: number; y: number; w: number; h: number; // centre, half size
  z: number; r: number; o: number;
}

/** Everything a frame depends on. The timeline writes it, the world reads it. */
export const initial = {
  prog: 0, // 0 descent, 1 record, 2 library, 3 blank
  x: 0, y: 0, z: -2.75, yaw: 0, pitch: 0, roll: 0, fov: 40,
  sx: 0, sy: 0, focus: 3.3, ap: 0.006,
  day: 1, dayZ: 0.5, dayK: 0.42, shadow: 1,
  glow: 1, lz: 12, lk: 0.2, la: 0.85, lr: 0.2, fill: 0.1, gobo: 0, dusk: 0, side: 0, lineFloor: -9, cutW: 0, bend: 0, spin: 0, rim: 0, over: 0,
  open0: 1, open1: 1, open2: 1, open3: 1, o: 0,
  t0: 0, t1: 0, t2: 0,
  kindA: 0, kindB: 0, rampA: 0, rampB: 0, morph: 0,
  wall: 1, spill: 0, scale: 1, flip: 1,
  hx: 0, hy: 0, hw: 1, hh: 1, holeOn: 1, panelI: 1, panelSh: 1,
  others: 1, homeX: 0, homeY: 0, homeKind: 0, homeRamp: 0, homeLit: 1, pmix: 0, shut: 1,
  lines: 0, fade: 0, live: 0,
};
export type State = typeof initial;

const order: Program[] = ['descent', 'record', 'library', 'blank'];
const empty = () => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
};

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly state: State = { ...initial };
  readonly panels: Panel[] = Array.from({ length: 4 }, () => ({ tex: null, next: null, x: 0, y: 0, w: 1, h: 1, z: 0, r: 0, o: 0 }));
  readonly grid = { x: 0, y: 0, px: 1, py: 1, cell: 0.4, cols: 5, rows: 2 };
  layout: Layout;
  time = 0;
  lean = { x: 0, y: 0 };
  pulses: { x: number; y: number; age: number; power: number }[] = [];
  scale = 1;
  frames = 0;
  /** The first panel's displacement, the card that can be cut from it, and how far the blade has got. */
  sheet = { x: 0, y: 0 };
  /** Where a blade goes through the captures, how far down it is, and how far apart the halves are. */
  slit = { x: 0, y: 0, slope: 0.16, line: 0, apart: 0 };
  /** Two lines of type on the wall: one floats off it, one is cut into it. */
  saying = { floats: 0, cut: 0, lift: 1 };
  flare = { x: 99, y: 99, v: 0 };
  /** The part of the current sheet the knife can reach. */
  sheetMap = { x: 0, y: 0, s: 1 };
  strokes = 0;
  /** The record keeping time: 1 on a beat, falling away after it. */
  beat = 0;
  private cutRT!: THREE.WebGLRenderTarget;
  private knife!: THREE.ShaderMaterial;
  private puncher!: THREE.ShaderMaterial;
  private mats = {} as Record<Program, THREE.ShaderMaterial>;
  private mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private shared: Record<string, THREE.IUniform>;
  private targets: { dispose(): void }[] = [];
  private textTextures: THREE.Texture[] = [];
  private blankTex = empty();
  private w = 1;
  private h = 1;
  private steps: number;

  constructor(readonly canvas: HTMLCanvasElement, opts: { portrait: boolean; steps: number; context?: WebGL2RenderingContext; preserve?: boolean }) {
    this.renderer = new THREE.WebGLRenderer({ canvas, context: opts.context, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.steps = opts.steps;
    this.layout = opts.portrait ? portrait : landscape;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    const baker = new Baker(this.renderer);
    const noise = baker.noise();
    baker.noiseTexture = noise.texture;
    const sdf = baker.letters(this.layout);
    const recs = baker.records(opts.portrait ? 320 : 448);
    baker.dispose();
    this.targets.push(noise, sdf, recs);
    const v3 = (n: number) => Array.from({ length: n }, () => new THREE.Vector3());
    const v4 = (n: number) => Array.from({ length: n }, () => new THREE.Vector4());
    this.shared = {
      uRes: { value: new THREE.Vector2() }, uRo: { value: new THREE.Vector3() }, uCam: { value: new THREE.Matrix3() },
      uTan: { value: 1 }, uShift: { value: new THREE.Vector2() }, uFocus: { value: 1 }, uAp: { value: 0 }, uTime: { value: 0 }, uGrain: { value: 1 }, uFade: { value: 0 },
      uK0: { value: 0 }, uSteps: { value: opts.steps }, uNoise: { value: noise.texture },
      uL: { value: new THREE.Vector3(-0.55, 0.62, -0.75) },
      uDay: { value: 1 }, uDayZ: { value: 0 }, uDayK: { value: 0 }, uShadow: { value: 1 },
      uSky: { value: new THREE.Vector3(0.36, 0.41, 0.515) }, uKey: { value: new THREE.Vector3(0.77, 0.745, 0.70) },
      uGlow: { value: 1 }, uLz: { value: 0 }, uLk: { value: 0 }, uLa: { value: 0 }, uLr: { value: 0 }, uFill: { value: 0 }, uGobo: { value: 0 }, uDusk: { value: 0 }, uSide: { value: 0 }, uCut: { value: null }, uCutW: { value: 0 }, uBend: { value: 0 }, uSpin: { value: 0 }, uPOff: { value: new THREE.Vector2() }, uCutMap: { value: new THREE.Vector3(0, 0, 1) }, uRim: { value: 0 }, uLetter: { value: this.layout.place.map(([x, y]) => new THREE.Vector2(x, y)) }, uSlit: { value: new THREE.Vector4() }, uBlade: { value: 0 }, uWord: { value: [this.blankTex, this.blankTex] }, uWordBox: { value: v4(2) }, uWordOn: { value: new THREE.Vector3() }, uOver: { value: 0 }, uFlare: { value: new THREE.Vector3(99, 99, 0) }, uLineFloor: { value: -9 },
      uRampA: { value: v3(4) }, uRampB: { value: v3(4) }, uMorph: { value: 0 }, uKindA: { value: 0 }, uKindB: { value: 0 }, uWarp: { value: 0 },
      uPulseN: { value: 0 }, uPulse: { value: v4(4) },
      uRecs: { value: recs.texture }, uSdf: { value: sdf.texture }, uSdfE: { value: this.layout.extent }, uOpen: { value: new THREE.Vector4(1, 1, 1, 1) }, uO: { value: 0 },
      uText: { value: [this.blankTex, this.blankTex, this.blankTex] }, uTextBox: { value: v4(3) }, uSource: { value: this.layout.source },
      uPT: { value: [this.blankTex, this.blankTex, this.blankTex, this.blankTex] }, uPR: { value: v4(4) }, uPP: { value: v4(4) }, uPTB: { value: [this.blankTex, this.blankTex, this.blankTex, this.blankTex] }, uPMix: { value: 0 }, uPFit: { value: new THREE.Vector4(1, 1, 1, 1) },
      uHole: { value: new THREE.Vector4() }, uHoleOn: { value: 1 }, uPanelI: { value: 1 }, uPanelSh: { value: 1 },
      uScale: { value: 1 }, uWall: { value: 1 }, uSpillC: { value: new THREE.Vector3() }, uFlip: { value: 1 },
      uGrid: { value: new THREE.Vector4() }, uCell: { value: 1 }, uCells: { value: new THREE.Vector2() }, uHome: { value: new THREE.Vector2() },
      uHomeKind: { value: 0 }, uHomeRamp: { value: 0 }, uHomeLit: { value: 1 }, uRamps: { value: ramps.flatMap((r) => r.map((c) => new THREE.Vector3(...c))) }, uOthers: { value: 1 }, uShut: { value: 1 },
      uLines: { value: 0 }, uInk: { value: new THREE.Vector3(0.02, 0.02, 0.045) },
    };
    this.cutRT = new THREE.WebGLRenderTarget(opts.portrait ? 640 : 1280, opts.portrait ? 1024 : 800, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false });
    this.targets.push(this.cutRT);
    this.shared.uCut.value = this.cutRT.texture;
    this.knife = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: glsl.vertex, fragmentShader: glsl.knife, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.MinEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uE: { value: this.layout.extent }, uW: { value: new THREE.Vector2() } },
    });
    this.puncher = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: glsl.vertex, fragmentShader: glsl.punch, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.MinEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { uPoly: { value: Array.from({ length: 64 }, () => new THREE.Vector2()) }, uN: { value: 0 }, uE: { value: this.layout.extent } },
    });
    this.mend();
    for (const p of order) {
      this.mats[p] = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: glsl.vertex, fragmentShader: (glsl as any)[p],
        uniforms: this.shared, defines: { Q_SHADOW: this.steps }, depthTest: false, depthWrite: false,
      });
    }
  }

  /** A new arrangement of the letters, when a window turns on its side. */
  relayout(tall: boolean) {
    this.layout = tall ? portrait : landscape;
    const baker = new Baker(this.renderer);
    const sdf = baker.letters(this.layout);
    baker.dispose();
    this.targets.push(sdf);
    this.shared.uSdf.value = sdf.texture;
    this.shared.uSdfE.value = this.layout.extent;
    this.shared.uSource.value = this.layout.source;
    this.shared.uLetter.value = this.layout.place.map(([x, y]) => new THREE.Vector2(x, y));
  }

  /**
   * Words that hang in the canyon (ring: which ring they hang in front of), and two lines
   * of type that will stand on the wall by the player.
   */
  async setType(words: { lines: string[]; ring: number; width: number }[], saying: [string[], string[]], font: string, weight: number) {
    const turn = ++this.settings;
    const set = await Promise.all([...words.map((w) => textField(w.lines, font, weight)), ...saying.map((l) => textField(l, font, weight, 'left'))]);
    // A window turned on its side twice may have asked again in the meantime.
    if (turn !== this.settings) return set.forEach((f) => f.texture.dispose());
    this.textTextures.forEach((t) => t.dispose());
    this.textTextures = set.map((f) => f.texture);
    words.forEach((w, i) => {
      this.shared.uText.value[i] = set[i].texture;
      (this.shared.uTextBox.value[i] as THREE.Vector4).set(w.ring, w.width, w.width / set[i].aspect, 0);
    });
    saying.forEach((_, i) => {
      this.shared.uWord.value[i] = set[words.length + i].texture;
      this.sayingAspect[i] = set[words.length + i].aspect;
    });
  }
  private settings = 0;

  /** Where, in scene depth, a ring of the canyon stands. */
  ringZ(i: number) { return 0.8 + i * 0.15; }
  centre(z: number) {
    const u = z - 0.8;
    const ss = (a: number, b: number) => { const q = Math.min(1, Math.max(0, (u - a) / (b - a))); return q * q * (3 - 2 * q); };
    const env = ss(0.2, 3.2) * (1 - ss(9.4, 12.4));
    return { x: this.layout.source.x + 1.15 * Math.sin(u * 0.47) * env, y: this.layout.source.y + (0.55 * Math.sin(u * 0.62 + 0.4) - 0.21) * env };
  }
  readonly valleyZ = 0.8 + 84 * 0.15 + 0.25;

  /** Takes every cut back. */
  mend() {
    const c = new THREE.Color();
    this.renderer.getClearColor(c);
    const a = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.cutRT);
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(c, a);
    this.strokes = 0;
  }

  private stamp(m: THREE.ShaderMaterial) {
    const was = this.mesh.material;
    const auto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.mesh.material = m;
    this.renderer.setRenderTarget(this.cutRT);
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = auto;
    this.mesh.material = was;
    this.strokes++;
  }

  /** One short cut, from a to b, with the blade's width at each end. In world units. */
  cut(a: { x: number; y: number }, b: { x: number; y: number }, w0: number, w1: number) {
    const u = this.knife.uniforms;
    const m = this.sheetMap;
    u.uA.value.set((a.x - m.x) / m.s, (a.y - m.y) / m.s);
    u.uB.value.set((b.x - m.x) / m.s, (b.y - m.y) / m.s);
    u.uW.value.set(w0 / m.s, w1 / m.s);
    u.uE.value = this.layout.extent;
    this.stamp(this.knife);
  }

  /** A closed loop: everything inside it falls out. */
  punch(loop: { x: number; y: number }[]) {
    const u = this.puncher.uniforms;
    const m = this.sheetMap;
    const n = Math.min(64, loop.length);
    for (let i = 0; i < n; i++) {
      const p = loop[Math.floor((i * loop.length) / n)];
      u.uPoly.value[i].set((p.x - m.x) / m.s, (p.y - m.y) / m.s);
    }
    u.uN.value = n;
    u.uE.value = this.layout.extent;
    this.stamp(this.puncher);
  }

  sayingAspect = [1, 1];
  placeSaying(i: number, x: number, y: number, w: number) {
    (this.shared.uWordBox.value[i] as THREE.Vector4).set(x, y, w, w / this.sayingAspect[i]);
  }

  /** Without this extension (Firefox) programs are linked in turn with everything else: nothing is drawn while one is. */
  get serial() { return !this.renderer.extensions.has('KHR_parallel_shader_compile'); }

  async compile(progs: Program[] = order) {
    for (const p of progs) {
      this.mesh.material = this.mats[p];
      if (this.serial) await this.linked();
      else await this.renderer.compileAsync(this.scene, this.cam);
    }
  }

  /** Links the current material. Asking a program whether it is done would hold the page until it was; asking a fence behind it does not. */
  private async linked() {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    this.renderer.compile(this.scene, this.cam);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    // clientWaitSync with a flush would hold the page as well.
    while (fence && !gl.isContextLost() && gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) await new Promise((r) => setTimeout(r, 60));
    gl.deleteSync(fence);
  }

  resize(w: number, h: number, dpr: number) {
    this.renderer.setPixelRatio(1);
    this.w = Math.max(2, Math.round(w * dpr * this.scale));
    this.h = Math.max(2, Math.round(h * dpr * this.scale));
    this.renderer.setSize(this.w, this.h, false);
    (this.shared.uRes.value as THREE.Vector2).set(this.w, this.h);
  }

  private ramp(u: THREE.Vector3[], r: Ramp) { r.forEach((c, i) => u[i].set(c[0], c[1], c[2])); }

  private m4 = new THREE.Matrix4();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  /** Points the camera where the state says. */
  aim() {
    const s = this.state;
    this.euler.set(s.pitch + this.lean.y, s.yaw + this.lean.x, s.roll);
    this.shared.uCam.value.setFromMatrix4(this.m4.makeRotationFromEuler(this.euler));
  }
  /** Half the width and height of the view at depth z. */
  span(z: number) {
    const y = Math.abs(z - this.state.z) * Math.tan((this.state.fov * Math.PI) / 360);
    return { x: (y * this.w) / this.h, y };
  }

  render() {
    const s = this.state, u = this.shared;
    const prog = order[Math.round(s.prog)];
    u.uTan.value = Math.tan((s.fov * Math.PI) / 360);
    u.uRo.value.set(s.x, s.y, s.z);
    u.uShift.value.set(s.sx, s.sy);
    this.aim();
    u.uFocus.value = s.focus; u.uAp.value = s.ap; u.uTime.value = this.time; u.uFade.value = s.fade;
    u.uDay.value = s.day; u.uDayZ.value = s.dayZ; u.uDayK.value = s.dayK; u.uShadow.value = s.shadow;
    u.uGlow.value = s.glow * (1 + 0.2 * this.beat); u.uLz.value = s.lz; u.uLk.value = s.lk; u.uLa.value = s.la; u.uLr.value = s.lr; u.uFill.value = s.fill; u.uGobo.value = s.gobo; u.uDusk.value = s.dusk; u.uSide.value = s.side; u.uCutW.value = this.strokes ? s.cutW : 0; u.uBend.value = s.bend; u.uSpin.value = s.spin;
    u.uPOff.value.set(this.sheet.x, this.sheet.y); u.uSlit.value.set(this.slit.x, this.slit.y, this.slit.slope, this.slit.apart); u.uBlade.value = this.slit.line; u.uRim.value = s.rim; u.uOver.value = s.over; u.uWordOn.value.set(this.saying.floats, this.saying.cut, this.saying.lift); u.uFlare.value.set(this.flare.x, this.flare.y, this.flare.v); u.uCutMap.value.set(this.sheetMap.x, this.sheetMap.y, this.sheetMap.s); u.uLineFloor.value = s.lineFloor;
    u.uL.value.set(-0.55 + this.lean.x * 2.4, 0.62 + this.lean.y * 2.4, -0.75);
    this.ramp(u.uRampA.value, ramps[Math.round(s.rampA)]);
    this.ramp(u.uRampB.value, ramps[Math.round(s.rampB)]);
    u.uMorph.value = s.morph; u.uKindA.value = Math.round(s.kindA); u.uKindB.value = Math.round(s.kindB);
    u.uOpen.value.set(s.open0, s.open1, s.open2, s.open3); u.uO.value = s.o;
    [s.t0, s.t1, s.t2].forEach((w, i) => { u.uTextBox.value[i].w = w; });
    u.uWall.value = s.wall; u.uScale.value = s.scale; u.uSpillC.value.x = s.spill; u.uFlip.value = s.flip;
    u.uHole.value.set(s.hx, s.hy, s.hw, s.hh); u.uHoleOn.value = s.holeOn; u.uPanelI.value = s.panelI; u.uPanelSh.value = s.panelSh;
    u.uOthers.value = s.others; u.uHome.value.set(Math.round(s.homeX), Math.round(s.homeY)); u.uHomeKind.value = Math.round(s.homeKind);
    u.uGrid.value.set(this.grid.x, this.grid.y, this.grid.px, this.grid.py); u.uCell.value = this.grid.cell; u.uCells.value.set(this.grid.cols, this.grid.rows);
    u.uLines.value = s.lines; u.uPMix.value = s.pmix; u.uHomeRamp.value = Math.round(s.homeRamp); u.uHomeLit.value = s.homeLit; u.uShut.value = s.shut;
    this.panels.forEach((p, i) => {
      u.uPT.value[i] = p.tex ?? this.blankTex;
      u.uPTB.value[i] = p.next ?? p.tex ?? this.blankTex;
      u.uPR.value[i].set(p.x, p.y, p.w, p.h);
      const img = p.tex?.image as { width: number } | undefined;
      u.uPP.value[i].set(p.z, p.r, p.tex ? p.o : 0, img?.width ?? 1);
    });
    u.uPulseN.value = Math.min(4, this.pulses.length);
    this.pulses.slice(0, 4).forEach((p, i) => u.uPulse.value[i].set(p.x, p.y, p.age, p.power));
    // Sheets behind the camera are never visited.
    let k0 = 0;
    if (prog === 'descent') {
      if (s.z > 0.75) k0 = Math.max(0, Math.min(100, 7 + Math.floor((s.z - 0.8) / 0.15) - 1));
      if (s.z > this.valleyZ) k0 = 7 + 84 + 12 + Math.max(0, Math.floor((s.z - this.valleyZ) / 0.12) - 1);
    }
    u.uK0.value = k0;
    this.mesh.material = this.mats[prog];
    this.renderer.render(this.scene, this.cam);
    this.frames++;
  }

  /** Where a point on the screen falls on a sheet at depth z. */
  project(nx: number, ny: number, z = 0) {
    const s = this.state;
    const t = Math.tan((s.fov * Math.PI) / 360);
    const d = new THREE.Vector3(nx * t * (this.w / this.h) + s.sx, ny * t + s.sy, 1).applyMatrix3(this.shared.uCam.value);
    const k = (z - s.z) / d.z;
    return { x: s.x + d.x * k, y: s.y + d.y * k };
  }

  dispose() {
    this.targets.forEach((t) => t.dispose());
    this.textTextures.forEach((t) => t.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
    this.mesh.geometry.dispose();
    this.renderer.dispose();
  }
}
