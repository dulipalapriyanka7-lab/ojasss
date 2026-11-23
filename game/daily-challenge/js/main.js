/* Boot, input and the phase state machine that walks the whole flow:
 * LOBBY → SHIP → MATCH (ping / storm / horse) → RESULTS → LOBBY … forever. */
(function () {
  var C = OJ.CONFIG;
  var U = OJ.util;
  var Sched = OJ.Schedule;
  var Engine = OJ.Engine;
  var Render = OJ.Render;
  var UI = OJ.UI;

  var gameCanvas, gctx, miniCanvas, mctx, shipCanvas, sctx;
  var keys = {};
  var mouse = { x: 0, y: 0, down: false, active: false };
  var touchFire = false;
  var firePulse = false;   // a click that starts and ends inside one frame still fires
  var stick = { active: false, dx: 0, dy: 0, id: null };

  // You register once; after that the lobby keeps you on every following ship,
  // which is what the 24/7 cycle means for a player who stays on the Game tab.
  var joinedFromCycle = null;
  var lastPhase = null;
  var lastCycle = null;
  var announcedStorm = false;
  var announcedHighlight = -1;
  var lastFrame = 0;

  /* ---------- canvas ---------- */

  function fit(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
  }

  function fitMini() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = miniCanvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (miniCanvas.width !== w || miniCanvas.height !== h) {
      miniCanvas.width = w; miniCanvas.height = h;
    }
  }

  function fitAll() {
    fit(gameCanvas); fit(shipCanvas); fitMini();
  }

  /* ---------- input ---------- */

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      keys[e.key.toLowerCase()] = true;
      if (e.key === ' ') e.preventDefault();
      if (e.key.toLowerCase() === 'r') {
        var m = Engine.match;
        if (m) m.human.wantsReload = true;
      }
    });
    window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

    function trackMouse(e) {
      var r = gameCanvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.active = true;
    }
    gameCanvas.addEventListener('mousemove', trackMouse);
    gameCanvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      trackMouse(e);
      mouse.down = true;
      firePulse = true;
    });
    window.addEventListener('mouseup', function () { mouse.down = false; });
    gameCanvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // touch joystick
    var stickEl = document.getElementById('stick');
    var nub = document.getElementById('stick-nub');
    function stickStart(e) {
      var t = e.changedTouches ? e.changedTouches[0] : e;
      stick.active = true; stick.id = t.identifier;
      stickMove(e);
      e.preventDefault();
    }
    function stickMove(e) {
      if (!stick.active) return;
      var t = e.changedTouches ? e.changedTouches[0] : e;
      var r = stickEl.getBoundingClientRect();
      var dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      var len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      stick.dx = dx; stick.dy = dy;
      nub.style.transform = 'translate(' + dx * 34 + 'px,' + dy * 34 + 'px)';
      e.preventDefault();
    }
    function stickEnd() {
      stick.active = false; stick.dx = 0; stick.dy = 0;
      nub.style.transform = '';
    }
    stickEl.addEventListener('touchstart', stickStart, { passive: false });
    stickEl.addEventListener('touchmove', stickMove, { passive: false });
    stickEl.addEventListener('touchend', stickEnd);
    stickEl.addEventListener('mousedown', stickStart);
    window.addEventListener('mousemove', function (e) { if (stick.active && !e.touches) stickMove(e); });
    window.addEventListener('mouseup', function () { if (stick.active) stickEnd(); });

    var fire = document.getElementById('btn-fire');
    ['touchstart', 'mousedown'].forEach(function (ev) {
      fire.addEventListener(ev, function (e) { touchFire = true; firePulse = true; e.preventDefault(); }, { passive: false });
    });
    ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(function (ev) {
      fire.addEventListener(ev, function () { touchFire = false; });
    });
    document.getElementById('btn-reload').addEventListener('click', function () {
      var m = Engine.match;
      if (m) m.human.wantsReload = true;
    });

    window.addEventListener('resize', fitAll);
  }

  function nearestTarget(me, match) {
    var best = null, bestD = 900 * 900;
    var i, q, d;
    for (i = 0; i < match.players.length; i++) {
      q = match.players[i];
      if (q === me) continue;
      d = U.dist2(me.x, me.y, q.x, q.y);
      if (d < bestD) { bestD = d; best = q; }
    }
    var h = match.horse;
    if (h && h.alive) {
      d = U.dist2(me.x, me.y, h.x, h.y);
      if (d < bestD) { best = h; }
    }
    return best;
  }

  function applyHumanInput(match) {
    var me = match.human;
    var mx = 0, my = 0;

    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;

    if (stick.dx || stick.dy) { mx += stick.dx; my += stick.dy; }

    me.moveX = mx; me.moveY = my;
    me.sprinting = !!(keys['shift']);

    // aim: mouse when present, otherwise auto-aim at the nearest target
    if (mouse.active) {
      var cw = gameCanvas.getBoundingClientRect().width;
      var ch = gameCanvas.getBoundingClientRect().height;
      me.angle = Math.atan2(mouse.y - ch / 2, mouse.x - cw / 2);
    } else {
      var t = nearestTarget(me, match);
      if (t) me.angle = U.angleTo(me.x, me.y, t.x, t.y);
      else if (mx || my) me.angle = Math.atan2(my, mx);
    }
    if (touchFire && !mouse.active) {
      var t2 = nearestTarget(me, match);
      if (t2) me.angle = U.angleTo(me.x, me.y, t2.x, t2.y);
    }

    me.wantsFire = mouse.down || touchFire || firePulse || !!keys[' '];
    firePulse = false;
  }

  /* ---------- match lifecycle ---------- */

  function ensureMatch(seed) {
    var m = Engine.match;
    if (!m || m.seed !== seed) {
      m = Engine.newMatch(seed, 'You');
      Render.setCam(m.human.x, m.human.y, 1);
      announcedStorm = false;
      announcedHighlight = -1;
    }
    return m;
  }

  function dropPlayers(match) {
    // the ship has just dropped everyone: scatter them around the island
    for (var i = 0; i < match.players.length; i++) {
      var p = match.players[i];
      var ang = (i / match.players.length) * Math.PI * 2 + U.rand(-0.2, 0.2);
      var rad = OJ.Island.coastRadius(ang) * U.rand(0.35, 0.82);
      var pt = OJ.Island.nearestLand(
        OJ.Island.data.cx + Math.cos(ang) * rad,
        OJ.Island.data.cy + Math.sin(ang) * rad, 60);
      p.x = pt.x; p.y = pt.y;
      p.coins = C.match.startingCoins;
      p.coinsStolen = 0; p.coinsLost = 0; p.horseHits = 0; p.hits = 0;
      p.mag = C.combat.magazineSize; p.reserve = C.combat.reserveAmmo;
      p.reloading = false; p.popups = [];
    }
    Render.setCam(match.human.x, match.human.y, 1);
  }

  function registeredCount(clock) {
    // the lobby fills up over the break so the count feels alive
    var filled;
    if (clock.phase === 'MATCH') filled = C.match.maxPlayers;
    else if (clock.phase === 'SHIP') filled = C.match.maxPlayers;
    else {
      var breakElapsed = clock.cyclePos - C.schedule.matchSeconds;
      var breakTotal = C.schedule.breakSeconds - C.schedule.shipBoardingSeconds;
      filled = Math.round(U.clamp(breakElapsed / breakTotal, 0, 1) * (C.match.maxPlayers - 3)) + 3;
    }
    return Math.min(C.match.maxPlayers, filled);
  }

  function joinedFor(cycleIndex) {
    return joinedFromCycle !== null && cycleIndex >= joinedFromCycle;
  }

  function register(clock) {
    if (joinedFromCycle === null) joinedFromCycle = clock.cycleIndex + 1;
  }

  /* ---------- the loop ---------- */

  function frame(now) {
    requestAnimationFrame(frame);
    // The schedule always follows real time (a throttled tab must not stall the
    // 24/7 clock); physics is clamped so a long frame cannot tunnel bullets.
    var rawDt = Math.min(1.0, (now - lastFrame) / 1000) || 0;
    var dt = Math.min(0.05, rawDt);
    lastFrame = now;

    Sched.advance(rawDt);
    var clock = Sched.read();

    var playingThis = clock.phase === 'MATCH' && joinedFor(clock.cycleIndex);
    var boardingNext = clock.phase === 'SHIP' && joinedFor(clock.cycleIndex + 1);
    var justPlayed = clock.phase === 'RESULTS' && joinedFor(clock.cycleIndex);

    /* --- phase transitions --- */
    var phaseKey = clock.phase + ':' + clock.cycleIndex;
    if (phaseKey !== lastPhase) {
      onPhaseEnter(clock, playingThis, boardingNext, justPlayed);
      lastPhase = phaseKey;
    }

    /* --- per-phase update --- */
    if (boardingNext) {
      var m0 = ensureMatch(clock.cycleIndex + 1);
      UI.updateShip(clock, registeredCount(clock));
      fit(shipCanvas);
      Render.drawShip(sctx, clock.phaseElapsed / clock.phaseTotal, m0.players.length);

    } else if (playingThis) {
      var m = ensureMatch(clock.cycleIndex);
      applyHumanInput(m);
      // fixed-ish stepping keeps bullets honest at high clock speeds
      var scaled = Math.min(rawDt, 0.25) * Sched.state.timeScale;
      var steps = Math.min(10, Math.max(1, Math.ceil(scaled / 0.033)));
      var sub = scaled / steps;
      for (var s = 0; s < steps; s++) {
        Engine.update(sub, {
          matchTime: clock.matchTime - scaled + sub * (s + 1),
          stormActive: clock.stormActive,
          stormProgress: clock.stormProgress
        });
      }
      announce(m, clock);
      Render.follow(m.human, dt);
      fit(gameCanvas);
      fitMini();
      // keep roughly the same slice of the island on screen at any size
      Render.cam.zoom = Math.min(gameCanvas.width, gameCanvas.height) / 1700;
      Render.drawWorld(gctx, m, clock);
      Render.drawMinimap(mctx, m, clock);
      UI.updateHud(m, clock);

    } else if (justPlayed) {
      UI.updateResultsCountdown(clock);

    } else {
      UI.updateLobby(clock, joinedFor(clock.cycleIndex + 1), registeredCount(clock));
    }

    UI.updateDev(clock);
  }

  function onPhaseEnter(clock, playingThis, boardingNext, justPlayed) {
    if (boardingNext) {
      ensureMatch(clock.cycleIndex + 1);
      UI.show('ship');
      return;
    }
    if (playingThis) {
      var m = ensureMatch(clock.cycleIndex);
      if (!m.dropped) { dropPlayers(m); m.dropped = true; }
      UI.show('play');
      UI.banner('Game started — steal Coins by shooting other players', 'ping', 4);
      return;
    }
    if (justPlayed) {
      var mm = Engine.match;
      if (mm && mm.seed === clock.cycleIndex) {
        var standings = Engine.finish();
        UI.showResults(standings, mm.human.id);
        return;
      }
    }
    UI.show('lobby');
  }

  function announce(match, clock) {
    // storm + horse at 18:00
    if (clock.stormActive && !announcedStorm) {
      announcedStorm = true;
      UI.banner('⚠ Storm incoming! Water is rising — Treasure Horse has arrived', '', 5);
    }
    // location ping every 2 minutes
    var hi = Sched.highlightIndex(clock.matchTime);
    if (hi > 0 && hi !== announcedHighlight) {
      announcedHighlight = hi;
      UI.banner('📍 Player locations highlighted on the map', 'ping', 3);
    }
  }

  /* ---------- boot ---------- */

  function boot() {
    gameCanvas = document.getElementById('game-canvas');
    gctx = gameCanvas.getContext('2d');
    miniCanvas = document.getElementById('minimap');
    mctx = miniCanvas.getContext('2d');
    shipCanvas = document.getElementById('ship-canvas');
    sctx = shipCanvas.getContext('2d');

    Sched.init();
    OJ.Island.generate(1);

    UI.init({
      onJoin: function () {
        register(Sched.read());
        lastPhase = null; // re-evaluate immediately
      },
      onSpeed: function (v) { Sched.setTimeScale(v); },
      onPause: function () {
        Sched.state.paused = !Sched.state.paused;
        return Sched.state.paused;
      },
      onForceNext: function () {
        var clock = Sched.read();
        register(clock);
        Sched.forceNextMatch();
        lastPhase = null;
      },
      onSkip: function (what) {
        var clock = Sched.read();
        if (what === 'match') {
          register(clock);
          Sched.forceNextMatch();
        } else if (what === 'storm') {
          if (clock.phase === 'MATCH') {
            Sched.skipWithinCycle(C.schedule.stormStartAtSeconds - 3);
          } else {
            register(clock);
            Sched.forceNextMatch();
          }
        } else if (what === 'highlight') {
          if (clock.phase === 'MATCH') {
            var next = (Sched.highlightIndex(clock.matchTime) + 1) * C.schedule.highlightEverySeconds;
            Sched.skipWithinCycle(Math.min(next, C.schedule.matchSeconds - 1));
          }
        } else if (what === 'end') {
          if (clock.phase === 'MATCH') Sched.skipWithinCycle(C.schedule.matchSeconds + 0.5);
        }
        lastPhase = null;
      }
    });

    fitAll();
    bindInput();
    UI.show('lobby');
    requestAnimationFrame(function (t) { lastFrame = t; requestAnimationFrame(frame); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
