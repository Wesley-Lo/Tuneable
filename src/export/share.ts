import { clampGain, DEFAULT_MODE_ID, MODES } from '../audio/modes';

export interface SharedPreset {
  modeId: string;
  values: number[];
}

/** Hash looks like `#b=3.0,-1.5,2.0,0.0,-2.0&m=quick`. */
export function encodeHash(modeId: string, values: readonly number[]): string {
  const b = values.map((v) => (Math.round(clampGain(v) * 10) / 10 || 0).toFixed(1)).join(',');
  return `#b=${b}&m=${encodeURIComponent(modeId)}`;
}

export function decodeHash(hash: string): SharedPreset | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const b = params.get('b');
  if (b === null) return null;
  const modeId = params.get('m') ?? DEFAULT_MODE_ID;
  const mode = MODES[modeId];
  if (!mode) return null;
  const parts = b.split(',');
  if (parts.length !== mode.steps.length) return null;
  const values = parts.map((p) => {
    const n = Number(p);
    return Number.isFinite(n) ? clampGain(Math.round(n * 10) / 10) : 0;
  });
  return { modeId, values };
}

export function shareUrl(modeId: string, values: readonly number[]): string {
  return `${location.origin}${location.pathname}${encodeHash(modeId, values)}`;
}
