import { combinedResponseDb, logFreqs } from '../audio/response';
import type { ModeDef } from '../audio/modes';
import { resolveFilters } from '../audio/modes';
import { prefersReducedMotion, s } from './dom';

const W = 600;
const H = 240;
const PAD_X = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 28;
const RANGE_DB = 10;
const POINTS = 160;
const FREQS = logFreqs(POINTS);
const F_MIN = 20;
const F_MAX = 20000;

const xOf = (f: number) =>
  PAD_X + ((Math.log(f) - Math.log(F_MIN)) / (Math.log(F_MAX) - Math.log(F_MIN))) * (W - PAD_X * 2);
const yOf = (db: number) => {
  const mid = PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) / 2;
  const half = (H - PAD_TOP - PAD_BOTTOM) / 2;
  return mid - (Math.max(-RANGE_DB, Math.min(RANGE_DB, db)) / RANGE_DB) * half;
};

/** Smooth path through the points using midpoint quadratic curves. */
function smoothPath(ys: ArrayLike<number>): string {
  const pts = Array.from(ys, (y, i) => [xOf(FREQS[i]), y] as const);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return d + `L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}

/**
 * Live EQ curve. The numbers come from BiquadFilterNode.getFrequencyResponse, so it
 * is the same maths the audio engine uses, not a drawing of what it might look like.
 */
export class CurveView {
  readonly el: SVGSVGElement;
  private line: SVGPathElement;
  private area: SVGPathElement;
  private current: Float32Array = new Float32Array(POINTS);
  private target: Float32Array = new Float32Array(POINTS);
  private frame = 0;
  private from: Float32Array = new Float32Array(POINTS);
  private t0 = 0;

  constructor(private mode: ModeDef) {
    const defs = s(
      'defs',
      {},
      s(
        'linearGradient',
        { id: 'curve-stroke', gradientUnits: 'userSpaceOnUse', x1: PAD_X, x2: W - PAD_X, y1: 0, y2: 0 },
        s('stop', { offset: '0', 'stop-color': 'hsl(215 90% 72%)' }),
        s('stop', { offset: '0.55', 'stop-color': 'hsl(265 85% 80%)' }),
        s('stop', { offset: '1', 'stop-color': 'hsl(20 95% 74%)' }),
      ),
    );

    const grid = s('g', { class: 'curve-grid' });
    for (const db of [-6, 6]) {
      grid.append(s('line', { x1: PAD_X, x2: W - PAD_X, y1: yOf(db), y2: yOf(db), class: 'g-minor' }));
    }
    grid.append(s('line', { x1: PAD_X, x2: W - PAD_X, y1: yOf(0), y2: yOf(0), class: 'g-zero' }));
    for (const [f, label] of [[100, '100'], [1000, '1k'], [10000, '10k']] as const) {
      grid.append(
        s('line', { x1: xOf(f), x2: xOf(f), y1: PAD_TOP, y2: H - PAD_BOTTOM, class: 'g-minor g-vert' }),
        s('text', { x: xOf(f), y: H - 8, 'text-anchor': 'middle', class: 'g-label' }, label),
      );
    }

    this.area = s('path', { class: 'curve-area' });
    this.line = s('path', { class: 'curve-line', stroke: 'url(#curve-stroke)', fill: 'none' });
    this.el = s(
      'svg',
      {
        class: 'curve',
        viewBox: `0 0 ${W} ${H}`,
        role: 'img',
        'aria-label': 'Graph of your final EQ curve across bass, mids and treble',
      },
      defs,
      grid,
      this.area,
      this.line,
    );
    this.draw(this.current);
  }

  /** Target the curve for these step values, or a flat line when bypassed. */
  update(values: readonly number[], flat: boolean, animate = true) {
    const next = flat
      ? new Float32Array(POINTS)
      : combinedResponseDb(resolveFilters(this.mode, values), FREQS);
    this.target = next;
    if (!animate || prefersReducedMotion()) {
      this.current = Float32Array.from(next);
      this.draw(this.current);
      return;
    }
    this.from = Float32Array.from(this.current);
    this.t0 = performance.now();
    cancelAnimationFrame(this.frame);
    const step = (now: number) => {
      const p = Math.min(1, (now - this.t0) / 450);
      const e = 1 - Math.pow(1 - p, 3);
      for (let i = 0; i < POINTS; i++) this.current[i] = this.from[i] + (this.target[i] - this.from[i]) * e;
      this.draw(this.current);
      if (p < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
  }

  private draw(db: ArrayLike<number>) {
    const ys = Array.from(db, (v) => yOf(v));
    const d = smoothPath(ys);
    this.line.setAttribute('d', d);
    const x0 = xOf(FREQS[0]);
    const x1 = xOf(FREQS[POINTS - 1]);
    this.area.setAttribute('d', `${d}L${x1.toFixed(1)} ${yOf(0).toFixed(1)}L${x0.toFixed(1)} ${yOf(0).toFixed(1)}Z`);
  }
}
