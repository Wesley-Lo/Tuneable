import { h } from './dom';

const BASE_HUE = 265;

/**
 * Slow ambient glow behind everything. The slider feeds it a tone (-1 to 1) and a
 * touch amount (0 to 1); it turns those into a hue and an intensity.
 */
export class Ambient {
  readonly el: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = h(
      'div',
      { class: 'ambient', 'aria-hidden': 'true' },
      h('div', { class: 'blob blob-a' }),
      h('div', { class: 'blob blob-b' }),
      h('div', { class: 'blob blob-c' }),
      h('div', { class: 'grain' }),
    );
    parent.prepend(this.el);
    this.setTone(0, 0);
  }

  /** tone: -1 (cut, cool) to 1 (boost, warm). touch: 0 to 1. */
  setTone(tone: number, touch: number) {
    const hue = tone >= 0 ? BASE_HUE + 115 * tone : BASE_HUE + 55 * tone;
    const amp = Math.min(1, Math.abs(tone) * 0.7 + touch * 0.4);
    const root = document.documentElement.style;
    root.setProperty('--hue', hue.toFixed(1));
    root.setProperty('--amp', amp.toFixed(3));
  }
}
