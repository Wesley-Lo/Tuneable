import type { App, Screen } from '../../app';
import { h } from '../dom';

export function createWelcomeScreen(app: App): Screen {
  const start = h(
    'button',
    {
      class: 'btn btn-glass btn-lg',
      type: 'button',
      onClick: async () => {
        // Browsers only allow audio after a gesture, so the context is unlocked here.
        await app.engine.unlock();
        app.go({ name: 'setup' });
      },
    },
    'Start tuning',
  );

  const el = h(
    'section',
    { class: 'screen welcome center', 'aria-label': 'Welcome' },
    h(
      'div',
      { class: 'stack rise' },
      h('p', { class: 'eyebrow' }, 'Tuneable'),
      h('h1', { class: 'display' }, 'Tune your sound ', h('em', {}, 'by ear.')),
      h('p', { class: 'lede' }, 'Five quick steps, one slider, and a preset you can take anywhere.'),
      start,
      h('p', { class: 'note' }, 'Use headphones. Set your volume to a comfortable level and leave it there.'),
    ),
  );

  return { el };
}
