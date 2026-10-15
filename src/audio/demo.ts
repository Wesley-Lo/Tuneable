/**
 * Procedural demo track, rendered once in the browser with an OfflineAudioContext.
 * It is used when /public/audio/sample.mp3 does not exist, so the app always has
 * something to tune against. It deliberately covers the whole spectrum: sub bass kick,
 * bass line, pads and plucks in the mids, snare in the treble, hats and bells up high.
 */

const SR = 44100;
const BPM = 92;
const BEAT = 60 / BPM;
const BARS = 8;

// A minor, F, C, G (each held for two bars)
const CHORDS = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [261.63, 329.63, 392.0],
  [196.0, 246.94, 293.66],
];
const ROOTS = [55.0, 43.65, 65.41, 49.0];

export async function renderDemoTrack(): Promise<string> {
  const dur = BARS * 4 * BEAT;
  const Ctor: typeof OfflineAudioContext =
    window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const ctx = new Ctor(2, Math.ceil(SR * dur), SR);

  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  // One shared noise buffer for snare, hats and air.
  const noiseBuf = ctx.createBuffer(1, SR * 2, SR);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const out = (node: AudioNode, pan = 0) => {
    if (pan !== 0 && 'createStereoPanner' in ctx) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(master);
    } else {
      node.connect(master);
    }
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  const kick = (t: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
    env(g, t, 0.95, 0.004, 0.38);
    o.connect(g);
    out(g);
    o.start(t);
    o.stop(t + 0.5);
  };

  const snare = (t: number) => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    env(g, t, 0.42, 0.002, 0.2);
    n.connect(bp);
    bp.connect(g);
    out(g, 0.05);
    n.start(t, Math.random());
    n.stop(t + 0.3);

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.1);
    const g2 = ctx.createGain();
    env(g2, t, 0.3, 0.002, 0.14);
    o.connect(g2);
    out(g2);
    o.start(t);
    o.stop(t + 0.25);
  };

  const hat = (t: number, open: boolean, pan: number) => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    env(g, t, open ? 0.17 : 0.11, 0.001, open ? 0.2 : 0.045);
    n.connect(hp);
    hp.connect(g);
    out(g, pan);
    n.start(t, Math.random());
    n.stop(t + 0.3);
  };

  const bass = (t: number, f: number, len: number) => {
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + len);
    lp.Q.value = 3;
    const g = ctx.createGain();
    env(g, t, 0.34, 0.01, len);
    saw.connect(lp);
    lp.connect(g);
    out(g);
    saw.start(t);
    saw.stop(t + len + 0.1);

    const sub = ctx.createOscillator();
    sub.frequency.value = f;
    const g2 = ctx.createGain();
    env(g2, t, 0.3, 0.01, len);
    sub.connect(g2);
    out(g2);
    sub.start(t);
    sub.stop(t + len + 0.1);
  };

  const pad = (t: number, len: number, freqs: number[]) => {
    freqs.forEach((f, i) => {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = detune;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1700;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.5);
        g.gain.setValueAtTime(0.05, t + len - 0.5);
        g.gain.linearRampToValueAtTime(0.0001, t + len);
        o.connect(lp);
        lp.connect(g);
        out(g, (i - 1) * 0.4);
        o.start(t);
        o.stop(t + len + 0.05);
      }
    });
  };

  const pluck = (t: number, f: number, pan: number) => {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    const g = ctx.createGain();
    env(g, t, 0.085, 0.003, 0.3);
    o.connect(lp);
    lp.connect(g);
    out(g, pan);
    o.start(t);
    o.stop(t + 0.4);
  };

  const bell = (t: number, f: number, pan: number) => {
    for (const mult of [1, 2.01]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      env(g, t, mult === 1 ? 0.035 : 0.018, 0.004, 1.6);
      o.connect(g);
      out(g, pan);
      o.start(t);
      o.stop(t + 1.8);
    }
  };

  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * 4 * BEAT;
    const ci = Math.floor(bar / 2) % CHORDS.length;
    const chord = CHORDS[ci];
    const root = ROOTS[ci];

    pad(t0, 4 * BEAT, chord);

    // Drums: kick on 1 and the "and" of 2, snare on 2 and 4, eighth note hats.
    kick(t0);
    kick(t0 + 2.5 * BEAT);
    if (bar % 2 === 1) kick(t0 + 3.5 * BEAT);
    snare(t0 + BEAT);
    snare(t0 + 3 * BEAT);
    for (let e = 0; e < 8; e++) hat(t0 + e * 0.5 * BEAT, e % 2 === 1 && e % 4 === 3, e % 2 ? 0.3 : -0.3);

    // Bass line
    bass(t0, root, 0.9 * BEAT);
    bass(t0 + 1.5 * BEAT, root, 0.4 * BEAT);
    bass(t0 + 2.5 * BEAT, root * 1.5, 0.45 * BEAT);
    bass(t0 + 3.25 * BEAT, root * 2, 0.6 * BEAT);

    // Arpeggio, an octave above the pad chord
    const arp = [chord[0], chord[1], chord[2], chord[1]];
    for (let e = 0; e < 8; e++) {
      pluck(t0 + e * 0.5 * BEAT, arp[e % 4] * 2, ((e % 4) - 1.5) * 0.3);
    }

    // High bells every second bar
    if (bar % 2 === 0) {
      bell(t0 + 0.5 * BEAT, chord[2] * 8, -0.4);
      bell(t0 + 2.5 * BEAT, chord[0] * 16, 0.4);
    }
  }

  const rendered = await ctx.startRendering();
  return URL.createObjectURL(encodeWav(rendered));
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const data: Float32Array[] = [];
  let peak = 0;
  for (let c = 0; c < channels; c++) {
    const d = buffer.getChannelData(c);
    data.push(d);
    for (let i = 0; i < length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
  }
  // Normalise to a modest level and add tiny fades so the loop point does not click.
  const scale = peak > 0 ? 0.7 / peak : 1;
  const fade = Math.floor(SR * 0.02);

  const bytes = length * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const write = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, bytes, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    const edge = Math.min(1, i / fade, (length - 1 - i) / fade);
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i] * scale * edge));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}
