import { h, prefersReducedMotion } from './dom';

export interface SliderOptions {
  /** Pointer events are listened to here. Usually the whole screen. */
  dragArea: HTMLElement;
  value: number;
  min: number;
  max: number;
  /** Keyboard step in dB. */
  keyStep: number;
  label: string;
  valueText(v: number): string;
  onInput(v: number): void;
  /** Called every painted frame with the displayed position (-1..1) and touch amount (0..1). */
  onVisual?(norm: number, touch: number): void;
}

/** Width of the soft detent around 0 dB, in dB of finger travel. */
const SNAP = 0.4;
const LONG_PRESS_MS = 550;
/** Distance from the pill's ends to the knob's centre at full travel, in px. */
const KNOB_INSET = 26;

/**
 * The glass slider. It looks like a thin frosted pill, but the whole screen is the
 * drag target and movement is relative, so nobody has to aim at anything.
 */
export class GlassSlider {
  readonly el: HTMLElement;
  private track: HTMLElement;
  private fillUp: HTMLElement;
  private fillDown: HTMLElement;
  private knob: HTMLElement;
  private readout: HTMLElement;

  private raw: number; // finger position in dB, before the detent
  private value: number; // where the slider is heading (the target)
  private shown: number; // eased value used for painting, and what the audio follows
  private emitted: number; // last value handed to onInput
  private touch = 0;
  private active = false;
  private holdTimer = 0;
  private pulseTimer = 0;
  private pointerId: number | null = null;
  private downY = 0;
  private zipping = false;
  private frame = 0;
  private trackH = 400;
  private travel = 180;
  private reduced = prefersReducedMotion();
  private ro: ResizeObserver;

