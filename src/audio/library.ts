/**
 * The built-in songs people can cycle through on the setup screen.
 *
 * To add a song:
 *   1. Copy the audio file into public/audio/ (MP3 works everywhere).
 *   2. Add one line below with the exact file name, the title, and the artist.
 *
 * Entries whose file is missing are skipped, so a typo never breaks the screen.
 * If none of the files exist, the app plays a short demo track it generates itself.
 */
export interface LibraryTrack {
  /** File name inside public/audio/ */
  file: string;
  title: string;
  artist: string;
}

export const LIBRARY: LibraryTrack[] = [
  { file: 'Whisper-My-Name.mp3', title: 'Whisper My Name', artist: 'Drake' },
  { file: 'FATIGUES.mp3', title: 'FATIGUES', artist: 'Yel' },
  { file: 'm.A.A.d-city.mp3', title: 'm.A.A.d City', artist: 'Kendrick Lamar' },
];
