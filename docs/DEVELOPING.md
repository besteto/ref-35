# Developing

No build step, no dependencies, no package manager. Open `index.html` and it
runs. Serve the folder over HTTP if you want to hear the sound files rather than
the synth fallback — see [Sound](#sound).

```bash
python -m http.server 8000     # then http://localhost:8000/
```

## Layout

```
index.html      four screens: title / game / payoff / collections, plus the
                instruction plate
style.css
src/rules.js    pure game logic — board, merging, scoring. No DOM.
src/game.js     rendering, pointer input, screen flow
src/sfx.js      audio: file loading, synthesis, per-cue stop
tests.html      59 assertions against rules.js
smoke.html      plays 500 whole games; measures pacing and collection balance
preview.html    the game in phone-sized iframes, for checking responsive layout
tools/cut.py    regenerates every image in assets/ from the source photography
```

`rules.js` deliberately has no DOM access and no imports. That is what lets
`tests.html` and `smoke.html` assert against it directly, and it is worth
preserving — nearly every bug found so far was caught there rather than by
playing.

### Deep links

Any screen can be opened without playing to it:

| URL | Screen |
|---|---|
| `index.html` | title |
| `index.html#game` | birthday mode |
| `index.html#endless` | endless mode |
| `index.html#payoff` | the catalogue page |
| `index.html#manual` | the instruction plate |
| `index.html#collections` | the collections page |

## Tests

Open `tests.html` and `smoke.html` in a browser; each prints its own results. To
run them without a window:

```bash
chrome --headless --disable-gpu --dump-dom --virtual-time-budget=30000 \
  "file:///path/to/tests.html"
```

`smoke.html` is the one that matters for feel. It plays 500 complete games and
reports how many drags 35 points actually costs, and how long that is in seconds.

Currently a game is 21–28 drags, median 26, or roughly 35 seconds.

### Scoring

`SCORING` in `rules.js` is split by mode:

| | T2 | T3 | why |
|---|---|---|---|
| birthday | 0 | 5 | seven finished pieces, one per piercing in the ear |
| endless | 1 | 1 | no target to land on, so the score just counts pieces made |

Five points a piece is not arbitrary: 35 / 7 piercings = 5, so **one finished
piece fills exactly one piercing** and the meter and the score stop being two
separate ideas. It is also the only value above 1 that always lands on 35 exactly
— 3 points overshoots to 36 in every single game.

`tuning.html` sweeps candidate models over 300 games each and reports drags,
seconds, and how often the score lands on 35 rather than overshooting. Add a row
to `MODELS` to try a value. It has caught three mis-tunings: 105 drags for
finished-only-at-1pt, 30 seconds for an early model, and 47 seconds for
one-point-per-merge, which testers flagged as long by the 26 point mark.

### Headless has two traps

Both cost real time before being identified, so they are written down here:

- **CSS animations and transitions do not advance** under `--virtual-time-budget`.
  Elements freeze on their first keyframe, so a spawning piece measures 23px
  where a cell is 58px. Any probe that reads geometry must first disable
  animation, or it is measuring the harness. A screenshot of an animation can be
  taken by pausing it on a negative `animation-delay`.
- **`--window-size` is ignored**; the viewport is always 500×749. Use
  `preview.html`, which puts the game in fixed-size iframes — an iframe
  establishes its own viewport, so `vw` and `vh` resolve correctly inside it.

## Artwork

The source photography (`choosed/`, `PROMO_Auris/`) is ~320 MB and deliberately
**not** in the repository. Only the cut sprites in `assets/` are committed.

```bash
python tools/cut.py --contact
```

Crop coordinates are a dict at the top of `tools/cut.py`, as
`(centre_x, centre_y, size)` in source pixels. When better photography arrives,
swap the filenames there, nudge the boxes, and re-run — every sprite regenerates.
`--contact` writes `tools/_contact.png` so the framing can be checked at a glance.

The Marchesa tokens are the soft ones: their source is only 469×444, so those are
the first three worth recutting from a better original.

`cut.py` also produces `assets/portrait/vlad.jpg` (the catalogue's model plate)
and `assets/bg/studio.jpg` (the boutique band). `assets/logo/scalpelburg.png` is
the one image supplied directly rather than generated, so re-running `cut.py`
neither creates nor touches it.

Pieces are circular crops rather than cutouts, so the backdrop each piece was
photographed on becomes its collection colour. That is a gameplay affordance as
much as a style: three chains are told apart at a glance without reading anything.

Sprites are 256px. Five to a row means the tray stays at 2× device pixels up to
640px, which is why `--tray-max` stops there rather than at a round number.

## Sound

Only `voice` is a file. The other four cues are synthesised in `src/sfx.js`:
three short WebAudio tones, and an original Eurodance sting for `celebrate`
(128 BPM, A minor, four-on-the-floor with offbeat stabs).

| Cue | Plays when | Length | Present file |
|---|---|---|---|
| `spawn` | a new piece appears | ~0.2s | synthesised |
| `merge` | two pieces become one | ~0.3s | synthesised |
| `score` | a piece is finished and goes to the ear | ~0.6s | synthesised |
| `celebrate` | 35 reached, catalogue page | 7.5s | synthesised |
| `voice` | layered *over* `celebrate` | ~7s | `voice.m4a` |

Each cue is looked up under any extension in `FORMATS` — `m4a`, `mp3`, `ogg`,
`wav` — and the first one that decodes wins, otherwise it synthesises. To replace
any of the synthesised cues, drop a file named after it into `assets/sfx/`; no
code changes needed.

**Safari cannot play Ogg Vorbis, iPhones included.** A cue that only has an `.ogg`
silently falls back to the synth on iOS. Putting an `.m4a` or `.mp3` next to it
fixes that; the loader picks whichever the browser can handle.

Keep `merge` and `spawn` short and quiet — they fire over a hundred times in two
minutes, and anything with a tail becomes wearing. Normalise all cues to roughly
the same loudness.

### Syncing the voice to the sting

`voice` plays on top of the sting rather than replacing it, and the sting ducks to
`DUCK_UNDER_VOICE` whenever a voice file is loaded so the singing sits on top.

Three numbers in `src/sfx.js` do the syncing, and none of them touch the file:

- **`trim`** on the voice cue skips dead air at the head of the recording, so the
  first sung word lands on the sting's downbeat. The current take has 0.97s of it.
- **`delay`** shifts the whole vocal later, for coming in *after* the beat rather
  than on it.
- **`STING_BPM`** is the one to nudge if the beat drifts against the singing.

`STING_BPM` is set from the recording, not from the record it parodies.
Autocorrelating the onset envelope of `voice.m4a` puts the vocal at 127.7 BPM,
and its next four candidates — 125, 130.4, 133.3, 117.6 — cluster around the same
figure, which is what a steady vocal looks like. (The two rejected takes in
`assets/sfx/takes/` returned 85.7 and 115.4 with scattered runners-up, meaning
looser timing.) Rounded to 128: four bars run 7.5s, the trimmed vocal runs 6.8s,
so the music resolves just after the last word.

Re-measuring after a new recording is a page of JavaScript: decode with
`OfflineAudioContext`, take a 10ms RMS envelope, half-wave rectify its
derivative, and autocorrelate over lags of 0.32–1.30s.

### Why cues are fetched rather than played from `<audio>`

Both reasons were measured, not assumed:

- A hidden or throttled tab **refuses to load media elements**: `preload` is
  ignored, no events fire, `readyState` stays 0 indefinitely. A probe waiting on
  `loadedmetadata` therefore never resolves, and the cue sticks on the synth
  despite a perfectly good file. `fetch` is unaffected — it works in a hidden tab.
- Buffer sources start with far less latency than `<audio>`, which matters for a
  cue firing 110 times in two minutes.

The cost is that `fetch` cannot read `file://`, so opening `index.html` straight
off disk falls back to `<audio>` elements and then to synthesis. Hence the local
server at the top of this file.

### Licensing the celebrate cue

The synthesised sting is deliberate, not a placeholder. Tempo and a
four-on-the-floor stab pattern are not anybody's property; melodies are, so that
one is its own. This keeps a public or promotional build clear of rights
questions.

Dropping a `celebrate` file in overrides it. For a private birthday page that can
be whatever you like; for anything published under the Auris name, either keep
the sting or clear the rights first — a commercial site is exactly where a
recognisable master gets noticed.

## Deploying

Everything is static, so GitHub Pages serves it as-is:

```bash
git remote add origin git@github.com:<user>/<repo>.git
git push -u origin main
```

Then Settings → Pages → Source: `main`, folder `/ (root)`.

To put it on an Auris subdomain later, add a `CNAME` file containing the hostname
and point a DNS CNAME record at `<user>.github.io`.