  constructor(private o: SliderOptions) {
    this.value = this.quantize(o.value);
    this.raw = this.unsnap(this.value);
    this.shown = this.value;
    this.emitted = this.value;

    this.fillUp = h('div', { class: 'fill fill-up' });
    this.fillDown = h('div', { class: 'fill fill-down' });
    this.track = h('div', { class: 'track' }, this.fillUp, this.fillDown, h('div', { class: 'zero' }));
    this.knob = h('div', { class: 'knob' });
    this.readout = h('div', { class: 'readout', 'aria-hidden': 'true' });
    this.el = h(
      'div',
      {
        class: 'slider',
        role: 'slider',
        tabindex: '0',
        'aria-orientation': 'vertical',
        'aria-label': o.label,
        'aria-valuemin': o.min,
        'aria-valuemax': o.max,
      },
      this.readout,
      this.track,
      this.knob,
    );
    this.syncAria();

    const area = o.dragArea;
    area.addEventListener('pointerdown', this.onDown);
    area.addEventListener('pointermove', this.onMove);
    area.addEventListener('pointerup', this.onUp);
    area.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);

    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(this.track);
    this.paint();
  }

  focus() {
    this.el.focus({ preventScroll: true });
  }

  destroy() {
    const area = this.o.dragArea;
    area.removeEventListener('pointerdown', this.onDown);
    area.removeEventListener('pointermove', this.onMove);
    area.removeEventListener('pointerup', this.onUp);
    area.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    this.ro.disconnect();
    cancelAnimationFrame(this.frame);
    // If you leave mid-glide, make sure the audio still lands on the final value.
    if (this.emitted !== this.value) this.o.onInput(this.value);
    window.clearTimeout(this.holdTimer);
    window.clearTimeout(this.pulseTimer);
  }

  // ---- value mapping -------------------------------------------------------

  private get span() {
    return this.o.max;
  }

  /** Finger position -> value, with a soft detent that ends smoothly (no jump). */
  private snap(raw: number): number {
    const a = Math.abs(raw);
    if (a <= SNAP) return 0;
    return Math.sign(raw) * ((a - SNAP) * this.span) / (this.span - SNAP);
  }

  private unsnap(v: number): number {
    if (v === 0) return 0;
    return Math.sign(v) * (Math.abs(v) * (this.span - SNAP) / this.span + SNAP);
  }

  private quantize(v: number): number {
    const c = Math.max(this.o.min, Math.min(this.o.max, v));
    return Math.round(c * 10) / 10 || 0;
  }

  private commit(next: number) {
    next = this.quantize(next);
    if (next === this.value) return;
    const crossed = (next === 0) !== (this.value === 0);
    this.value = next;
    if (crossed) this.detentFeedback();
    this.syncAria();
    if (this.readout.classList.contains('is-on')) this.updateReadout();
    this.kick();
  }

  /** Programmatic update (no onInput). Jumps straight there. */
  setValue(v: number) {
    this.value = this.quantize(v);
    this.shown = this.value;
    this.emitted = this.value;
    this.raw = this.unsnap(this.value);
    this.syncAria();
    this.kick();
  }

  // ---- pointer -------------------------------------------------------------

  private onDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element).closest('button, a, input, label, summary, [data-nodrag]')) return;
    this.pointerId = e.pointerId;
    try {
      this.o.dragArea.setPointerCapture(e.pointerId);
    } catch {
      /* capture can fail for synthetic events; dragging still works while over the area */
    }
    this.downY = e.clientY;
    this.active = true;
    // The slider zips to wherever the finger landed, then follows it.
    this.zipping = true;
    this.moveTo(e.clientY);
    this.focus();
    window.clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => this.showReadout(), LONG_PRESS_MS);
    this.kick();
    e.preventDefault();
  };

  /**
   * Maps a pointer height to a value. The knob sits under the finger: the top end of
   * the pill is the maximum, the bottom end the minimum, the middle is 0 dB. Pressing
   * above or below the pill (the whole screen is the drag area) clamps to the end.
   */
  private moveTo(clientY: number) {
    const r = this.track.getBoundingClientRect();
    const half = Math.max(1, r.height / 2 - KNOB_INSET);
    const mid = r.top + r.height / 2;
    this.raw = Math.max(-this.span, Math.min(this.span, ((mid - clientY) / half) * this.span));
    this.commit(this.snap(this.raw));
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    if (Math.abs(e.clientY - this.downY) > 8) window.clearTimeout(this.holdTimer);
    this.moveTo(e.clientY);
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.active = false;
    this.zipping = false;
    window.clearTimeout(this.holdTimer);
    this.readout.classList.remove('is-on');
    try {
      this.o.dragArea.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    this.kick();
  };

  // ---- keyboard ------------------------------------------------------------

  private onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest('input, textarea, select')) return;
    let next: number | null = null;
    const step = this.o.keyStep;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = this.value + step;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = this.value - step;
        break;
      case 'PageUp':
        next = this.value + step * 4;
        break;
      case 'PageDown':
        next = this.value - step * 4;
        break;
      case 'Home':
        next = this.o.min;
        break;
      case 'End':
        next = this.o.max;
        break;
      case '0':
        next = 0;
        break;
    }
    if (next === null) return;
    e.preventDefault();
    this.raw = this.unsnap(this.quantize(next));
    this.commit(next);
    this.pulse();
  };

  /** Light up the slider briefly, for keyboard use. */
  private pulse() {
    this.touch = Math.max(this.touch, 0.7);
    window.clearTimeout(this.pulseTimer);
    this.active = true;
    this.pulseTimer = window.setTimeout(() => {
      if (this.pointerId === null) this.active = false;
      this.kick();
    }, 700);
    this.kick();
  }

  // ---- feedback ------------------------------------------------------------

  private detentFeedback() {
    this.el.classList.remove('is-snap');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add('is-snap');
    try {
      navigator.vibrate?.(6);
    } catch {
      /* not supported */
    }
  }

  private showReadout() {
    this.readout.classList.add('is-on');
    this.updateReadout();
  }

  private updateReadout() {
    const v = this.value;
    this.readout.textContent = `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
  }

  private syncAria() {
    this.el.setAttribute('aria-valuenow', String(this.value));
    this.el.setAttribute('aria-valuetext', this.o.valueText(this.value));
  }

  // ---- painting ------------------------------------------------------------

  private measure() {
    this.trackH = this.track.getBoundingClientRect().height || this.trackH;
    this.travel = Math.max(0, this.trackH / 2 - KNOB_INSET);
    this.paint();
  }

  private kick() {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.frame = 0;
    // Eases toward the target. After the initial zip it follows the finger more tightly.
    if (this.zipping && Math.abs(this.value - this.shown) < 0.4) this.zipping = false;
    const k = this.reduced ? 1 : this.active && !this.zipping ? 0.42 : 0.2;
    this.shown += (this.value - this.shown) * k;
    if (Math.abs(this.value - this.shown) < 0.005) this.shown = this.value;
    // The audio follows the eased position, so a zip is a quick sweep, not a jump.
    const heard = this.quantize(this.shown);
    if (heard !== this.emitted) {
      this.emitted = heard;
      this.o.onInput(heard);
    }
    const target = this.active ? 1 : 0;
    this.touch += (target - this.touch) * (this.reduced ? 1 : 0.16);
    if (Math.abs(target - this.touch) < 0.01) this.touch = target;
    this.paint();
    if (this.shown !== this.value || this.touch !== target) this.kick();
  };

  private paint() {
    const n = this.shown / this.o.max;
    this.fillUp.style.transform = `scaleY(${Math.max(0, n).toFixed(4)})`;
    this.fillDown.style.transform = `scaleY(${Math.max(0, -n).toFixed(4)})`;
    this.knob.style.transform = `translate3d(-50%, calc(-50% + ${(-n * this.travel).toFixed(2)}px), 0) scale(${(0.55 + 0.45 * this.touch).toFixed(3)})`;
    this.el.style.setProperty('--touch', this.touch.toFixed(3));
    this.el.style.setProperty('--n', n.toFixed(3));
    this.o.onVisual?.(n, this.touch);
  }
}
