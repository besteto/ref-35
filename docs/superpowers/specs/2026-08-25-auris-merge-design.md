# Auris Merge — Saint Scalpelburg Edition

Birthday gift for Vlad Bodmodov (Влад Бодмодов), turning 35.
Deadline: 2026-08-27. Built from existing Auris photography.

## Goal

A merge game that takes ~2 minutes to reach 35 points, at which point it
resolves into a mock Auris catalogue page for "Коллекция «Влад Бодмодов», REF. 35".
The game is the delivery mechanism; the catalogue page is the gift.

A secondary endless mode exists to demo the game to other people, and is the
seed of a possible promo piece later.

## Core loop

- 5x5 tray. Drag a piece onto its twin, or tap source then tap target.
- Pieces merge only within their own collection (honours "merge by collection").
- Three collections, three tiers each:

  | Collection | Source photo | Token backdrop | T1 -> T2 -> T3 |
  |---|---|---|---|
  | CASSIOPEA | AES2711.jpg | deep red / black | thin band, double band, spiked crown |
  | MARCHESA | Screenshot 2026-08-25 071125.png | navy + white | 3-stone, butterfly, grand fan |
  | FARFALLA | dsc07958.jpg, dsc08036.jpg | warm skin | mono, two-tone, multicolour butterfly |

- A T3 piece scores and dissolves, freeing its cell. This is the anti-clog rule.
- Each merge spawns a fresh T1 in a random empty cell. A tappable velvet pouch
  drops one on demand. There is no separate placement puzzle.
- Scoring: T2 merge = 1, T3 merge = 5. Target = 35.

## Birthday mode cannot be lost

If the tray fills with no legal merge available, the oldest T1 quietly dissolves.
He does not lose his own birthday. The real fail state lives in endless mode only.

## Art direction

Pieces are circular "loupe" tokens: the jewellery photographed in place, cropped
to a circle, ringed in gold. No alpha cutouts, so no bad-matte risk. The backdrop
each piece was shot on becomes its collection colour, which doubles as gameplay
readability — three chains distinguishable at a glance. Tier is shown by the piece
plus 1-3 gold pips, so it stays unambiguous at phone size.

Non-game screens pastiche the gold line-art of `choosed/schemes/` — the studio's
own "HOW TO USE GOLD THREADLESS PROPERLY" instruction plates.

## Progress meter

Not a number. A gold line-art ear with 7 piercing points; every 5 points fills one.
At 35 the ear is fully curated and that transition IS the payoff. The progress bar
and the ending are the same object.

## Payoff screen

Mock catalogue page. Deadpan luxury register throughout. Copy:

> КОЛЛЕКЦИЯ «ВЛАД БОДМОДОВ» — REF. 35
>
> Изысканный силуэт, созданный по индивидуальному заказу. Неповторим — другого
> такого нет. Самый лучший и запоминающийся навсегда.
>
> тираж: 1 экз.  ·  материал: любовь  ·  VLAD IS LOVE / baby, don't hurt me

The Haddaway joke sits in the fine print, where a real catalogue puts material and
edition specs — the page keeps its straight face and the joke still lands. It
repeats as step 9 of the instruction plate ("BABY, DON'T HURT ME").

Language: Russian only. All copy lives in one `RU = {}` object so a second
language is a drop-in later; no toggle is built.

## Tech

Plain DOM + CSS transitions. No canvas, no framework, no build step — there is no
`node` on the build machine, so a bundler would cost setup time before a line of
game exists. Pointer events give mouse and touch one code path.

```
index.html      three screens: title / game / payoff
style.css
src/rules.js    PURE logic: board, merge, score. No DOM. No imports.
src/game.js     rendering + pointer input
src/sfx.js      audio manifest + WebAudio synth fallback
tests.html      asserts against rules.js, prints pass/fail
tools/cut.py    PIL sprite cutter; crop coords in a dict at the top
assets/
```

`tools/cut.py` keeps its crop coordinates in a dict at the top so that when better
photography arrives, the filenames get swapped, the script is re-run, and every
sprite regenerates. This is what makes the work reusable for a promo version.

## Sound

`src/sfx.js` reads a manifest; each cue names a file in `assets/sfx/` and falls
back to a WebAudio tone when that file is absent. The game is fully playable before
the recordings exist, and they light up with zero code changes.

| File | Cue | Length |
|---|---|---|
| spawn.mp3 | new piece appears | ~0.2s |
| merge.mp3 | two pieces become one | ~0.3s |
| score.mp3 | a T3 completes and dissolves | ~0.6s |
| celebrate.mp3 | 35 points reached | 2-4s |

iOS requires a user gesture before audio plays, so the context unlocks on first
tap. Each cue gets a small pool so fast merges overlap instead of cutting each
other off. Mute toggle persists in localStorage.

## Hosting

GitHub Pages. `PROMO_Auris/` (311 MB) and `choosed/` are gitignored; only the cut
sprites in `assets/` are committed. Pointing an Auris subdomain at it later is a
CNAME record.

## Verification

`rules.js` is pure, so `tests.html` asserts merge, scoring, and deadlock behaviour
directly. The game is driven and screenshotted at phone viewport via claude-in-chrome
rather than judged by reading the code.
