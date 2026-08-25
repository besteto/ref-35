/* Auris Merge — rendering, input, screen flow.
   All game rules live in rules.js; this file only draws them and listens. */
(function () {
  'use strict';

  var R = Rules;
  var G = R.GRID;

  var CROWN_MS = 1250;       // must match the crown-* animations in style.css

  var COLLECTION_LABEL = {
    cassiopea: 'Cassiopea',
    marchesa: 'Marchesa',
    farfalla: 'Farfalla'
  };

  var state = null;
  var els = {};              // piece id -> element
  var selected = -1;         // tap-then-tap source, or -1
  var busy = false;          // ignore input while a merge animates
  var toastTimer = 0;

  var tray = document.getElementById('tray');
  var scoreEl = document.getElementById('score');
  var toastEl = document.getElementById('toast');

  /* ── geometry ──────────────────────────────────────────────────────────
     Positions are percentages of the tray, so everything is responsive and
     no layout measuring is ever needed. */
  function pct(index) {
    return { left: (index % G) * (100 / G) + '%', top: Math.floor(index / G) * (100 / G) + '%' };
  }

  /* ── build ─────────────────────────────────────────────────────────────── */
  function buildCells() {
    tray.innerHTML = '';
    for (var i = 0; i < R.CELLS; i++) {
      var c = document.createElement('div');
      var p = pct(i);
      c.className = 'cell';
      c.dataset.index = i;
      c.style.left = p.left;
      c.style.top = p.top;
      tray.appendChild(c);
    }
  }

  function makePiece(piece) {
    var el = document.createElement('div');
    el.className = 'piece is-new';
    el.dataset.collection = piece.collection;
    el.dataset.id = piece.id;

    var face = document.createElement('div');
    face.className = 'piece-face';
    face.style.backgroundImage =
      'url("assets/pieces/' + piece.collection + '_' + piece.tier + '.png")';

    var pips = document.createElement('div');
    pips.className = 'pips';
    for (var t = 0; t < piece.tier; t++) pips.appendChild(document.createElement('i'));

    face.appendChild(pips);
    el.appendChild(face);
    tray.appendChild(el);

    setTimeout(function () { el.classList.remove('is-new'); }, 360);
    return el;
  }

  /* Reconcile the DOM against state: add what is new, drop what is gone,
     move everything else. Elements are keyed by piece id so CSS transitions
     do the animating for us. */
  function sync() {
    var live = {};
    for (var i = 0; i < R.CELLS; i++) {
      var piece = state.cells[i];
      if (!piece) continue;
      live[piece.id] = true;

      var el = els[piece.id] || (els[piece.id] = makePiece(piece));
      var p = pct(i);
      el.style.left = p.left;
      el.style.top = p.top;
      el.dataset.index = i;
    }

    Object.keys(els).forEach(function (id) {
      if (live[id]) return;
      var el = els[id];
      delete els[id];
      if (el.dataset.keep === '1') return;   // a crown animation owns it
      el.classList.add('is-gone');
      setTimeout(function () { el.remove(); }, 320);
    });
  }

  /* ── effects ───────────────────────────────────────────────────────────── */
  function floatPoints(index, points) {
    var f = document.createElement('div');
    var p = pct(index);
    f.className = 'float';
    f.textContent = '+' + points;
    f.style.left = 'calc(' + p.left + ' + ' + (100 / G / 2) + '%)';
    f.style.top = 'calc(' + p.top + ' + ' + (100 / G / 2) + '%)';
    tray.appendChild(f);
    setTimeout(function () { f.remove(); }, 1000);
  }

  /* The finished piece is the prettiest thing in the set and the whole reason
     the game exists, so it does not just wink out where it was made: it swells
     to the middle of the tray, names its collection, and then rises to the ear.

     It never blocks input. This happens 35 times a game, so the player has to be
     able to keep merging underneath it. */
  function showCrown(index, piece) {
    var el = makePiece(piece);
    var p = pct(index);
    var col = index % G;
    var row = Math.floor(index / G);

    el.style.left = p.left;
    el.style.top = p.top;
    /* Offsets are in percentages of the PIECE, which is 100/G % of the tray, so
       one tray-percent is G element-percents. This lands its centre on the tray
       centre from any cell. */
    el.style.setProperty('--dx', ((G - 1) / 2 - col) * 100 + '%');
    el.style.setProperty('--dy', ((G - 1) / 2 - row) * 100 + '%');
    el.dataset.keep = '1';
    el.classList.remove('is-new');
    el.classList.add('is-crowned');
    /* It sits over live cells throughout. Without this it hit-tests as a piece
       with no cell index and the drop under it resolves to nothing. */
    el.style.pointerEvents = 'none';

    var label = document.createElement('div');
    label.className = 'crown-label';
    label.textContent = COLLECTION_LABEL[piece.collection];
    tray.appendChild(label);

    setTimeout(function () { el.remove(); label.remove(); }, CROWN_MS);
  }

  /* Move an element onto a cell with no transition, so the change of coordinates
     is invisible. Used when a drag succeeds: the piece is already sitting over
     the target, and it should stay there. */
  function landOn(el, index) {
    var p = pct(index);
    var prev = el.style.transition;
    el.style.transition = 'none';
    el.style.transform = '';
    el.style.left = p.left;
    el.style.top = p.top;
    void el.offsetWidth;                       // commit before transitions resume
    el.style.transition = prev;
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 1800);
  }

  /* ── HUD ───────────────────────────────────────────────────────────────── */
  function drawEarDots() {
    /* Seven piercing points down the helix to the lobe — one per 5 points. */
    var pts = [[56, 13], [33, 22], [22, 45], [22, 70], [28, 94], [39, 114], [55, 127]];
    var g = document.getElementById('ear-dots');
    g.innerHTML = '';
    for (var i = 0; i < pts.length; i++) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', pts[i][0]);
      c.setAttribute('cy', pts[i][1]);
      c.setAttribute('r', 3.6);
      c.setAttribute('class', 'ear-dot');
      c.dataset.slot = i;
      g.appendChild(c);
    }
  }

  function drawHud() {
    var filled = R.earFilled(state);
    scoreEl.textContent = state.score;
    document.getElementById('score-target').textContent =
      state.endless ? '' : ' / 35';

    var dots = document.querySelectorAll('.ear-dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('is-set', i < filled);
    }

    var caption = document.getElementById('ear-caption');
    caption.textContent = state.endless
      ? 'бесконечный режим'
      : (filled >= R.EAR_SLOTS ? 'коллекция собрана' : 'коллекция собирается');
  }

  function bumpScore() {
    var box = document.querySelector('.hud-score');
    box.classList.remove('is-bumped');
    void box.offsetWidth;                      // restart the animation
    box.classList.add('is-bumped');
  }

  /* ── turn resolution ───────────────────────────────────────────────────── */
  function runEvents(events) {
    var scored = false;

    events.forEach(function (e) {
      if (e.type === 'merge') {
        Sfx.play('merge');
        if (e.points) { floatPoints(e.to, e.points); scored = true; }
      } else if (e.type === 'score') {
        showCrown(e.index, e.piece);
        Sfx.play('score');
        floatPoints(e.index, e.points);
        scored = true;
      } else if (e.type === 'spawn') {
        Sfx.play('spawn');
      } else if (e.type === 'dissolve') {
        toast('убрано в сейф');
      }
    });

    sync();
    drawHud();
    if (scored) bumpScore();

    if (R.isComplete(state)) {
      busy = true;
      setTimeout(showPayoff, 900);
      return;
    }

    /* Birthday mode must not be losable: unjam the tray instead of ending. */
    if (!R.hasLegalMove(state)) {
      if (state.endless) {
        toast('поднос полон');
      } else {
        setTimeout(function () { runEvents(R.relieve(state)); }, 420);
      }
    }
  }

  function attempt(from, to) {
    if (busy) return false;
    var events = R.apply(state, from, to);
    if (!events.length) return false;
    runEvents(events);
    return true;
  }

  /* ── input: drag, or tap-then-tap ──────────────────────────────────────── */
  var drag = null;

  function indexUnder(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return -1;
    var cell = el.closest('.cell, .piece');
    if (!cell) return -1;
    var index = parseInt(cell.dataset.index, 10);
    return R.isCell(index) ? index : -1;
  }

  function clearSelection() {
    if (selected >= 0) {
      var piece = state.cells[selected];
      if (piece && els[piece.id]) els[piece.id].classList.remove('is-hint');
    }
    selected = -1;
  }

  function select(index) {
    clearSelection();
    var piece = state.cells[index];
    if (!piece) return;
    selected = index;
    els[piece.id].classList.add('is-hint');
  }

  function highlightTarget(index) {
    var cells = tray.querySelectorAll('.cell');
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove('is-target');
    if (index < 0 || drag === null) return;
    if (R.classify(state, drag.from, index)) {
      var c = tray.querySelector('.cell[data-index="' + index + '"]');
      if (c) c.classList.add('is-target');
    }
  }

  tray.addEventListener('pointerdown', function (ev) {
    Sfx.unlock();
    if (busy) return;

    var pieceEl = ev.target.closest('.piece');
    if (!pieceEl) { clearSelection(); return; }

    var from = parseInt(pieceEl.dataset.index, 10);
    if (isNaN(from) || !state.cells[from]) return;

    drag = {
      from: from,
      el: pieceEl,
      x0: ev.clientX,
      y0: ev.clientY,
      moved: false,
      rect: tray.getBoundingClientRect()
    };
    pieceEl.setPointerCapture(ev.pointerId);
  });

  tray.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var dx = ev.clientX - drag.x0;
    var dy = ev.clientY - drag.y0;

    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 7) return;

    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add('is-picked');
      drag.el.style.pointerEvents = 'none';   // so elementFromPoint sees the cell
    }
    drag.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    highlightTarget(indexUnder(ev.clientX, ev.clientY));
  });

  function endDrag(ev) {
    if (!drag) return;
    var d = drag;
    drag = null;

    /* Resolve the drop target while the dragged piece is still transparent to
       hit-testing. Restoring pointer-events first lets elementFromPoint return
       the dragged piece itself, which classifies as from === to and silently
       does nothing — a merge that just refuses to happen. */
    var to = d.moved ? indexUnder(ev.clientX, ev.clientY) : -1;
    var kind = to >= 0 ? R.classify(state, d.from, to) : null;

    d.el.classList.remove('is-picked');
    d.el.style.pointerEvents = '';

    if (kind) {
      /* The drag worked, so the piece belongs at the target now. Simply clearing
         the drag offset would spring it home and fade it out there, which reads
         as a rejected move at the exact moment it succeeded. Rebase it onto the
         target instead: on a merge it dissolves where the bigger piece appears,
         and on a move it is already in its final place before sync() runs. */
      landOn(d.el, to);
    } else {
      d.el.style.transform = '';               // rejected: spring back home
    }

    highlightTarget(-1);

    if (!d.moved) {
      /* a tap: first selects, second acts */
      if (selected >= 0 && selected !== d.from) {
        if (!attempt(selected, d.from)) select(d.from);
        else clearSelection();
      } else if (selected === d.from) {
        clearSelection();
      } else {
        select(d.from);
      }
      return;
    }

    clearSelection();
    if (to >= 0) attempt(d.from, to);
  }

  tray.addEventListener('pointerup', endDrag);
  tray.addEventListener('pointercancel', endDrag);

  /* ── screens ───────────────────────────────────────────────────────────── */
  function show(id) {
    if (id !== 'screen-payoff') { Sfx.stop('celebrate'); Sfx.stop('voice'); }
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('is-on');
    document.getElementById(id).classList.add('is-on');
  }

  function start(endless) {
    state = R.createState((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    state.endless = endless;
    els = {};
    busy = false;
    clearSelection();
    buildCells();
    drawEarDots();
    sync();
    drawHud();
    show('screen-game');
  }

  /* The collections page: every tier of every chain, so the pieces can be looked
     at properly rather than glimpsed on a tray. Built from Rules so it cannot
     drift out of step with what the game actually deals. */
  function showCollections() {
    var list = document.getElementById('collection-list');
    list.innerHTML = '';
    R.COLLECTIONS.forEach(function (c) {
      var row = document.createElement('section');
      row.className = 'coll-row';

      var name = document.createElement('h3');
      name.className = 'coll-name';
      name.textContent = COLLECTION_LABEL[c];
      row.appendChild(name);

      var strip = document.createElement('ol');
      strip.className = 'coll-strip';
      for (var t = 1; t <= R.MAX_TIER; t++) {
        var li = document.createElement('li');
        var img = document.createElement('img');
        img.src = 'assets/pieces/' + c + '_' + t + '.png';
        img.alt = '';
        li.appendChild(img);
        strip.appendChild(li);
      }
      row.appendChild(strip);
      list.appendChild(row);
    });
    show('screen-collections');
  }

  function showPayoff() {
    show('screen-payoff');
    Sfx.play('celebrate');
    Sfx.play('voice');        /* layered over the sting, silent if not recorded */
  }

  function syncMuteGlyph() {
    var btn = document.querySelector('[data-act="mute"]');
    var off = Sfx.isMuted();
    document.getElementById('mute-glyph').textContent = off ? '✕' : '♪';
    btn.classList.toggle('is-off', off);
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    Sfx.unlock();

    switch (btn.dataset.act) {
      case 'play-birthday': start(false); break;
      case 'play-endless':  start(true);  break;
      case 'collections':   showCollections(); break;
      case 'manual':        document.getElementById('manual').hidden = false; break;
      case 'close-manual':  document.getElementById('manual').hidden = true;  break;
      case 'home':          show('screen-title'); break;
      case 'mute':          Sfx.toggleMute(); syncMuteGlyph(); break;
      case 'pouch':
        if (!busy) runEvents(R.spawn(state));
        break;
    }
  });

  document.getElementById('manual').addEventListener('click', function (ev) {
    if (ev.target === this) this.hidden = true;
  });

  drawEarDots();
  syncMuteGlyph();

  /* Deep links, so any screen can be previewed without playing to it:
     #game, #endless, #payoff, #manual, #collections */
  (function (hash) {
    if (hash === '#manual') document.getElementById('manual').hidden = false;
    else if (hash === '#game') start(false);
    else if (hash === '#endless') start(true);
    else if (hash === '#payoff') { start(false); state.score = R.TARGET; drawHud(); showPayoff(); }
    else if (hash === '#collections') showCollections();
  })(location.hash);

  /* exposed so the smoke test can drive a full game headlessly */
  window.Game = {
    start: start,
    attempt: attempt,
    getState: function () { return state; },
    showPayoff: showPayoff
  };
})();
