/**
 * The sound of orbits. The orbit of the point under the pointer is played as a melody:
 * each point z_n is a note, its pitch from the angle of z on a pentatonic scale over two
 * octaves, an octave lower near 0 and higher far out, panned by the real part. A bounded
 * orbit settles on its cycle, and a cycle of period p becomes a loop of p notes; an orbit
 * that escapes ends in a glide upwards that fades out. During the endless dive the centre
 * is the nucleus of a minibrot, and its long cycle is the music of the dive.
 */
import type { OrbitPoints, Reading } from "../math/atlas";

/** Semitones above the root of the notes of the scale: a pentatonic over two octaves. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const ROOT_HZ = 196; // G3
const STEP_S = 0.115;
const LOOKAHEAD_S = 0.15;
/** Where the loop of a bounded orbit starts: past the first steps, it is on its cycle. */
const SETTLED = 200;

export function noteOf(x: number, y: number): { hz: number; pan: number; level: number } {
  const turn = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI);
  const degree = SCALE[Math.min(SCALE.length - 1, Math.floor(turn * SCALE.length))];
  const r = Math.hypot(x, y);
  const octave = r < 0.4 ? -12 : r > 1.6 ? 12 : 0;
  return {
    hz: ROOT_HZ * 2 ** ((degree + octave) / 12),
    pan: Math.max(-0.9, Math.min(0.9, x / 2)),
    level: 0.5 + 0.5 * Math.min(1, r),
  };
}

export class OrbitSound {
  private ctx: AudioContext | null = null;
  /** The master level, ramped on start and stop. */
  private out: GainNode | null = null;
  /** Where the notes go: dry, into the room and into the echoes. */
  private bus: GainNode | null = null;
  private timer = 0;
  private next = 0;
  private cursor = 1;
  private orbit: OrbitPoints | null = null;
  private key = "";
  private resting = 0;
  on = false;
  /** Notes played so far, for checks. */
  played = 0;

  toggle(): boolean {
    if (this.on) this.stop();
    else this.start();
    return this.on;
  }

  private start(): void {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
    this.on = true;
    this.next = this.ctx!.currentTime + 0.05;
    this.out!.gain.setTargetAtTime(0.32, this.ctx!.currentTime, 0.1);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (!this.on) return;
    this.on = false;
    clearInterval(this.timer);
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  /** A soft room: a lowpass, two echoes and a short generated reverberation. */
  private build(): void {
    const ctx = new AudioContext();
    const out = ctx.createGain();
    out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    out.connect(comp).connect(ctx.destination);
    const room = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    room.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    room.connect(wet).connect(out);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = STEP_S * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    echo.connect(feedback).connect(echo);
    echo.connect(out);
    const bus = ctx.createGain();
    bus.connect(out);
    bus.connect(room);
    bus.connect(echo);
    this.ctx = ctx;
    this.out = out;
    this.bus = bus;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) void ctx.suspend();
      else if (this.on) void ctx.resume();
    });
  }

  /** The orbit to play, and its reading: a new kind of orbit starts the melody again. */
  setOrbit(o: OrbitPoints | null, r: Reading | null): void {
    this.orbit = o;
    const key = r ? `${r.escape > 0 ? "out" : "in"}${r.period}` : "";
    if (key !== this.key) {
      this.key = key;
      this.cursor = 1;
    }
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.orbit || !this.bus) return;
    while (this.next < ctx.currentTime + LOOKAHEAD_S) {
      const t = this.next;
      this.next += STEP_S;
      if (this.resting > 0) {
        this.resting--;
        continue;
      }
      const o = this.orbit;
      if (this.cursor > o.count) {
        if (o.escaped) {
          // Gone: a glide upwards from the last note, then a breath, then again.
          const last = noteOf(o.points[2 * o.count - 2], o.points[2 * o.count - 1]);
          this.glide(t, last.hz, last.pan);
          this.resting = 6;
          this.cursor = 1;
          continue;
        }
        this.cursor = Math.min(SETTLED, Math.max(1, o.count - 1));
      }
      const x = o.points[2 * this.cursor];
      const y = o.points[2 * this.cursor + 1];
      this.note(t, noteOf(x, y));
      this.cursor++;
    }
  }

  private note(t: number, n: { hz: number; pan: number; level: number }): void {
    this.played++;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = n.hz;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18 * n.level, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + STEP_S * 3.2);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    const pan = ctx.createStereoPanner();
    pan.pan.value = n.pan;
    osc.connect(filter).connect(gain).connect(pan).connect(this.bus!);
    osc.start(t);
    osc.stop(t + STEP_S * 3.4);
  }

  private glide(t: number, hz: number, panValue: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(hz * 4, t + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
    const pan = ctx.createStereoPanner();
    pan.pan.value = panValue;
    osc.connect(gain).connect(pan).connect(this.bus!);
    osc.start(t);
    osc.stop(t + 0.55);
  }
}
