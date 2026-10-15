import { LIBRARY } from '../audio/library';
import { h } from './dom';

export const CONTACT_EMAIL = 'wlo6892@gmail.com';

export function joinNames(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const unique = (items: string[]) => [...new Set(items)];

/**
 * Development notice, a short music attribution with a link to the full credits page,
 * and contact details. Shown at the bottom of the longer screens.
 */
export function siteFooter(onCredits: () => void): HTMLElement {
  const licensed = LIBRARY.filter((t) => t.license);
  const unlicensed = LIBRARY.filter((t) => !t.license);

  const artists = joinNames(unique(licensed.map((t) => t.artist)));
  const licences = joinNames(unique(licensed.map((t) => t.license!.short)));
  const attribution = licensed.length ? `Music by ${artists}, licensed under ${licences}. ` : '';

  // Anything without an open licence is treated as a copyrighted work.
  const copyrighted = unlicensed.length
    ? h(
        'p',
        {},
        `${joinNames(unlicensed.map((t) => `“${t.title}” by ${t.artist}`))} ` +
          'are copyrighted works. All rights and credit belong to the artists and their labels. Tuneable is not affiliated with them.',
      )
    : null;

  return h(
    'footer',
    { class: 'site-footer' },
    h('p', {}, 'Tuneable is still in development, so things may change or break.'),
    copyrighted,
    h(
      'p',
      {},
      attribution,
      h('button', { class: 'link-btn', type: 'button', onClick: onCredits }, 'Music credits'),
    ),
    h('p', {}, 'Contact: ', h('a', { href: `mailto:${CONTACT_EMAIL}` }, CONTACT_EMAIL)),
  );
}
