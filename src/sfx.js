/* Auris Merge — audio.

   Every cue looks for a file in assets/sfx/ under any extension in FORMATS and
   uses the first one that loads and decodes. If none does, the cue falls back to
   synthesis, so the game is fully playable before any recording exists and lights
   up with zero code changes once they land.

   Format order matters: Safari, iOS included, cannot decode Ogg Vorbis at all.
   An .m4a or .mp3 alongside an .ogg is what keeps sound working on iPhones.

   Files are fetched and decoded into AudioBuffers rather than played through
   <audio> elements. Two reasons, both measured rather than assumed:

     - A hidden or throttled tab refuses to load media elements: preload is
       ignored, no events fire, readyState stays 0 indefinitely. A probe waiting
       on loadedmetadata therefore never resolves and the cue sticks on synth even
       though the file is perfectly good. fetch() is unaffected by this.
     - merge and spawn fire well over a hundred times in a two-minute game, and
       buffer sources start with far less latency than <audio> elements.

   fetch() cannot read file:// URLs, so opening index.html straight off disk falls
   back to <audio> elements, and then to synthesis. Serve the folder over HTTP to
   hear the real files locally.

   `celebrate` synthesises an original Eurodance sting rather than staying silent.
   Tempo and a four-on-the-floor stab pattern are not anybody's property; melodies
   are, so this one is its own. That keeps a public build clear of rights issues
   while a personal or licensed celebrate file can still override it. */
