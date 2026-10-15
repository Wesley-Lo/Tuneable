Built-in tracks
===============

The songs on the "Built-in tracks" screen live in this folder.

To add a song:

  1. Copy the audio file into this folder (MP3 works in every browser).
  2. Open src/audio/library.ts and add one line with the exact file name,
     the title, and the artist:

         { file: 'my-song.mp3', title: 'Song title', artist: 'Artist name' },

The songs appear in that order, and the carousel loops from the last one back
to the first. A line whose file is missing is skipped. If none of the files
exist, the app plays a short demo track it generates in the browser instead
(see src/audio/demo.ts), so everything still works out of the box.

Pick songs with real bass, vocals or guitar, and cymbals, so every tuning step
is easy to hear. About 60 to 120 seconds is plenty; the player loops each one.

Only add songs you have the rights to publish. A public repository or a
deployed site serves these files to anyone.
