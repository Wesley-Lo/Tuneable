import type { App, Screen } from '../../app';
import { apoText, buildExport, listRows, listText } from '../../export/apo';
import { shareUrl } from '../../export/share';
import { qrSvg } from '../../export/qr';
import { CurveView } from '../curve';
import { copyText, downloadText, flashLabel, h, icon, ICONS } from '../dom';

export function createResultScreen(app: App): Screen {
  const { engine, mode } = app;
  const values = [...engine.values];
  const data = buildExport(mode, values);
  const apo = apoText(data);
  const list = listText(data);
  const url = shareUrl(mode.id, values);

  // ---- curve and before/after ---------------------------------------------
  const curve = new CurveView(mode);

  const before = h('button', { class: 'seg-btn', type: 'button', 'aria-pressed': 'false' }, 'Before');
  const after = h('button', { class: 'seg-btn is-on', type: 'button', 'aria-pressed': 'true' }, 'After');
  const setBypass = (on: boolean) => {
    engine.setBypass(on);
    before.classList.toggle('is-on', on);
    after.classList.toggle('is-on', !on);
    before.setAttribute('aria-pressed', String(on));
    after.setAttribute('aria-pressed', String(!on));
    curve.update(values, on);
    app.announce(on ? 'Original sound, EQ off' : 'Your tuning, EQ on');
  };
  before.addEventListener('click', () => setBypass(true));
  after.addEventListener('click', () => setBypass(false));

  const playBtn = h('button', { class: 'btn-round', type: 'button', onClick: () => void app.togglePlay() });
  const syncPlay = () => {
    playBtn.replaceChildren(icon(engine.playing ? ICONS.pause : ICONS.play));
    playBtn.setAttribute('aria-label', engine.playing ? 'Pause music' : 'Play music');
    const bypassed = engine.bypass;
    before.classList.toggle('is-on', bypassed);
    after.classList.toggle('is-on', !bypassed);
  };
  syncPlay();
  const unsub = engine.onChange(syncPlay);

  // ---- exports ---------------------------------------------------------------
  const dlBtn = h('button', { class: 'btn btn-glass', type: 'button', onClick: () => downloadText('tuneable.txt', apo) }, 'Download .txt');
  const copyApo = h('button', { class: 'btn btn-glass', type: 'button' }, 'Copy to clipboard');
  copyApo.addEventListener('click', async () => flashLabel(copyApo, (await copyText(apo)) ? 'Copied' : 'Copy failed'));

  const rows = listRows(data);
  const table = h(
    'table',
    { class: 'band-table' },
    h('thead', {}, h('tr', {}, ...['Band', 'Type', 'Freq', 'Gain', 'Q'].map((t) => h('th', { scope: 'col' }, t)))),
    h(
      'tbody',
      {},
      ...rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.label), h('td', {}, r.type), h('td', {}, r.freq), h('td', {}, r.gain), h('td', {}, r.q))),
    ),
  );
  const copyList = h('button', { class: 'btn btn-quiet', type: 'button' }, 'Copy list');
  copyList.addEventListener('click', async () => flashLabel(copyList, (await copyText(list)) ? 'Copied' : 'Copy failed'));

  const copyLink = h('button', { class: 'btn btn-glass', type: 'button' }, 'Copy share link');
  copyLink.addEventListener('click', async () => flashLabel(copyLink, (await copyText(url)) ? 'Link copied' : 'Copy failed'));

  const qrHolder = h('div', { class: 'qr', hidden: true });
  const qrBtn = h('button', { class: 'btn btn-quiet', type: 'button', 'aria-expanded': 'false' }, 'Show QR code');
  qrBtn.addEventListener('click', () => {
    const show = qrHolder.hidden;
    if (show && !qrHolder.firstChild) {
      const svg = qrSvg(url);
      if (svg) qrHolder.innerHTML = svg; // generated locally from our own URL
      else qrHolder.textContent = 'The link is too long for a QR code.';
      qrHolder.append(h('p', { class: 'note' }, 'Scan with your phone to open this tuning there.'));
    }
    qrHolder.hidden = !show;
    qrBtn.setAttribute('aria-expanded', String(show));
    qrBtn.textContent = show ? 'Hide QR code' : 'Show QR code';
  });

  const again = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => app.reset() }, 'Tune again');

  const el = h(
    'section',
    { class: 'screen result scroll', 'aria-label': 'Your result' },
    h(
      'div',
      { class: 'result-col' },
      h(
        'header',
        { class: 'rise' },
        h('p', { class: 'eyebrow' }, mode.name),
        h('h2', { class: 'title' }, data.filters.length ? 'Here is your sound.' : 'Your sound is already flat.'),
      ),
      h('div', { class: 'glass curve-card rise' }, curve.el),
      h(
        'div',
        { class: 'compare rise' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Compare' }, before, after),
        playBtn,
      ),
      h(
        'p',
        { class: 'note center-text' },
        'Press play, then flip Before and After. This page can only change sound played here. Export your tuning to use it everywhere.',
      ),

      h(
        'section',
        { class: 'block', 'aria-labelledby': 'h-export' },
        h('h3', { id: 'h-export' }, 'Take it with you'),
        h('div', { class: 'btn-row' }, dlBtn, copyApo),
        h(
          'p',
          { class: 'note' },
          'Equalizer APO: save the file in the config folder of your Equalizer APO install, then add the line Include: tuneable.txt to config.txt. Peace: use its Import option, or paste the lines into the APO config.',
        ),
      ),

      h(
        'section',
        { class: 'block', 'aria-labelledby': 'h-list' },
        h('h3', { id: 'h-list' }, 'Every band, in plain numbers'),
        h('div', { class: 'table-wrap' }, table),
        h('div', { class: 'btn-row' }, copyList),
        h(
          'p',
          { class: 'note' },
          'Phone EQ apps such as Wavelet or Poweramp will need these values entered by hand for now.',
        ),
      ),

      h(
        'section',
        { class: 'block', 'aria-labelledby': 'h-share' },
        h('h3', { id: 'h-share' }, 'Share this tuning'),
        h('div', { class: 'btn-row' }, copyLink, qrBtn),
        qrHolder,
      ),

      h('div', { class: 'again' }, again),
    ),
  );

  return {
    el,
    enter() {
      curve.update(values, false, false);
      engine.setBypass(false);
      (el.querySelector('h2') as HTMLElement | null)?.setAttribute('tabindex', '-1');
    },
    destroy() {
      unsub();
      curve.destroy();
      engine.setBypass(false);
    },
  };
}
