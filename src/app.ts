import type { AudioEngine } from './audio/engine';
import type { ModeDef } from './audio/modes';
import type { Tracks } from './audio/tracks';
import type { Ambient } from './ui/ambient';

export type Route =
  | { name: 'welcome' }
  | { name: 'setup' }
  | { name: 'step'; index: number }
  | { name: 'result' }
  | { name: 'credits' };

export interface Screen {
  el: HTMLElement;
  /** Runs once the screen is in the page. */
  enter?(): void;
  destroy?(): void;
}

/** Everything a screen is allowed to touch. */
export interface App {
  mode: ModeDef;
  engine: AudioEngine;
  tracks: Tracks;
  ambient: Ambient;
  go(route: Route): void;
  /** Leaves the credits page and returns to the screen you came from. */
  back(): void;
  /** Loads the built-in track if nothing is loaded yet, then toggles playback. */
  togglePlay(): Promise<void>;
  /** Zero every step and drop any shared preset from the URL. */
  reset(): void;
  announce(text: string): void;
}
