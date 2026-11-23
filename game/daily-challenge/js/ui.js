/* All DOM work: screens, lobby, HUD, results and the test panel. */
window.OJ = window.OJ || {};

OJ.UI = (function () {
  var C = OJ.CONFIG;
  var U = OJ.util;

  var el = {};
  var bannerUntil = 0;
  var coinFlashUntil = 0;
  var current = 'lobby';

  function $(id) { return document.getElementById(id); }

  function init(hooks) {
    el = {
      screens: {
        lobby: $('screen-lobby'),
        ship: $('screen-ship'),
        play: $('screen-play'),
        results: $('screen-results')
      },
      lobbyPhase: $('lobby-phase'),
      lobbyCountdown: $('lobby-countdown'),
      lobbySub: $('lobby-sub'),
      lobbyBar: $('lobby-bar-fill'),
      lobbyCount: $('lobby-count'),
      rosterDots: $('roster-dots'),
      btnJoin: $('btn-join'),
      lobbyNote: $('lobby-note'),
      statPlay: $('stat-play'),
      statBreak: $('stat-break'),

      shipCount: $('ship-count'),
      shipTimer: $('ship-timer'),

      hudPlayers: $('hud-players'),
      hudTime: $('hud-time'),
      hudAmmo: $('hud-ammo'),
      hudReserve: $('hud-reserve'),
      hudCoins: $('hud-coins'),
      hudCoin: $('hud-coin'),
      hudRank: $('hud-rank'),
      hudBanner: $('hud-banner'),
      hudFeed: $('hud-feed'),
      minimapLabel: $('minimap-label'),

      podium: $('podium'),
      yourResult: $('your-result'),
      resultsNext: $('results-next'),
      btnBack: $('btn-back-lobby'),

      devSpeed: $('dev-speed'),
      devRead: $('dev-read'),
      devPanel: $('devpanel'),
      devPause: $('dev-pause'),
      devNext: $('dev-next')
    };

    // roster dots
    for (var i = 0; i < C.match.maxPlayers; i++) {
      el.rosterDots.appendChild(document.createElement('i'));
    }

    // speed presets
    C.speedPresets.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.value; o.textContent = p.label;
      if (p.value === C.defaultTimeScale) o.selected = true;
      el.devSpeed.appendChild(o);
    });
    el.devSpeed.addEventListener('change', function () {
      hooks.onSpeed(parseFloat(el.devSpeed.value));
    });

    $('dev-toggle').addEventListener('click', function () {
      el.devPanel.classList.toggle('closed');
      this.textContent = el.devPanel.classList.contains('closed') ? '+' : '—';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-skip]'), function (b) {
      b.addEventListener('click', function () { hooks.onSkip(b.dataset.skip); });
    });
    el.devPause.addEventListener('click', function () {
      var paused = hooks.onPause();
      el.devPause.textContent = paused ? '▶ Resume clock' : '⏸ Pause clock';
    });
    el.devNext.addEventListener('click', hooks.onForceNext);
    el.btnJoin.addEventListener('click', hooks.onJoin);
    el.btnBack.addEventListener('click', function () { show('lobby'); });

    // nav buttons are cosmetic in the prototype
    Array.prototype.forEach.call(document.querySelectorAll('.navbtn'), function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.navbtn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
      });
    });

    // show real schedule numbers from the config
    el.statPlay.textContent = Math.round(C.schedule.matchSeconds / 60) + ' mins';
    el.statBreak.textContent = Math.round(C.schedule.breakSeconds / 60) + ' mins';
  }

  function show(name) {
    current = name;
    Object.keys(el.screens).forEach(function (k) {
      el.screens[k].classList.toggle('active', k === name);
    });
  }

  function currentScreen() { return current; }

  /* ---------- lobby ---------- */

  function updateLobby(clock, joined, registeredCount) {
    var sc = OJ.Schedule.state.timeScale;
    var human = function (s) { return U.mmss(s / 1 /* game seconds */); };

    if (clock.phase === 'MATCH') {
      el.lobbyPhase.textContent = 'Match in progress';
      el.lobbyCountdown.textContent = human(clock.matchRemaining);
      el.lobbySub.textContent = 'A game is already running. You are registered for the next one.';
      el.lobbyBar.style.width = (clock.matchTime / C.schedule.matchSeconds * 100) + '%';
    } else if (clock.phase === 'RESULTS') {
      el.lobbyPhase.textContent = 'Break — results';
      el.lobbyCountdown.textContent = human(clock.untilNextMatch);
      el.lobbySub.textContent = 'Counting Coins from the last game.';
      el.lobbyBar.style.width = (clock.phaseElapsed / clock.phaseTotal * 100) + '%';
    } else if (clock.phase === 'SHIP') {
      el.lobbyPhase.textContent = 'Boarding';
      el.lobbyCountdown.textContent = human(clock.phaseRemaining);
      el.lobbySub.textContent = 'The ship is collecting players.';
      el.lobbyBar.style.width = (clock.phaseElapsed / clock.phaseTotal * 100) + '%';
    } else {
      el.lobbyPhase.textContent = 'Next game starts in';
      el.lobbyCountdown.textContent = human(clock.untilNextMatch);
      el.lobbySub.textContent = 'Break — the next game starts automatically.';
      el.lobbyBar.style.width = (clock.phaseElapsed / clock.phaseTotal * 100) + '%';
    }

    el.lobbyCount.textContent = registeredCount + '/' + C.match.maxPlayers;
    var dots = el.rosterDots.children;
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('on', i < registeredCount);
    }

    el.btnJoin.textContent = joined ? 'REGISTERED ✓' : 'JOIN GAME';
    el.btnJoin.disabled = joined;
    el.lobbyNote.textContent = joined
      ? 'You are on the next ship. Stay here — the game opens automatically.'
      : 'The server runs 24/7 — no admin needs to start a round.';
  }

  /* ---------- ship ---------- */

  function updateShip(clock, count) {
    el.shipCount.textContent = count + '/' + C.match.maxPlayers;
    el.shipTimer.textContent = 'Match starting in ' + U.mmss(clock.phaseRemaining);
  }

  /* ---------- match HUD ---------- */

  function updateHud(match, clock) {
    var me = match.human;
    el.hudPlayers.textContent = match.players.length + '/' + C.match.maxPlayers;
    el.hudTime.textContent = U.mmss(clock.matchRemaining);
    el.hudAmmo.textContent = me.reloading ? '--' : me.mag;
    el.hudReserve.textContent = Math.floor(me.reserve);
    el.hudCoins.textContent = me.coins;

    var rank = 1;
    for (var i = 0; i < match.players.length; i++) {
      if (match.players[i].coins > me.coins) rank++;
    }
    el.hudRank.textContent = 'Rank ' + rank + ' / ' + match.players.length;

    // minimap caption
    if (clock.stormActive) {
      el.minimapLabel.textContent = 'Storm — water rising';
    } else {
      el.minimapLabel.textContent = 'Next ping ' +
        U.mmss(OJ.Schedule.secondsToNextHighlight(clock.matchTime));
    }

    // coin flash decay
    if (performance.now() > coinFlashUntil) {
      el.hudCoin.classList.remove('up', 'down');
    }

    // banner decay
    if (performance.now() > bannerUntil) el.hudBanner.classList.remove('show');

    renderFeed(match);
  }

  function renderFeed(match) {
    var html = '';
    var shown = 0;
    for (var i = 0; i < match.events.length && shown < 5; i++) {
      var e = match.events[i];
      if (e.life <= 0) continue;
      html += '<div class="' + e.kind + '">' + escapeHtml(e.text) + '</div>';
      shown++;
    }
    el.hudFeed.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function banner(text, kind, seconds) {
    el.hudBanner.textContent = text;
    el.hudBanner.className = 'hud-banner show ' + (kind || '');
    bannerUntil = performance.now() + (seconds || 3.5) * 1000;
  }

  function flashCoin(dir) {
    el.hudCoin.classList.remove('up', 'down');
    void el.hudCoin.offsetWidth;
    el.hudCoin.classList.add(dir > 0 ? 'up' : 'down');
    coinFlashUntil = performance.now() + 180;
  }

  /* ---------- results ---------- */

  function showResults(standings, humanId) {
    var html = '';
    var order = [1, 0, 2]; // 2nd, 1st, 3rd for the podium look
    for (var k = 0; k < order.length; k++) {
      var idx = order[k];
      var p = standings[idx];
      if (!p) continue;
      html += '<div class="pod ' + (idx === 0 ? 'p1' : '') + '">' +
        '<div class="place">#' + (idx + 1) + '</div>' +
        '<div class="who">' + escapeHtml(p.name) + '</div>' +
        '<div class="coins">Coins: ' + p.coins + '</div>' +
        '<div class="meta">+' + p.coinsStolen + ' stolen · ' + p.horseHits + ' horse hits</div>' +
        '</div>';
    }
    el.podium.innerHTML = html;

    var myRank = 0, me = null;
    for (var i = 0; i < standings.length; i++) {
      if (standings[i].id === humanId) { myRank = i + 1; me = standings[i]; break; }
    }
    if (me) {
      el.yourResult.innerHTML =
        '<b>You finished #' + myRank + ' of ' + standings.length + '</b> — ' +
        me.coins + ' Coins ' +
        '(started with ' + C.match.startingCoins + ', ' +
        'stole ' + me.coinsStolen + ', lost ' + me.coinsLost + ', ' +
        'took ' + me.horseHits + ' Coins off the Treasure Horse).';
    } else {
      el.yourResult.textContent = 'You watched this round from the lobby.';
    }
    show('results');
  }

  function updateResultsCountdown(clock) {
    el.resultsNext.textContent = U.mmss(clock.untilNextMatch);
  }

  /* ---------- dev readout ---------- */

  function updateDev(clock) {
    el.devRead.innerHTML =
      'phase <b>' + clock.phase + '</b><br>' +
      'match time ' + U.mmss(clock.matchTime) + ' / ' + U.mmss(C.schedule.matchSeconds) + '<br>' +
      'phase left ' + U.mmss(clock.phaseRemaining) + '<br>' +
      'game #' + clock.cycleIndex + ' · ' + OJ.Schedule.state.timeScale + 'x';
  }

  return {
    init: init,
    show: show,
    currentScreen: currentScreen,
    updateLobby: updateLobby,
    updateShip: updateShip,
    updateHud: updateHud,
    showResults: showResults,
    updateResultsCountdown: updateResultsCountdown,
    updateDev: updateDev,
    banner: banner,
    flashCoin: flashCoin
  };
})();
