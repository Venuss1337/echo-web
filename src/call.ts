import type { World } from './world/world';

/**
 * Press the paper and it answers: once, and then three times more, quieter.
 * The sound is a struck string and one delay line, made here, and only ever
 * after the visitor has asked for sound.
 */
const GAP = 0.44;
const NOTES = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0];

/** Four short phrases, one per record, as steps into NOTES. */
const PHRASES = [
  [4, 3, 5, 2, 4, 6, 5, 3],
  [0, 2, 4, 2, 5, 4, 2, 1],
  [0, 4, 1, 5, 2, 6, 3, 7],
  [7, 6, 4, 6, 7, 8, 6, 4],
];

export class Call {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private hiss: { gain: GainNode; tone: BiquadFilterNode } | null = null;
  private tune: { record: number; step: number; wait: number } | null = null;
  on = false;
  wake: () => void = () => {};
  ended: () => void = () => {};
  constructor(private world: World) {}

  toggle() {
    this.on = !this.on;
    if (this.on && !this.ctx) this.build();
    if (this.ctx) void (this.on ? this.ctx.resume() : this.ctx.suspend());
    return this.on;
  }

  private build() {
    const c = new AudioContext();
    const bus = c.createGain();
    bus.gain.value = 0.5;
    const echo = c.createDelay(2);
    echo.delayTime.value = GAP;
    const back = c.createGain();
    back.gain.value = 0.46;
    const dull = c.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 1700;
    bus.connect(c.destination);
    bus.connect(echo);
    echo.connect(dull).connect(back).connect(echo);
    back.connect(c.destination);
    // The blade: filtered noise, silent until it moves.
    const n = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = n;
    noise.loop = true;
    const tone = c.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = 2400;
    tone.Q.value = 0.8;
    const gain = c.createGain();
    gain.gain.value = 0;
    noise.connect(tone).connect(gain).connect(c.destination);
    noise.start();
    this.ctx = c;
    this.bus = bus;
    this.hiss = { gain, tone };
  }

  /** A string, plucked: Karplus and Strong, rendered to a buffer. */
  private pluck(freq: number, pan: number, loud = 0.9) {
    const c = this.ctx!;
    const n = Math.round(c.sampleRate / freq);
    const len = Math.round(c.sampleRate * 1.6);
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    const ring = new Float32Array(n);
    let soft = 0;
    for (let i = 0; i < n; i++) {
      soft += (Math.random() * 2 - 1 - soft) * 0.35;
      ring[i] = soft;
    }
    for (let i = 0, p = 0; i < len; i++, p = (p + 1) % n) {
      d[i] = ring[p] * Math.min(1, i / 60);
      ring[p] = (ring[p] + ring[(p + 1) % n]) * 0.4985;
    }
    const s = c.createBufferSource();
    s.buffer = b;
    const g = c.createGain();
    g.gain.setValueAtTime(loud, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.5);
    const pn = c.createStereoPanner();
    pn.pan.value = pan;
    s.connect(g).connect(pn).connect(this.bus!);
    s.start();
  }

  /** The blade, heard while it is moving. */
  slice(speed: number) {
    if (!this.on || !this.ctx || !this.hiss) return;
    const t = this.ctx.currentTime;
    this.hiss.gain.gain.cancelScheduledValues(t);
    this.hiss.gain.gain.setTargetAtTime(Math.min(0.11, speed * 0.05), t, 0.015);
    this.hiss.gain.gain.setTargetAtTime(0, t + 0.06, 0.05);
    this.hiss.tone.frequency.setTargetAtTime(1500 + Math.min(1, speed) * 2600, t, 0.02);
  }

  private ring(x: number, y: number, z: number, power: number) {
    const list = this.world.pulses;
    list.length = 0;
    for (let i = 0; i < 4; i++) list.push({ x, y, age: z * 0.085 - i * GAP, power: power * 0.62 ** i });
    this.wake();
  }

  /** nx, ny in [-1, 1]; z is the sheet that was pressed. */
  press(nx: number, ny: number, z: number, power = 1) {
    const p = this.world.project(nx, ny, z);
    this.ring(p.x, p.y, z, power);
    if (this.on && this.ctx) this.pluck(NOTES[Math.round(((ny + 1) / 2) * (NOTES.length - 1))], nx * 0.6);
  }

  /** Puts the record on. Its light keeps time whether or not there is sound. */
  play(record: number) {
    this.tune = { record, step: 0, wait: 0 };
    this.wake();
  }
  stop() {
    if (!this.tune) return;
    this.tune = null;
    this.world.beat = 0;
    this.ended();
    this.wake();
  }
  get playing() { return this.tune !== null; }

  /** Returns true while anything is still sounding through the paper. */
  step(dt: number) {
    let busy = false;
    const l = this.world.pulses;
    if (l.length) {
      busy = true;
      for (const p of l) p.age += dt;
      if (l[l.length - 1].age > 4.6) l.length = 0;
    }
    if (this.world.beat > 0.002) {
      this.world.beat *= Math.exp(-dt * 3.2);
      busy = true;
    } else this.world.beat = 0;
    const t = this.tune;
    if (t) {
      busy = true;
      t.wait -= dt;
      if (t.wait <= 0) {
        const line = PHRASES[t.record % 4];
        if (t.step >= line.length * 2) this.stop();
        else {
          const n = line[t.step % line.length];
          this.world.beat = 1;
          this.ring(0.06, 0.1, 0, t.step % 4 === 0 ? 0.6 : 0.34);
          if (this.on && this.ctx) this.pluck(NOTES[n], ((t.step % 3) - 1) * 0.3, 0.7);
          t.step++;
          t.wait = GAP * (t.step % 4 === 0 ? 2 : 1);
        }
      }
    }
    return busy;
  }
}
