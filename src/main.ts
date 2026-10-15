import '@fontsource-variable/inter';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/index.css';

import type { App, Route, Screen } from './app';
import { AudioEngine } from './audio/engine';
import { getMode } from './audio/modes';
import { Tracks } from './audio/tracks';
import { encodeHash, decodeHash } from './export/share';
import { Ambient } from './ui/ambient';
import { h } from './ui/dom';
import { prefersReducedMotion } from './ui/dom';
import { createCreditsScreen } from './ui/screens/credits';
import { createResultScreen } from './ui/screens/result';
import { createSetupScreen } from './ui/screens/setup';
import { createStepScreen } from './ui/screens/step';
import { createWelcomeScreen } from './ui/screens/welcome';

const root = document.getElementById('app')!;
root.querySelector('noscript')?.remove();

const mode = getMode(null);
const engine = new AudioEngine(mode);
const tracks = new Tracks(engine);
const ambient = new Ambient(root);

const stage = h('main', { class: 'stage' });
const live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
root.append(stage, live);

// ---- routing and transitions -------------------------------------------------

const order = (r: Route) =>
  r.name === 'welcome' ? 0 : r.name === 'setup' ? 1 : r.name === 'step' ? 2 + r.index : r.name === 'result' ? 2 + mode.steps.length : 99;

let currentRoute: Route | null = null;
let current: Screen | null = null;
/** Where the credits page returns to. */
let returnTo: Route = { name: 'welcome' };

function create(route: Route): Screen {
  switch (route.name) {
    case 'welcome':
      return createWelcomeScreen(app);
    case 'setup':
      return createSetupScreen(app);
    case 'step':
      return createStepScreen(app, route.index);
    case 'result':
      return createResultScreen(app);
    case 'credits':
      return createCreditsScreen(app);
  }
}

function go(route: Route) {
  if (route.name === 'credits' && currentRoute && currentRoute.name !== 'credits') returnTo = currentRoute;
  const forward = currentRoute ? order(route) >= order(currentRoute) : true;
  const next = create(route);
  const prev = current;
  currentRoute = route;
  current = next;

  next.el.classList.add('is-entering', forward ? 'from-below' : 'from-above');
  stage.append(next.el);

  if (prev) {
    prev.destroy?.();
    prev.el.classList.add('is-leaving', forward ? 'to-above' : 'to-below');
    prev.el.setAttribute('inert', '');
    const remove = () => prev.el.remove();
    prev.el.addEventListener('transitionend', remove, { once: true });
    window.setTimeout(remove, 900);
  }

  // Two frames so the browser registers the starting state before it animates.
  // The timeout covers pages where rAF is paused (background tabs, hidden panes).
  let entered = false;
  const enter = () => {
    if (entered) return;
    entered = true;
    next.el.classList.remove('is-entering');
    next.enter?.();
  };
  requestAnimationFrame(() => requestAnimationFrame(enter));
  window.setTimeout(enter, 120);

  if (route.name !== 'step') ambient.setTone(0, 0);

  // Keep the URL in step with the result so a refresh or a copied address keeps it.
  if (route.name === 'result') {
    history.replaceState(null, '', location.pathname + location.search + encodeHash(mode.id, engine.values));
  } else if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

// ---- app object --------------------------------------------------------------

const app: App = {
  mode,
  engine,
  tracks,
  ambient,
  go,
  back() {
    go(returnTo);
  },
  async togglePlay() {
    try {
      if (!tracks.current) await tracks.useBuiltIn();
      await engine.toggle();
    } catch {
      /* playback was blocked or the file failed; the play button simply stays idle */
    }
  },
  reset() {
    engine.setBypass(false);
    engine.setValues(mode.steps.map(() => 0));
    go({ name: 'step', index: 0 });
  },
  announce(text) {
    live.textContent = '';
    window.setTimeout(() => (live.textContent = text), 50);
  },
};

// ---- boot ------------------------------------------------------------------

function applyShared(): boolean {
  const shared = decodeHash(location.hash);
  if (!shared) return false;
  engine.setValues(shared.values);
  return true;
}

window.addEventListener('hashchange', () => {
  // Someone pasted a share link while the page was open.
  if (currentRoute?.name !== 'result' && applyShared()) go({ name: 'result' });
  else if (currentRoute?.name === 'result') {
    const shared = decodeHash(location.hash);
    if (shared && shared.values.join() !== engine.values.join()) {
      engine.setValues(shared.values);
      go({ name: 'result' });
    }
  }
});

if (prefersReducedMotion()) root.classList.add('reduce-motion');

go(applyShared() ? { name: 'result' } : { name: 'welcome' });

// Handy for poking at the audio graph from the console while developing.
if (import.meta.env.DEV) (window as any).__tuneable = { engine, tracks };
