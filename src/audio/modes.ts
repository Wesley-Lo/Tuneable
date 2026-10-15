/**
 * Mode configs. The audio engine, the UI flow, the curve and the exports are all
 * driven by these objects. Adding Rush Tune (10 band) or Deep Tune (30 band)
 * later means adding one more entry to MODES.
 */

/** Maximum boost or cut for any single tuning step, in dB. */
export const GAIN_LIMIT = 8;
/** Keyboard step size for the slider, in dB. */
export const GAIN_STEP = 0.5;

export type FilterKind = 'lowshelf' | 'highshelf' | 'peaking';

export interface FilterDef {
  id: string;
  /** Short name used in the readable list. */
  label: string;
  kind: FilterKind;
  freq: number;
  /** Used by peaking filters. Web Audio ignores Q on shelves. */
  q: number;
}

export interface StepTarget {
  filter: string;
  /** Multiplier from the step value (dB) to this filter's gain (dB). */
  weight: number;
}

export interface StepDef {
  id: string;
  name: string;
  /** Small line above the question. */
  caption: string;
  /** The large question. */
  question: string;
  /** Small line below the slider. */
  hint: string;
  /** Spoken description of the two ends, for screen readers. */
  lowLabel: string;
  highLabel: string;
  targets: StepTarget[];
}

export interface ModeDef {
  id: string;
  name: string;
  filters: FilterDef[];
  steps: StepDef[];
}

export interface ResolvedFilter extends FilterDef {
  gain: number;
}

const quick: ModeDef = {
  id: 'quick',
  name: 'Quick Tune',
  filters: [
    { id: 'tilt-low', label: 'General, low shelf', kind: 'lowshelf', freq: 150, q: 0.71 },
    { id: 'tilt-high', label: 'General, high shelf', kind: 'highshelf', freq: 6000, q: 0.71 },
    { id: 'bass', label: 'Bass', kind: 'peaking', freq: 100, q: 0.7 },
    { id: 'mids', label: 'Mids', kind: 'peaking', freq: 1000, q: 0.8 },
    { id: 'treble', label: 'Treble', kind: 'peaking', freq: 3500, q: 1.0 },
    { id: 'highs', label: 'Highs', kind: 'highshelf', freq: 10000, q: 0.71 },
  ],
  steps: [
    {
      id: 'general',
      name: 'General',
      caption: "You're finding the right sound",
      question: 'Does it feel too warm, or too bright?',
      hint: 'Drag until it feels right',
      lowLabel: 'warmer',
      highLabel: 'brighter',
      // A gentle tilt: the low shelf and the high shelf move in opposite directions.
      targets: [
        { filter: 'tilt-low', weight: -0.5 },
        { filter: 'tilt-high', weight: 0.5 },
      ],
    },
    {
      id: 'bass',
      name: 'Bass',
      caption: 'Bass',
      question: 'Is the bass too light, or too heavy?',
      hint: 'Up for more, down for less',
      lowLabel: 'less bass',
      highLabel: 'more bass',
      targets: [{ filter: 'bass', weight: 1 }],
    },
    {
      id: 'mids',
      name: 'Mids',
      caption: 'Mids',
      question: 'Do voices sit too far back, or too far forward?',
      hint: 'Small moves count here',
      lowLabel: 'mids pulled back',
      highLabel: 'mids pushed forward',
      targets: [{ filter: 'mids', weight: 1 }],
    },
    {
      id: 'treble',
      name: 'Treble',
      caption: 'Treble',
      question: 'Is the detail too dull, or too sharp?',
      hint: 'Listen to cymbals and the edge of voices',
      lowLabel: 'softer treble',
      highLabel: 'brighter treble',
      targets: [{ filter: 'treble', weight: 1 }],
    },
    {
      id: 'highs',
      name: 'Highs',
      caption: 'Highs',
      question: 'Is the air missing, or is it too sizzly?',
      hint: 'Almost there. Drag until it feels right',
      lowLabel: 'less air',
      highLabel: 'more air',
      targets: [{ filter: 'highs', weight: 1 }],
    },
  ],
};

export const MODES: Record<string, ModeDef> = { [quick.id]: quick };
export const DEFAULT_MODE_ID = quick.id;

export function getMode(id: string | null | undefined): ModeDef {
  return (id && MODES[id]) || MODES[DEFAULT_MODE_ID];
}

export function clampGain(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-GAIN_LIMIT, Math.min(GAIN_LIMIT, v));
}

/** Turns per-step values (dB) into the gain of every filter in the mode. */
export function resolveFilters(mode: ModeDef, values: readonly number[]): ResolvedFilter[] {
  const gains = new Map<string, number>();
  mode.steps.forEach((step, i) => {
    const v = clampGain(values[i] ?? 0);
    for (const t of step.targets) gains.set(t.filter, (gains.get(t.filter) ?? 0) + v * t.weight);
  });
  return mode.filters.map((f) => ({ ...f, gain: gains.get(f.id) ?? 0 }));
}