(function (root) {
  'use strict';

  var POOL = 4;             // <audio> copies per cue; file:// fallback only
  var STORE = 'auris.muted';

  var FORMATS = ['m4a', 'mp3', 'ogg', 'wav'];

  function candidates(cue) {
    return FORMATS.map(function (ext) { return 'assets/sfx/' + cue + '.' + ext; });
  }

  /* The sting steps back when there is a voice to carry the moment; on its own it
     plays at full level. */
  var DUCK_UNDER_VOICE = 0.45;

  var MANIFEST = {
    spawn:     { synth: { freq: 740,  type: 'triangle', dur: 0.09, gain: 0.030 } },
    merge:     { synth: { freq: 1180, type: 'triangle', dur: 0.15, gain: 0.045, sweep: 1.6 } },
    score:     { synth: { freq: 1046, type: 'sine',     dur: 0.42, gain: 0.050, chord: [1, 1.25, 1.5] } },
    celebrate: { synth: { sting: true } },

    /* Layered ON TOP of celebrate, not instead of it. No synth fallback: if
       there is no voice file the payoff is just the sting.

       `trim` skips dead air at the head of the recording so the first sung word
       lands on the sting's downbeat — measured at 0.97s for the current take.
       `delay` shifts the whole thing later if it needs to come in after the beat
       rather than on it. Both are in seconds, and both are playback-time only:
       the file itself is never edited. */
    voice: { trim: 0.97, delay: 0 }
  };

  var ctx = null;
  var buffers = {};         // name -> AudioBuffer, the normal path
  var pools = {};           // name -> {list, next}, the file:// path
  var buses = {};           // name -> {bus, nodes} for anything currently sounding
  var sources = {};         // name -> which file won, for diagnostics
  var muted = false;
  var started = false;

  try { muted = localStorage.getItem(STORE) === '1'; } catch (e) { /* private mode */ }

  /* --- loading ------------------------------------------------------------- */
  function loadCue(name, list, i) {
    if (i >= list.length) return;                    // no usable file: stay on synth

    fetch(list[i])
      .then(function (res) {
        if (!res.ok) throw new Error('missing');     // 404: try the next format
        return res.arrayBuffer();
      })
      .then(function (bytes) { return ctx.decodeAudioData(bytes); })
      .then(function (buf) {
        buffers[name] = buf;
        sources[name] = list[i];
      })
      .catch(function (err) {
        /* A blocked fetch (file://) fails on the first candidate and would fail
           on all of them, so switch strategies rather than grinding through. */
        if (i === 0 && err && err.name === 'TypeError') return probeElements(name, list, 0);
        loadCue(name, list, i + 1);
      });
  }

  /* file:// fallback. Media elements can read file:// where fetch cannot. */
  function probeElements(name, list, i) {
    if (i >= list.length) return;

    var el = new Audio();
    el.preload = 'auto';
    el.addEventListener('loadedmetadata', function () {
      if (pools[name]) return;
      var pool = [];
      for (var k = 0; k < POOL; k++) {
        var a = new Audio(list[i]);
        a.preload = 'auto';
        pool.push(a);
      }
      pools[name] = { list: pool, next: 0 };
      sources[name] = list[i];
    });
    el.addEventListener('error', function () { probeElements(name, list, i + 1); });
    el.src = list[i];
    el.load();
  }

  /* --- synthesis ----------------------------------------------------------
     Each cue sounds through its own gain node, so stop() can silence one cue
     without touching the others. */
  function bus(name) {
    if (buses[name]) return buses[name];
    var g = ctx.createGain();
    g.gain.value = 1;
    g.connect(ctx.destination);
    buses[name] = { bus: g, nodes: [] };
    return buses[name];
  }

  function remember(b, node) {
    b.nodes.push(node);
    node.addEventListener('ended', function () {
      var at = b.nodes.indexOf(node);
      if (at >= 0) b.nodes.splice(at, 1);            // do not accumulate over a game
    });
  }

  function voice(name, t, freq, type, dur, gain, opts) {
    var b = bus(name);
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    opts = opts || {};

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);

    if (opts.filter) {
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(opts.filter, t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(240, opts.filter * 0.3), t + dur);
      osc.connect(lp);
      lp.connect(amp);
    } else {
      osc.connect(amp);
    }

    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + (opts.attack || 0.012));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    amp.connect(b.bus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    remember(b, osc);
  }

  function kick(name, t) {
    voice(name, t, 145, 'sine', 0.17, 0.11, { sweepTo: 45, attack: 0.004 });
  }

  /* A minor, four bars, four-on-the-floor with offbeat chord stabs.

     STING_BPM is set to the sung take rather than to the record: autocorrelating
     the onset envelope of assets/sfx/voice.m4a puts it at 127.7, with its next
     four candidates (125, 130.4, 133.3, 117.6) clustered around the same figure,
     which is what a steady vocal looks like. Four bars at 128 runs 7.5s and the
     trimmed vocal runs 6.8s, so the music resolves just after the last word.

     If the beat drifts against the singing, this is the number to nudge. */
  var STING_BPM = 128;
  var STING_BARS = 4;

  function sting(name) {
    var beat = 60 / STING_BPM;
    var t0 = ctx.currentTime + 0.03;
    var beats = STING_BARS * 4;

    var Am  = [220.00, 261.63, 329.63];
    var F   = [174.61, 220.00, 261.63];
    var G   = [196.00, 246.94, 293.66];
    var BARS = [Am, F, G, Am];

    var RIFF = [
      [0.0,  440.00, 0.22], [0.5,  523.25, 0.22], [1.0,  659.25, 0.40],
      [2.0,  587.33, 0.22], [2.5,  523.25, 0.22], [3.0,  440.00, 0.55],
      [4.0,  349.23, 0.22], [4.5,  440.00, 0.22], [5.0,  523.25, 0.40],
      [6.0,  493.88, 0.22], [6.5,  440.00, 0.22], [7.0,  349.23, 0.55],
      [8.0,  392.00, 0.22], [8.5,  493.88, 0.22], [9.0,  587.33, 0.40],
      [10.0, 523.25, 0.22], [10.5, 493.88, 0.22], [11.0, 392.00, 0.55],
      [12.0, 440.00, 0.22], [12.5, 523.25, 0.22], [13.0, 659.25, 0.40],
      [14.0, 587.33, 0.30], [15.0, 440.00, 1.10]
    ];

    for (var i = 0; i < beats; i++) kick(name, t0 + i * beat);

    for (var s = 0; s < beats; s++) {
      var chord = BARS[Math.floor(s / 4) % BARS.length];
      for (var c = 0; c < chord.length; c++) {
        voice(name, t0 + (s + 0.5) * beat, chord[c], 'sawtooth', 0.20, 0.022, { filter: 2400 });
      }
    }
    for (var r = 0; r < RIFF.length; r++) {
      voice(name, t0 + RIFF[r][0] * beat, RIFF[r][1], 'square', RIFF[r][2], 0.030, { filter: 3200 });
    }
  }

  function simple(name) {
    var spec = MANIFEST[name].synth;
    var t = ctx.currentTime;
    if (spec.chord) {
      for (var i = 0; i < spec.chord.length; i++) {
        voice(name, t, spec.freq * spec.chord[i], spec.type, spec.dur,
              spec.gain / spec.chord.length);
      }
    } else {
      voice(name, t, spec.freq, spec.type, spec.dur, spec.gain,
            { sweepTo: spec.sweep ? spec.freq * spec.sweep : 0 });
    }
  }

  function level(name) {
    return (name === 'celebrate' && buffers.voice) ? DUCK_UNDER_VOICE : 1;
  }

  function synthesise(name) {
    if (!ctx || !MANIFEST[name].synth) return;      // e.g. voice: file or nothing
    if (ctx.state === 'suspended') ctx.resume();
    bus(name).bus.gain.value = level(name);
    try {
      if (MANIFEST[name].synth.sting) sting(name);
      else simple(name);
    } catch (e) { /* silent is acceptable */ }
  }

  /* --- public -------------------------------------------------------------- */

  /* iOS refuses to start audio outside a user gesture, so this runs from the
     first pointerdown rather than at load. */
  function unlock() {
    if (started) return;
    started = true;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (AC) ctx = new AC();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
    if (!ctx) return;
    for (var name in MANIFEST) {
      if (MANIFEST.hasOwnProperty(name)) loadCue(name, candidates(name), 0);
    }
  }

  function play(name) {
    if (muted || !MANIFEST[name]) return;
    if (!started) unlock();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    if (buffers[name]) {
      try {
        var b = bus(name);
        var src = ctx.createBufferSource();
        src.buffer = buffers[name];
        src.connect(b.bus);
        b.bus.gain.value = level(name);
        src.start(ctx.currentTime + (MANIFEST[name].delay || 0),
                  MANIFEST[name].trim || 0);
        remember(b, src);
        return;
      } catch (e) { /* fall through */ }
    }

    var pool = pools[name];
    if (pool) {
      var el = pool.list[pool.next];
      pool.next = (pool.next + 1) % pool.list.length;
      try {
        el.currentTime = 0;
        var p = el.play();
        if (p && p.catch) p.catch(function () { synthesise(name); });
        return;
      } catch (e) { /* fall through */ }
    }

    synthesise(name);
  }

  /* Needed for anything long enough to outlive its screen — the celebrate cue
     must not keep playing once he taps back into the tray. */
  function stop(name) {
    var pool = pools[name];
    if (pool) {
      pool.list.forEach(function (a) {
        try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ }
      });
    }
    var b = buses[name];
    if (b && ctx) {
      var now = ctx.currentTime;
      try {
        b.bus.gain.cancelScheduledValues(now);
        b.bus.gain.setValueAtTime(b.bus.gain.value, now);
        b.bus.gain.linearRampToValueAtTime(0.0001, now + 0.08);
        b.nodes.forEach(function (n) { try { n.stop(now + 0.1); } catch (e) { /* ignore */ } });
      } catch (e) { /* ignore */ }
      delete buses[name];
    }
  }

  function setMuted(value) {
    muted = !!value;
    if (muted) for (var n in MANIFEST) if (MANIFEST.hasOwnProperty(n)) stop(n);
    try { localStorage.setItem(STORE, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    return muted;
  }

  root.Sfx = {
    unlock: unlock,
    play: play,
    stop: stop,
    isMuted: function () { return muted; },
    setMuted: setMuted,
    toggleMute: function () { return setMuted(!muted); },
    /* which cues found a real file, and which one won */
    loaded: function () {
      return Object.keys(sources).map(function (n) { return n + '=' + sources[n]; });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
