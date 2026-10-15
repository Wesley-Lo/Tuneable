import { resolveFilters, type FilterKind, type ModeDef, type ResolvedFilter } from '../audio/modes';
import { preampDb } from '../audio/response';

const APO_TYPE: Record<FilterKind, string> = {
  lowshelf: 'LSC',
  highshelf: 'HSC',
  peaking: 'PK',
};

const TYPE_NAME: Record<FilterKind, string> = {
  lowshelf: 'Low shelf',
  highshelf: 'High shelf',
  peaking: 'Peak',
};

export interface ExportData {
  modeName: string;
  preamp: number;
  /** Filters with a non zero gain, rounded to 0.1 dB, in signal order. */
  filters: ResolvedFilter[];
}

export function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

export function fmtDb(n: number, sign = false): string {
  const r = round1(n);
  return (sign && r > 0 ? '+' : '') + r.toFixed(1);
}

export function fmtHz(hz: number): string {
  return hz >= 1000 ? `${+(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}

export function buildExport(mode: ModeDef, values: readonly number[]): ExportData {
  // Round first, then derive the preamp from what is actually written out.
  const rounded = resolveFilters(mode, values).map((f) => ({ ...f, gain: round1(f.gain) }));
  return {
    modeName: mode.name,
    preamp: preampDb(rounded),
    filters: rounded.filter((f) => f.gain !== 0),
  };
}

/** Equalizer APO / Peace configuration text. */
export function apoText(data: ExportData): string {
  const lines = [`Preamp: ${fmtDb(data.preamp)} dB`];
  data.filters.forEach((f, i) => {
    const q = f.kind === 'peaking' ? ` Q ${f.q.toFixed(2)}` : '';
    lines.push(`Filter ${i + 1}: ON ${APO_TYPE[f.kind]} Fc ${Math.round(f.freq)} Hz Gain ${fmtDb(f.gain)} dB${q}`);
  });
  return lines.join('\n') + '\n';
}

export interface ListRow {
  label: string;
  type: string;
  freq: string;
  gain: string;
  q: string;
}

/** Rows for the readable list. Includes the preamp as the first row. */
export function listRows(data: ExportData): ListRow[] {
  const rows: ListRow[] = [
    { label: 'Preamp', type: '', freq: '', gain: `${fmtDb(data.preamp, true)} dB`, q: '' },
  ];
  for (const f of data.filters) {
    rows.push({
      label: f.label,
      type: TYPE_NAME[f.kind],
      freq: fmtHz(f.freq),
      gain: `${fmtDb(f.gain, true)} dB`,
      q: f.kind === 'peaking' ? f.q.toFixed(2) : '',
    });
  }
  return rows;
}

/** Plain text version of the list, for any other EQ app. */
export function listText(data: ExportData): string {
  const lines = [`Tuneable, ${data.modeName}`, `Preamp: ${fmtDb(data.preamp, true)} dB`];
  if (data.filters.length === 0) lines.push('No changes. Your sound is already flat.');
  for (const f of data.filters) {
    const q = f.kind === 'peaking' ? `, Q ${f.q.toFixed(2)}` : '';
    lines.push(`${f.label}: ${fmtDb(f.gain, true)} dB at ${fmtHz(f.freq)} (${TYPE_NAME[f.kind].toLowerCase()}${q})`);
  }
  return lines.join('\n') + '\n';
}
