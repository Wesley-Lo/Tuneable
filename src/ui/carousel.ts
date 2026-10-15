import { h, icon } from './dom';

export interface CarouselItem {
  title: string;
  artist: string;
  hue: number;
}

/** How far a neighbouring card sits from the centre, as a share of the card width. */
const SPREAD = 0.74;
const SWIPE_PX = 40;

const CHEVRON_L = '<path d="M14.5 5.5 8 12l6.5 6.5"/>';
const CHEVRON_R = '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>';

/**
 * A cycling carousel: the centre card is the chosen song, its neighbours peek in on
 * either side, and going past the last song wraps round to the first.
 * Works with the arrow buttons, the dots, the arrow keys, a swipe, or a tap on a side card.
 */
export class Carousel {
  readonly el: HTMLElement;
  private cards: HTMLElement[];
  private dots: HTMLElement[];
  private prevD: number[];
  private live: HTMLElement;
  private bars: HTMLElement[] = [];
  private downX = 0;
  private downTarget: Element | null = null;
  private tracking = false;

  constructor(
    private items: CarouselItem[],
    private index: number,
    private onChange: (index: number) => void,
  ) {
    const n = items.length;
    this.index = Math.max(0, Math.min(n - 1, index));

    this.cards = items.map((item, i) => {
      const bars = h('span', { class: 'bars', 'aria-hidden': 'true' }, ...[0, 1, 2, 3].map(() => h('i')));
      this.bars.push(bars);
      return h(
        'article',
        {
          class: 'car-card',
          style: `--card-hue:${item.hue}`,
          role: 'group',
          'aria-roledescription': 'slide',
          'aria-label': `${i + 1} of ${n}: ${item.title} by ${item.artist}`,
        },
        h('div', { class: 'car-art', 'aria-hidden': 'true' }, bars),
        h('h3', { class: 'car-title' }, item.title),
        h('p', { class: 'car-artist' }, item.artist),
      );
    });
    this.prevD = this.cards.map(() => 0);

    const stage = h('div', { class: 'car-stage' }, ...this.cards);
    stage.addEventListener('pointerdown', this.onDown);

    this.dots = items.map((item, i) =>
      h(
        'button',
        { class: 'car-dot', type: 'button', 'aria-label': `Track ${i + 1}: ${item.title}`, onClick: () => this.go(i) },
        h('span'),
      ),
    );

    this.live = h('div', { class: 'sr-only', 'aria-live': 'polite' });

    const multiple = n > 1;
    this.el = h(
      'div',
      {
        class: 'carousel' + (multiple ? '' : ' is-single'),
        role: 'group',
        'aria-roledescription': 'carousel',
        'aria-label': 'Built-in tracks',
        tabindex: multiple ? '0' : null,
      },
      multiple &&
        h('button', { class: 'car-nav car-prev', type: 'button', 'aria-label': 'Previous track', onClick: () => this.step(-1) }, icon(CHEVRON_L)),
      stage,
      multiple &&
        h('button', { class: 'car-nav car-next', type: 'button', 'aria-label': 'Next track', onClick: () => this.step(1) }, icon(CHEVRON_R)),
      multiple && h('div', { class: 'car-dots' }, ...this.dots),
      this.live,
    );
    this.el.addEventListener('keydown', this.onKey);

    this.layout(true);
  }

  get current(): number {
    return this.index;
  }

  /** Shows the little level bars on the centre card while music plays. */
  setPlaying(playing: boolean) {
    this.cards.forEach((c, i) => c.classList.toggle('is-playing', playing && i === this.index));
  }

  step(by: number) {
    const n = this.items.length;
    this.go((this.index + by + n) % n);
  }

  go(i: number) {
    if (i === this.index || i < 0 || i >= this.items.length) return;
    this.index = i;
    this.layout(false);
    const item = this.items[i];
    this.live.textContent = `Track ${i + 1} of ${this.items.length}: ${item.title} by ${item.artist}`;
    this.onChange(i);
  }

  destroy() {
    window.removeEventListener('pointerup', this.onUp);
  }

  // ---- layout ---------------------------------------------------------------

  /** Signed shortest distance of card i from the centre, wrapping round the list. */
  private offset(i: number): number {
    const n = this.items.length;
    const half = Math.floor(n / 2);
    return ((i - this.index + n + half) % n) - half;
  }

  private layout(initial: boolean) {
    this.cards.forEach((card, i) => {
      const raw = this.offset(i);
      const d = Math.max(-2, Math.min(2, raw));
      card.toggleAttribute('data-far', Math.abs(raw) >= 2);
      // A card wrapping from one far side to the other should not fly across the stage.
      const wraps = !initial && Math.abs(d - this.prevD[i]) > 2;
      if (wraps) card.style.transition = 'none';
      card.style.setProperty('--d', String(d));
      card.style.setProperty('--ad', String(Math.abs(d)));
      card.style.zIndex = String(10 - Math.abs(d));
      card.classList.toggle('is-center', d === 0);
      card.toggleAttribute('data-side', d !== 0);
      card.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
      if (wraps) {
        void card.offsetWidth;
        card.style.transition = '';
      }
      this.prevD[i] = d;
    });
    this.dots.forEach((dot, i) => {
      dot.classList.toggle('is-on', i === this.index);
      if (i === this.index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    if (initial) this.setPlaying(false);
  }

  // ---- input ----------------------------------------------------------------

  private onKey = (e: KeyboardEvent) => {
    if (this.items.length < 2) return;
    if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'ArrowRight') this.step(1);
    else return;
    e.preventDefault();
  };

  private onDown = (e: PointerEvent) => {
    if (this.items.length < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.downX = e.clientX;
    this.downTarget = e.target as Element;
    this.tracking = true;
    window.addEventListener('pointerup', this.onUp, { once: true });
  };

  private onUp = (e: PointerEvent) => {
    if (!this.tracking) return;
    this.tracking = false;
    const dx = e.clientX - this.downX;
    if (Math.abs(dx) >= SWIPE_PX) {
      this.step(dx < 0 ? 1 : -1);
      return;
    }
    // A tap on a side card brings it to the centre.
    const card = this.downTarget?.closest('.car-card');
    const i = card ? this.cards.indexOf(card as HTMLElement) : -1;
    if (i >= 0) this.go(i);
  };
}
