/**
 * The built-in songs people can cycle through on the setup screen.
 *
 * To add a song:
 *   1. Copy the audio file into public/audio/ (MP3 works everywhere).
 *   2. Add an entry below with the exact file name, the title, and the artist.
 *   3. Add the licence details so the footer credits it correctly.
 *
 * Only add music you have the right to publish: CC0, public domain, CC BY (with credit),
 * your own work, or tracks you have written permission to use. Avoid NonCommercial (NC)
 * and NoDerivatives (ND) licences, because this app applies EQ to the audio.
 *
 * Entries whose file is missing are skipped, so a typo never breaks the screen.
 * If none of the files exist, the app plays a short demo track it generates itself.
 */
export interface LibraryTrack {
  /** File name inside public/audio/ */
  file: string;
  title: string;
  artist: string;
  /** Where the track came from, shown in the credits. */
  source?: { name: string; url: string };
  /** The licence it is released under, shown in the credits. */
  license?: { name: string; short: string; url: string };
}

const INCOMPETECH = { name: 'incompetech.com', url: 'https://incompetech.com' };
const CC_BY_4 = {
  name: 'Creative Commons: By Attribution 4.0 License',
  short: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
};

export const LIBRARY: LibraryTrack[] = [
  // Grooving bass and drums, with guitar and organ.
  { file: 'funkorama.mp3', title: 'Funkorama', artist: 'Kevin MacLeod', source: INCOMPETECH, license: CC_BY_4 },
  // Upright bass, guitar and piano, with a bright flute and rhythm on top.
  { file: 'modern-jazz-samba.mp3', title: 'Modern Jazz Samba', artist: 'Kevin MacLeod', source: INCOMPETECH, license: CC_BY_4 },
  // Heavy kit and bass with an electric guitar.
  { file: 'cool-rock.mp3', title: 'Cool Rock', artist: 'Kevin MacLeod', source: INCOMPETECH, license: CC_BY_4 },
];
