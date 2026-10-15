import type { App, Screen } from '../../app';
import { Carousel } from '../carousel';
import { h, icon, ICONS } from '../dom';

const NOTICE_KEY = 'tuneable:volume-notice';

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}
function markNoticeSeen() {
  try {
    localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    /* storage can be blocked; the notice just shows again next time */
  }
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

type View = 'choice' | 'builtin' | 'own';

export function createSetupScreen(app: App): Screen {
  const { engine, tracks } = app;
  let disposed = false;
  let view: View = 'choice';
  let loading = false;
  let loadToken = 0;
  let debounce = 0;
  let carousel: Carousel | null = null;
  let carouselStarted = false;

  // ---- shared pieces -------------------------------------------------------

  const continueBtn = h(
    'button',
    { class: 'btn btn-glass', type: 'button', hidden: true, disabled: true, onClick: () => app.go({ name: 'step', index: 0 }) },
    'Continue',
  );

  /** Play button plus the name of what is loaded. */
  function makePlayer() {
    const btn = h('button', {
      class: 'btn-round',
      type: 'button',
      'aria-label': 'Play music',
      disabled: true,
      onClick: () => void app.togglePlay(),
    });
    const name = h('span', { class: 'ts-title' });
    const sub = h('span', { class: 'ts-sub' });
    const status = h('p', { class: 'track-status', 'aria-live': 'polite' }, name, sub);
    const el = h('div', { class: 'player glass' }, btn, status);
    return {
      el,
      btn,
      set(title: string, detail = '', error = false) {
        name.textContent = title;
        sub.textContent = detail;
        status.classList.toggle('is-error', error);
      },
    };
  }
  const builtinPlayer = makePlayer();
  const ownPlayer = makePlayer();
  ownPlayer.el.hidden = true;

  const syncPlay = () => {
    for (const p of [builtinPlayer, ownPlayer]) {
      p.btn.replaceChildren(icon(engine.playing ? ICONS.pause : ICONS.play));
      p.btn.setAttribute('aria-label', engine.playing ? 'Pause music' : 'Play music');
      p.btn.classList.toggle('is-playing', engine.playing);
    }
    carousel?.setPlaying(engine.playing && tracks.current?.kind === 'builtin');
  };

  const syncContinue = () => {
    const kind = tracks.current?.kind;
    const ready = !loading && ((view === 'builtin' && kind === 'builtin') || (view === 'own' && kind === 'file'));
    continueBtn.hidden = view === 'choice';
    continueBtn.disabled = !ready;
  };

  // ---- view 1: choose a source ---------------------------------------------

  function sourceCard(iconMarkup: string, title: string, sub: string, onClick: () => void) {
    const card = h(
      'button',
      { class: 'source-card', type: 'button', onClick },
      h('span', { class: 'sc-halo', 'aria-hidden': 'true' }),
      h('span', { class: 'sc-icon' }, icon(iconMarkup)),
      h('span', { class: 'sc-text' }, h('span', { class: 'sc-title' }, title), h('span', { class: 'sc-sub' }, sub)),
      h('span', { class: 'sc-go', 'aria-hidden': 'true' }, icon(ICONS.arrow)),
    );
    // A soft spotlight that follows the pointer across the card.
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    return card;
  }

  const choiceView = h(
    'div',
    { class: 'view view-choice' },
    h('h2', { class: 'title' }, 'Pick something you know well.'),
    h(
      'div',
      { class: 'source-cards' },
      sourceCard(ICONS.note, 'Built-in tracks', 'Choose from our songs', () => setView('builtin', true)),
      sourceCard(ICONS.upload, 'Use my own music', 'Play a file from your device', () => setView('own', true)),
    ),
  );

  // ---- view 2: built-in songs ----------------------------------------------

  const carouselHost = h('div', { class: 'car-host' }, h('p', { class: 'note' }, 'Loading tracks'));
  const backBtn = (label: string) =>
    h('button', { class: 'btn btn-quiet back', type: 'button', onClick: () => setView('choice', false) }, icon(ICONS.back), label);

  const builtinView = h(
    'div',
    { class: 'view view-builtin' },
    h('div', { class: 'view-head' }, backBtn('Change source')),
    h('h2', { class: 'title' }, 'Pick a track.'),
    carouselHost,
    builtinPlayer.el,
  );

  function beginLoad() {
    loading = true;
    builtinPlayer.btn.disabled = true;
    builtinPlayer.set('Loading', '');
    syncContinue();
  }

  async function selectIndex(i: number) {
    const token = ++loadToken;
    beginLoad();
    try {
      const t = await tracks.useLibrary(i);
      if (token !== loadToken || disposed) return;
      loading = false;
      builtinPlayer.set(t.title, t.artist);
      builtinPlayer.btn.disabled = false;
    } catch (err) {
      if (token !== loadToken || disposed || isAbort(err)) return;
      loading = false;
      builtinPlayer.set('Could not load that track.', 'Try another one, or use your own music.', true);
    }
    syncPlay();
    syncContinue();
  }

  async function openBuiltin() {
    if (carousel) {
      // Coming back to this menu: make sure the song in the middle is the one loaded.
      if (tracks.current?.kind !== 'builtin' || tracks.current.index !== carousel.current) void selectIndex(carousel.current);
      return;
    }
    if (carouselStarted) return;
    carouselStarted = true;
    try {
      const items = await tracks.library();
      if (disposed) return;
      const start = tracks.current?.kind === 'builtin' ? tracks.current.index : tracks.libraryIndex;
      carousel = new Carousel(items, start, (i) => {
        // Wait a beat so flicking through several songs only loads the one you stop on.
        beginLoad();
        window.clearTimeout(debounce);
        debounce = window.setTimeout(() => void selectIndex(i), 220);
      });
      carouselHost.replaceChildren(carousel.el);
      if (tracks.current?.kind === 'builtin' && tracks.current.index === carousel.current) {
        builtinPlayer.set(tracks.current.title, tracks.current.artist);
        builtinPlayer.btn.disabled = false;
        syncPlay();
        syncContinue();
      } else {
        void selectIndex(carousel.current);
      }
    } catch {
      carouselHost.replaceChildren(h('p', { class: 'note' }, 'Could not load the built-in tracks. Try your own music.'));
    }
  }

  // ---- view 3: your own music ----------------------------------------------

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i.test(file.name)) {
      ownPlayer.el.hidden = false;
      ownPlayer.set('That is not an audio file.', 'Try an MP3, M4A, WAV, or OGG file.', true);
      return;
    }
    const token = ++loadToken;
    loading = true;
    ownPlayer.el.hidden = false;
    ownPlayer.btn.disabled = true;
    ownPlayer.set('Loading your file', '');
    syncContinue();
    try {
      const t = await tracks.useFile(file);
      if (token !== loadToken || disposed) return;
      loading = false;
      ownPlayer.set(t.title, 'Played from your device only');
      ownPlayer.btn.disabled = false;
    } catch (err) {
      if (token !== loadToken || disposed || isAbort(err)) return;
      loading = false;
      ownPlayer.set('That file could not be played.', 'Try another one.', true);
      ownPlayer.btn.disabled = tracks.current?.kind !== 'file';
    }
    syncPlay();
    syncContinue();
  }

  const fileInput = h('input', { type: 'file', accept: 'audio/*', class: 'sr-only' });
  fileInput.addEventListener('change', () => {
    void loadFile(fileInput.files?.[0]);
    fileInput.value = '';
  });
  const dropzone = h(
    'label',
    { class: 'dropzone' },
    h('span', { class: 'dz-icon' }, icon(ICONS.upload)),
    h('span', { class: 'dz-title' }, 'Choose a file'),
    h('span', { class: 'dz-sub' }, 'or drop one here'),
    fileInput,
  );
  for (const ev of ['dragenter', 'dragover'] as const) {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-over');
    });
  }
  for (const ev of ['dragleave', 'dragend'] as const) {
    dropzone.addEventListener(ev, () => dropzone.classList.remove('is-over'));
  }
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-over');
    void loadFile(e.dataTransfer?.files?.[0]);
  });

  const ownView = h(
    'div',
    { class: 'view view-own' },
    h('div', { class: 'view-head' }, backBtn('Change source')),
    h('h2', { class: 'title' }, 'Bring your own music.'),
    dropzone,
    ownPlayer.el,
  );

  function syncOwn() {
    if (tracks.current?.kind === 'file') {
      ownPlayer.el.hidden = false;
      ownPlayer.set(tracks.current.title, 'Played from your device only');
      ownPlayer.btn.disabled = false;
    }
  }

  // ---- switching views -----------------------------------------------------

  const views = h('div', { class: 'views' });
  const viewEls: Record<View, HTMLElement> = { choice: choiceView, builtin: builtinView, own: ownView };
  let active: HTMLElement | null = null;

  function mount(next: HTMLElement, forward: boolean) {
    const prev = active;
    active = next;
    next.classList.remove('is-leaving', 'to-left', 'to-right');
    next.removeAttribute('inert');
    next.classList.add('is-entering', forward ? 'from-right' : 'from-left');
    views.append(next);

    if (prev && prev !== next) {
      prev.classList.add('is-leaving', forward ? 'to-left' : 'to-right');
      prev.setAttribute('inert', '');
      window.setTimeout(() => {
        if (prev !== active) prev.remove();
      }, 500);
    }

    let entered = false;
    const enter = () => {
      if (entered) return;
      entered = true;
      next.classList.remove('is-entering', 'from-right', 'from-left');
    };
    requestAnimationFrame(() => requestAnimationFrame(enter));
    window.setTimeout(enter, 80);
  }

  function setView(next: View, forward: boolean, announce = true) {
    view = next;
    mount(viewEls[next], forward);
    if (next === 'builtin') void openBuiltin();
    if (next === 'own') syncOwn();
    syncContinue();
    if (announce) {
      app.announce(next === 'choice' ? 'Choose a music source' : next === 'builtin' ? 'Built-in tracks' : 'Use your own music');
    }
  }

  // ---- hearing notice and tip ----------------------------------------------

  let notice: HTMLElement | null = null;
  if (!noticeSeen()) {
    notice = h(
      'div',
      { class: 'notice glass', role: 'note' },
      h('p', {}, 'Protect your hearing. Start quiet, raise the volume until it is comfortable, then leave it there.'),
      h(
        'button',
        {
          class: 'btn btn-quiet',
          type: 'button',
          onClick: () => {
            markNoticeSeen();
            notice?.remove();
          },
        },
        'Got it',
      ),
    );
  }

  const el = h(
    'section',
    { class: 'screen setup center scroll', 'aria-label': 'Choose music' },
    h(
      'div',
      { class: 'stack rise' },
      h('p', { class: 'eyebrow' }, 'Setup'),
      views,
      h('p', { class: 'tip' }, 'Make sure your headphones or ear tips fit snugly. A poor seal removes bass.'),
      notice,
      continueBtn,
    ),
  );

  const unsub = engine.onChange(syncPlay);
  syncPlay();

  // Reopen the menu you were last in when coming back from the tuning steps.
  const current = tracks.current;
  setView(current ? (current.kind === 'file' ? 'own' : 'builtin') : 'choice', true, false);

  return {
    el,
    destroy() {
      disposed = true;
      unsub();
      window.clearTimeout(debounce);
      carousel?.destroy();
    },
  };
}
