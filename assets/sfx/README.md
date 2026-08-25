Cue files. Each cue is looked up as spawn / merge / score / celebrate / voice with
any of these extensions, first one that decodes wins:  m4a, mp3, ogg, wav

Anything without a file is synthesised in ../../src/sfx.js, which is currently
everything except the voice.

  spawn      ~0.2s   a new piece appears                  synthesised
  merge      ~0.3s   two pieces become one                synthesised
  score      ~0.6s   a piece is finished, goes to the ear synthesised
  celebrate  7.5s    35 reached -- Eurodance sting        synthesised
  voice      ~7s     layered ON TOP of celebrate          voice.m4a

IMPORTANT: Safari, iPhones included, cannot play Ogg Vorbis at all. If you add a
cue as .ogg only, iOS gets the synth instead. Add an .m4a or .mp3 next to it.

Keep spawn and merge short and quiet: they fire dozens of times per game.

voice.m4a is take 1 of three; the other two are in takes/ and are swapped in by
renaming. If you swap, re-check `trim` in src/sfx.js -- it is the lead-in silence
of THIS take (0.97s) and a wrong value clips the first word.

To sync, nudge STING_BPM (currently 128, measured off the singing) and `trim`.
Neither edits the recording.
