import { h, icon } from './dom';

// A slim glass pill with a knob in the middle, like the slider.
const MARK = '<rect x="8.5" y="2.5" width="7" height="19" rx="3.5"/><rect x="8.5" y="10" width="7" height="5.5" rx="2.75" fill="currentColor" stroke="none"/>';

/**
 * The Tuneable wordmark. Centred at the top of the welcome screen, and in the top
 * left corner of every other screen. It sits inside each screen, so it fades with it.
 */
export function wordmark(centered = false): HTMLElement {
  return h(
    'div',
    { class: 'wordmark' + (centered ? ' is-centered' : ''), 'aria-hidden': centered ? null : 'true' },
    icon(MARK, 'wm-mark'),
    h('span', { class: 'wm-text' }, 'Tuneable'),
  );
}
