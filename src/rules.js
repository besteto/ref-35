/* Auris Merge — pure game logic. No DOM, no imports, no side effects beyond the
   state object handed in. Everything here is asserted by tests.html. */
(function (root) {
  'use strict';

  var GRID = 5;
  var CELLS = GRID * GRID;
  var MAX_TIER = 3;
  var COLLECTIONS = ['cassiopea', 'marchesa', 'farfalla'];

  /* ---- tuning knobs -------------------------------------------------------
     Five points for a finished piece and nothing for the steps along the way, so
     the target is seven finished pieces. That lines up with the ear exactly:
     seven piercings, 35 / 7 = 5 points each, so ONE finished piece fills ONE
     piercing. The meter and the score stop being two separate ideas.

     Seven pieces is 21 merges, which smoke.html measures at around 28 seconds.
     Two earlier models were both rejected by testing: scoring every merge ran to
     47s and testers were flagging it as long by 26 points, and scoring only
     finished pieces at 1 point each ran to a hopeless 105 drags.

     Endless has no target to land on, so it keeps the flatter scoring, where the
     number simply counts how many pieces you have made. */
  var TARGET      = 35;
  var SCORING     = {
    birthday: { 2: 0, 3: 5 },        // 7 finished pieces, one per piercing
    endless:  { 2: 1, 3: 1 }         // every merge counts
  };
  var START_PIECES = 10;
  var EAR_SLOTS   = 7;               // 35 / 7 = one filled piercing per 5 points
  var SPAWN_BIAS  = 0.65;            // chance a spawn favours a collection already
                                     // on the board, so chains stay completable

  /* Deterministic RNG so tests are reproducible and a seed can replay a game. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createState(seed) {
    var state = {
      cells: new Array(CELLS).fill(null),
      score: 0,
      seq: 0,          // piece id counter, also doubles as birth order
      rng: mulberry32(seed === undefined ? 1 : seed),
      endless: false
    };
    /* Deal the opening hand round-robin rather than at random, so the first
       thing he sees has all three collections on it. Left to chance, a tray
       can open almost entirely one colour, which reads as a duller game than
       it is. Positions are still random. */
    for (var i = 0; i < START_PIECES; i++) {
      spawn(state, undefined, COLLECTIONS[i % COLLECTIONS.length]);
    }
    return state;
  }

  function emptyCells(state) {
    var out = [];
    for (var i = 0; i < CELLS; i++) if (!state.cells[i]) out.push(i);
    return out;
  }

  /* Collections holding an ODD number of tier-1s, i.e. one piece sitting without
     a partner. Biasing spawns toward these completes pairs the player can see.

     The first attempt biased toward "any collection already on the tray", which
     ran away: whichever collection got ahead kept being picked until the tray was
     effectively one collection and the other two never appeared. */
  function collectionsWantingPartner(state) {
    var count = {};
    for (var i = 0; i < CELLS; i++) {
      var p = state.cells[i];
      if (p && p.tier === 1) count[p.collection] = (count[p.collection] || 0) + 1;
    }
    return COLLECTIONS.filter(function (c) { return (count[c] || 0) % 2 === 1; });
  }

  function spawn(state, forceIndex, forceCollection) {
    var free = emptyCells(state);
    if (!free.length) return [];

    var idx = forceIndex !== undefined ? forceIndex
            : free[Math.floor(state.rng() * free.length)];

    var pool = COLLECTIONS;
    var wanting = collectionsWantingPartner(state);
    if (wanting.length && state.rng() < SPAWN_BIAS) pool = wanting;
    var collection = forceCollection || pool[Math.floor(state.rng() * pool.length)];

    var piece = { id: ++state.seq, collection: collection, tier: 1, born: state.seq };
    state.cells[idx] = piece;
    return [{ type: 'spawn', index: idx, piece: piece }];
  }

  function pointsFor(state, tier) {
    var table = state.endless ? SCORING.endless : SCORING.birthday;
    return table[tier] || 0;
  }

  function canMerge(a, b) {
    return !!a && !!b && a !== b
        && a.collection === b.collection
        && a.tier === b.tier
        && a.tier < MAX_TIER;
  }

  /* A cell index must be a whole number on the tray. Testing the negation
     matters: NaN fails BOTH `< 0` and `>= CELLS`, so a range check written the
     obvious way lets NaN through, and cells[NaN] then reads as an empty cell. */
  function isCell(i) {
    return typeof i === 'number' && i === Math.floor(i) && i >= 0 && i < CELLS;
  }

  /* What would dragging `from` onto `to` do? Returns 'merge', 'move', or null. */
  function classify(state, from, to) {
    if (from === to) return null;
    if (!isCell(from) || !isCell(to)) return null;
    var a = state.cells[from];
    if (!a) return null;
    var b = state.cells[to];
    if (!b) return 'move';
    return canMerge(a, b) ? 'merge' : null;
  }

  /* Apply a drag. Returns an event list for the renderer; [] if illegal. */
  function apply(state, from, to) {
    var kind = classify(state, from, to);
    if (!kind) return [];

    var a = state.cells[from];

    if (kind === 'move') {
      state.cells[to] = a;
      state.cells[from] = null;
      return [{ type: 'move', from: from, to: to, piece: a }];
    }

    var merged = {
      id: ++state.seq,
      collection: a.collection,
      tier: a.tier + 1,
      born: state.seq
    };
    state.cells[from] = null;
    state.cells[to] = merged;

    var gained = pointsFor(state, merged.tier);
    state.score += gained;

    var events = [{ type: 'merge', from: from, to: to, piece: merged, points: gained }];

    /* A top-tier piece is the payoff: it scores, shows itself, then dissolves and
       flies to the ear. Keeping it on the board is what would clog the tray. */
    if (merged.tier === MAX_TIER) {
      state.cells[to] = null;
      events.push({ type: 'score', index: to, piece: merged, points: gained });
    }

    events = events.concat(spawn(state));

    /* A finished piece costs four tier-1s but only three merges, so one extra
       tier-1 arrives with each crown. That keeps the tray stocked at a steady
       level without the player having to keep tapping the pouch. */
    if (merged.tier === MAX_TIER) events = events.concat(spawn(state));

    return events;
  }

  function hasLegalMove(state) {
    if (emptyCells(state).length) return true;
    for (var i = 0; i < CELLS; i++) {
      for (var j = i + 1; j < CELLS; j++) {
        if (canMerge(state.cells[i], state.cells[j])) return true;
      }
    }
    return false;
  }

  /* Birthday mode must not be losable. When the tray jams, the oldest tier-1
     quietly dissolves rather than ending his own birthday. */
  function relieve(state) {
    var oldest = -1;
    for (var i = 0; i < CELLS; i++) {
      var p = state.cells[i];
      if (!p || p.tier !== 1) continue;
      if (oldest < 0 || p.born < state.cells[oldest].born) oldest = i;
    }
    if (oldest < 0) return [];
    var gone = state.cells[oldest];
    state.cells[oldest] = null;
    return [{ type: 'dissolve', index: oldest, piece: gone }];
  }

  function earFilled(state) {
    return Math.min(EAR_SLOTS, Math.floor(state.score / (TARGET / EAR_SLOTS)));
  }

  function isComplete(state) {
    return !state.endless && state.score >= TARGET;
  }

  root.Rules = {
    GRID: GRID, CELLS: CELLS, MAX_TIER: MAX_TIER, COLLECTIONS: COLLECTIONS,
    TARGET: TARGET, SCORING: SCORING, EAR_SLOTS: EAR_SLOTS,
    pointsFor: pointsFor,
    mulberry32: mulberry32,
    createState: createState, emptyCells: emptyCells,
    spawn: spawn, canMerge: canMerge, classify: classify, apply: apply, isCell: isCell,
    hasLegalMove: hasLegalMove, relieve: relieve,
    earFilled: earFilled, isComplete: isComplete
  };
})(typeof window !== 'undefined' ? window : globalThis);
