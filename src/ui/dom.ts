type Child = Node | string | null | undefined | false;
type Attrs = Record<string, unknown>;

function apply(el: Element, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else el.setAttribute(k, v === true ? '' : String(v));
  }
}

/** Tiny element builder. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs);
  for (const c of children) if (c) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Static SVG icon markup (constants only, never user input). */
export function icon(markup: string, cls = 'icon'): SVGSVGElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

export const ICONS = {
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none"/>',
  note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
};

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and non secure contexts
    const ta = h('textarea', { 'aria-hidden': 'true', readonly: true });
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Briefly swap a button's label, then restore it. */
export function flashLabel(btn: HTMLElement, text: string, ms = 1600) {
  const original = btn.dataset.label ?? btn.textContent ?? '';
  btn.dataset.label = original;
  btn.textContent = text;
  window.setTimeout(() => (btn.textContent = original), ms);
}
