import type { App, Screen } from '../../app';
import { GAIN_LIMIT, GAIN_STEP } from '../../audio/modes';
import { h, icon, ICONS } from '../dom';
import { GlassSlider } from '../slider';

export function createStepScreen(app: App, index: number): Screen {
  const { mode, engine } = app;
  const step = mode.steps[index];
  const total = mode.steps.length;
  const last = index === total - 1;

  const dots = h(
    'div',
    { class: 'dots', role: 'img', 'aria-label': `Step ${index + 1} of ${total}` },
    ...mode.steps.map((_, i) => h('span', { class: 'dot' + (i === index ? ' is-on' : i < index ? ' is-done' : '') })),
  );

  const playBtn = h('button', { class: 'btn-round btn-round-sm', type: 'button', onClick: () => void app.togglePlay() });
  const syncPlay = () => {
    playBtn.replaceChildren(icon(engine.playing ? ICONS.pause : ICONS.play));
    playBtn.setAttribute('aria-label', engine.playing ? 'Pause music' : 'Play music');
  };
  syncPlay();
  const unsub = engine.onChange(syncPlay);

  const zone = h('div', { class: 'slider-zone' });

  const back = h(
    'button',
    { class: 'btn btn-quiet', type: 'button', onClick: () => app.go(index === 0 ? { name: 'setup' } : { name: 'step', index: index - 1 }) },
    'Back',
  );
  const next = h(
    'button',
    { class: 'btn btn-quiet btn-next', type: 'button', onClick: () => app.go(last ? { name: 'result' } : { name: 'step', index: index + 1 }) },
    last ? 'See result' : 'Next',
  );

  const el = h(
    'section',
    { class: 'screen step', 'aria-label': `Step ${index + 1} of ${total}: ${step.name}` },
    h('header', { class: 'step-top' }, h('span', { class: 'spacer' }), dots, playBtn),
    h(
      'div',
      { class: 'step-copy rise' },
      h('p', { class: 'eyebrow' }, step.caption),
      h('h2', { class: 'question' }, step.question),
    ),
    zone,
    h('p', { class: 'step-hint rise' }, step.hint),
    h('footer', { class: 'step-nav' }, back, next),
  );

  const slider = new GlassSlider({
    dragArea: el,
    value: engine.values[index] ?? 0,
    min: -GAIN_LIMIT,
    max: GAIN_LIMIT,
    keyStep: GAIN_STEP,
    label: `${step.name}. ${step.lowLabel} to ${step.highLabel}`,
    valueText: (v) =>
      v === 0 ? 'neutral' : `${Math.abs(v).toFixed(1)} decibels, ${v > 0 ? step.highLabel : step.lowLabel}`,
    onInput: (v) => engine.setValue(index, v),
    onVisual: (n, touch) => app.ambient.setTone(n, touch),
  });
  zone.append(slider.el);

  return {
    el,
    enter() {
      slider.focus();
      app.announce(`Step ${index + 1} of ${total}. ${step.question}`);
    },
    destroy() {
      slider.destroy();
      unsub();
    },
  };
}
