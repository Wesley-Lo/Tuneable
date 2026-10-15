import type { ResolvedFilter } from './modes';

/**
 * Real biquad response from the browser's own filter implementation, computed on a
 * tiny OfflineAudioContext. It needs no user gesture, so it also works when a share
 * link opens straight onto the result screen.
 */

let offline: OfflineAudioContext | null = null;

function getOffline(): OfflineAudioContext {
  if (!offline) {
    const Ctor: typeof OfflineAudioContext =
      window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    offline = new Ctor(1, 1, 44100);
  }
  return offline;
}

export function logFreqs(count: number, min = 20, max = 20000): Float32Array<ArrayBuffer> {
  const out = new Float32Array(count);
  const a = Math.log(min);
  const b = Math.log(max);
  for (let i = 0; i < count; i++) out[i] = Math.exp(a + ((b - a) * i) / (count - 1));
  return out;
}

/** Combined magnitude response of all filters in dB at the given frequencies. */
export function combinedResponseDb(filters: readonly ResolvedFilter[], freqs: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  const ctx = getOffline();
  const total = new Float32Array(freqs.length);
  const mag = new Float32Array(freqs.length);
  const phase = new Float32Array(freqs.length);
  for (const f of filters) {
    if (Math.abs(f.gain) < 0.001) continue;
    const node = ctx.createBiquadFilter();
    node.type = f.kind;
    node.frequency.value = f.freq;
    node.gain.value = f.gain;
    if (f.kind === 'peaking') node.Q.value = f.q;
    node.getFrequencyResponse(freqs, mag, phase);
    for (let i = 0; i < freqs.length; i++) total[i] += 20 * Math.log10(mag[i]);
  }
  return total;
}

const PEAK_FREQS = logFreqs(256);

/**
 * Preamp (a value of zero or below, in dB) that keeps the loudest point of the
 * combined curve at or under 0 dB. Rounded down to 0.1 dB so it never under-corrects.
 */
export function preampDb(filters: readonly ResolvedFilter[]): number {
  const curve = combinedResponseDb(filters, PEAK_FREQS);
  let peak = 0;
  for (let i = 0; i < curve.length; i++) if (curve[i] > peak) peak = curve[i];
  if (peak < 0.05) return 0;
  return -Math.ceil(peak * 10 - 1e-6) / 10;
}
