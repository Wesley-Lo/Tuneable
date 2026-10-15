import type { AudioEngine } from './engine';
import { renderDemoTrack } from './demo';
import { LIBRARY } from './library';

export interface TrackInfo {
  title: string;
  artist: string;
  kind: 'builtin' | 'file';
  /** Position in the built-in list, or -1 for a file from the user's device. */
  index: number;
}

/** A built-in song, ready to show in the carousel. */
export interface LibraryItem {
  title: string;
  artist: string;
  /** Hue (degrees) for the card artwork, derived from the title. */
  hue: number;
  /** Missing for the generated demo track, which is rendered on demand. */
  url?: string;
}

async function audioExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    // Dev servers answer unknown paths with index.html, so check the type too.
    return res.ok && (type.startsWith('audio/') || type === 'application/octet-stream');
  } catch {
    return false;
  }
}

/** Stable pseudo random hue between blue and pink, so each song gets its own colour. */
function hueFor(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return 205 + (hash % 140);
}

/**
 * Owns which track is loaded. Music is only ever played from the bundled files or a
 * local object URL. Nothing is uploaded anywhere.
 */
export class Tracks {
  current: TrackInfo | null = null;
  /** Last built-in song picked, so the carousel reopens where you left it. */
  libraryIndex = 0;

  private items: Promise<LibraryItem[]> | null = null;
  private demoUrl: Promise<string> | null = null;
  private fileUrl: string | null = null;

  constructor(private engine: AudioEngine) {}

  /** The built-in songs whose files actually exist. Never empty. */
  library(): Promise<LibraryItem[]> {
    if (!this.items) {
      this.items = (async () => {
        const base = import.meta.env.BASE_URL + 'audio/';
        const urls = LIBRARY.map((t) => base + encodeURI(t.file));
        const exists = await Promise.all(urls.map(audioExists));
        const found: LibraryItem[] = [];
        LIBRARY.forEach((t, i) => {
          if (exists[i]) found.push({ title: t.title, artist: t.artist, hue: hueFor(t.title), url: urls[i] });
        });
        if (found.length) return found;
        return [{ title: 'Tuneable demo track', artist: 'Generated in your browser', hue: hueFor('demo') }];
      })();
    }
    return this.items;
  }

  async useLibrary(index: number): Promise<TrackInfo> {
    const items = await this.library();
    const i = Math.max(0, Math.min(items.length - 1, index));
    const item = items[i];
    let url = item.url;
    if (!url) {
      if (!this.demoUrl) this.demoUrl = renderDemoTrack();
      url = await this.demoUrl;
    }
    await this.engine.loadUrl(url);
    this.libraryIndex = i;
    this.current = { title: item.title, artist: item.artist, kind: 'builtin', index: i };
    this.revokeFile();
    return this.current;
  }

  /** Loads whichever built-in song was picked last (the first one by default). */
  useBuiltIn(): Promise<TrackInfo> {
    return this.useLibrary(this.libraryIndex);
  }

  async useFile(file: File): Promise<TrackInfo> {
    const url = URL.createObjectURL(file);
    try {
      await this.engine.loadUrl(url);
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
    this.revokeFile();
    this.fileUrl = url;
    this.current = { title: file.name.replace(/\.[^.]+$/, ''), artist: 'Your music', kind: 'file', index: -1 };
    return this.current;
  }

  private revokeFile() {
    if (this.fileUrl && this.engine.el.src !== this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
      this.fileUrl = null;
    }
  }
}
