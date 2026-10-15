import { clampGain, resolveFilters, type ModeDef } from './modes';
import { preampDb } from './response';

/** Time constant for gain changes. About 3x this is the settle time. */
const SMOOTH = 0.03;
/** Time constant for the before/after crossfade. */
const XFADE = 0.02;
const FADE_IN = 1.0;
/** Overall playback level, 0 to 1. 0.5 is about 6 dB quieter. Lower it to turn the music down. */
export const OUTPUT_LEVEL = 0.13;
const FADE_OUT = 0.12;

/**
 * Signal chain:
 *
 *   MediaElementSource -> wet -> EQ filters -> preamp --+
 *                      \-> dry ------------------------+-> limiter -> master -> destination
 *
 * The dry path is the bypass. When bypassed it is level matched to the preamp so the
 * Before/After comparison is not decided by loudness.
 */
export class AudioEngine {
  readonly el: HTMLAudioElement;
  ctx: AudioContext | null = null;

  private filters: BiquadFilterNode[] = [];
  private wet!: GainNode;
  private dry!: GainNode;
  private preamp!: GainNode;
  private master!: GainNode;

  private stepValues: number[];
  private bypassed = false;
  private pauseTimer = 0;
  private listeners = new Set<() => void>();
  private cancelLoad: (() => void) | null = null;
  private resumeAfterLoad = false;
  private loadGen = 0;

  constructor(private mode: ModeDef) {
    this.stepValues = mode.steps.map(() => 0);
    this.el = new Audio();
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.setAttribute('playsinline', '');
    for (const ev of ['play', 'pause', 'loadstart'] as const) {
      this.el.addEventListener(ev, () => this.emit());
    }
  }

  get values(): readonly number[] {
    return this.stepValues;
  }
  get bypass(): boolean {
    return this.bypassed;
  }
  get playing(): boolean {
    return !this.el.paused;
  }
  get hasSource(): boolean {
    return this.el.src !== '' && this.el.getAttribute('src') !== null;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit() {
    this.listeners.forEach((cb) => cb());
  }

  /** Must run inside a user gesture the first time (browser autoplay rules). */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.build();
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* resume can reject outside a gesture; the next click retries */
      }
    }
  }

  private build() {
    const ctx = this.ctx!;
    const source = ctx.createMediaElementSource(this.el);

    this.wet = ctx.createGain();
    this.dry = ctx.createGain();
    this.dry.gain.value = 0;
    this.preamp = ctx.createGain();

    // Safety limiter. Transparent for normal levels, catches anything that gets through.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    source.connect(this.wet);
    let prev: AudioNode = this.wet;
    this.filters = this.mode.filters.map((def) => {
      const f = ctx.createBiquadFilter();
      f.type = def.kind;
      f.frequency.value = def.freq;
      if (def.kind === 'peaking') f.Q.value = def.q;
      f.gain.value = 0;
      prev.connect(f);
      prev = f;
      return f;
    });
    prev.connect(this.preamp);
    this.preamp.connect(limiter);

    source.connect(this.dry);
    this.dry.connect(limiter);

    limiter.connect(this.master);
    this.master.connect(ctx.destination);

    this.apply(true);
  }

  private ramp(param: AudioParam, value: number, constant: number, immediate: boolean) {
    const t = this.ctx!.currentTime;
    if (immediate) {
      param.cancelScheduledValues(t);
      param.setValueAtTime(value, t);
    } else {
      param.setTargetAtTime(value, t, constant);
    }
  }

  private apply(immediate = false) {
    if (!this.ctx) return;
    const resolved = resolveFilters(this.mode, this.stepValues);
    this.filters.forEach((node, i) => this.ramp(node.gain, resolved[i].gain, SMOOTH, immediate));

    // Lower the preamp by the loudest point of the combined curve so boosts never clip.
    const pre = Math.pow(10, preampDb(resolved) / 20);
    this.ramp(this.preamp.gain, pre, SMOOTH, immediate);
    this.ramp(this.wet.gain, this.bypassed ? 0 : 1, XFADE, immediate);
    this.ramp(this.dry.gain, this.bypassed ? pre : 0, XFADE, immediate);
  }

  setValue(stepIndex: number, db: number) {
    this.stepValues[stepIndex] = clampGain(db);
    this.apply();
  }

  setValues(values: readonly number[]) {
    this.stepValues = this.mode.steps.map((_, i) => clampGain(values[i] ?? 0));
    this.apply();
  }

  setBypass(on: boolean) {
    this.bypassed = on;
    this.apply();
    this.emit();
  }

  /**
   * Swaps the track. If music was playing it keeps playing with the new track (with
   * the usual fade in). A newer call supersedes an older one still loading, and the
   * older call rejects with an AbortError.
   */
  async loadUrl(url: string): Promise<void> {
    const gen = ++this.loadGen;
    const superseded = () => new DOMException('Superseded by a newer track', 'AbortError');
    if (this.cancelLoad) {
      this.cancelLoad();
    } else {
      this.resumeAfterLoad = this.playing;
      if (this.playing && this.ctx) {
        // Short fade so the old track does not cut off with a click.
        const g = this.master.gain;
        const t = this.ctx.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + 0.08);
        await new Promise((r) => setTimeout(r, 90));
      }
    }
    if (gen !== this.loadGen) throw superseded();

    try {
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          this.el.removeEventListener('loadedmetadata', onOk);
          this.el.removeEventListener('error', onErr);
          this.cancelLoad = null;
        };
        const onOk = () => (done(), resolve());
        const onErr = () => (done(), reject(new Error('Could not load that audio file.')));
        this.cancelLoad = () => {
          done();
          reject(superseded());
        };
        this.el.addEventListener('loadedmetadata', onOk);
        this.el.addEventListener('error', onErr);
        this.el.src = url;
        this.el.load();
      });
    } catch (err) {
      // A superseded load hands the resume flag to the load that replaced it.
      if (!(err instanceof DOMException && err.name === 'AbortError')) this.resumeAfterLoad = false;
      throw err;
    }

    const resume = this.resumeAfterLoad;
    this.resumeAfterLoad = false;
    if (resume) await this.play();
  }

  async play(): Promise<void> {
    window.clearTimeout(this.pauseTimer);
    await this.unlock();
    const g = this.master.gain;
    const t = this.ctx!.currentTime;
    // Never start loud: fade in over about a second.
    g.cancelScheduledValues(t);
    g.setValueAtTime(this.el.paused ? 0 : g.value, t);
    g.linearRampToValueAtTime(OUTPUT_LEVEL, t + FADE_IN);
    await this.el.play();
  }

  pause() {
    if (!this.ctx) {
      this.el.pause();
      return;
    }
    const g = this.master.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + FADE_OUT);
    window.clearTimeout(this.pauseTimer);
    this.pauseTimer = window.setTimeout(() => this.el.pause(), FADE_OUT * 1000 + 20);
  }

  async toggle(): Promise<void> {
    if (this.playing) this.pause();
    else await this.play();
  }
}
