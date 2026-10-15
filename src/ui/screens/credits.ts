import type { App, Screen } from '../../app';
import { LIBRARY, type LibraryTrack } from '../../audio/library';
import { h, icon, ICONS } from '../dom';
import { CONTACT_EMAIL, joinNames } from '../footer';
import { wordmark } from '../wordmark';

const link = (l: { name: string; url: string }, label = l.name) =>
  h('a', { href: l.url, rel: 'noopener', target: '_blank' }, label);

function trackCard(t: LibraryTrack): HTMLElement {
  const lines = [h('p', { class: 'cr-artist' }, t.artist)];
  if (t.source) lines.push(h('p', { class: 'cr-line' }, 'Source: ', link(t.source)));
  if (t.license) lines.push(h('p', { class: 'cr-line' }, 'Licensed under ', link(t.license)));
  else lines.push(h('p', { class: 'cr-line' }, 'Copyrighted work. All rights belong to the artist and their label.'));
  return h('li', { class: 'cr-card glass' }, h('h3', { class: 'cr-title' }, t.title), ...lines);
}

/** A page of its own for music credits, so the licence terms are easy to find and read. */
export function createCreditsScreen(app: App): Screen {
  const back = h(
    'button',
    { class: 'btn btn-quiet back', type: 'button', onClick: () => app.back() },
    icon(ICONS.back),
    'Back',
  );

  const artists = joinNames([...new Set(LIBRARY.map((t) => t.artist))]);

  const el = h(
    'section',
    { class: 'screen credits scroll', 'aria-label': 'Music credits' },
    wordmark(),
    h(
      'div',
      { class: 'credits-col' },
      h('div', { class: 'view-head' }, back),
      h(
        'header',
        {},
        h('p', { class: 'eyebrow' }, 'Credits'),
        h('h2', { class: 'title' }, 'Music credits.'),
        h(
          'p',
          { class: 'lede' },
          LIBRARY.length
            ? `Thank you to ${artists} for making this music available. These tracks are used under the licences below.`
            : 'Tuneable has no built-in music right now. Music you choose yourself stays on your device.',
        ),
      ),
      LIBRARY.length ? h('ul', { class: 'cr-list' }, ...LIBRARY.map(trackCard)) : null,
      LIBRARY.some((t) => t.license)
        ? h(
            'p',
            { class: 'note' },
            'Tuneable applies an equaliser to these tracks in your browser while you tune. No other changes are made, and the audio is never uploaded or recorded.',
          )
        : null,
      h(
        'p',
        { class: 'note' },
        'Music you choose yourself is played from your device only. Questions about credits or licences? ',
        h('a', { href: `mailto:${CONTACT_EMAIL}` }, CONTACT_EMAIL),
        '.',
      ),
    ),
  );

  return {
    el,
    enter() {
      app.announce('Music credits');
    },
  };
}
