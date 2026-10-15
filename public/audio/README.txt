Built-in tracks
===============

The songs on the "Built-in tracks" screen live in this folder.

To add a song:

  1. Copy the audio file into this folder (MP3 works in every browser).
  2. Open src/audio/library.ts and add an entry with the exact file name, the
     title, the artist, and the licence details (the footer uses these to
     credit the track).

The songs appear in that order, and the carousel loops from the last one back
to the first. An entry whose file is missing is skipped. If none of the files
exist, the app plays a short demo track it generates in the browser instead
(see src/audio/demo.ts).

Current tracks (Kevin MacLeod, incompetech.com, CC BY 4.0, credit required):

  funkorama.mp3           "Funkorama"
  modern-jazz-samba.mp3   "Modern Jazz Samba"
  cool-rock.mp3           "Cool Rock"

Only add music you have the right to publish: CC0, public domain, CC BY (with
credit), your own work, or tracks you have written permission to use. Avoid
NonCommercial (NC) and NoDerivatives (ND) licences, because this app applies EQ
to the audio. A public repository or a deployed site serves these files to
anyone.
