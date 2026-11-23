/* Match engine: spawning, movement, the coin-transfer gun battle,
 * the 2-minute location highlight, the storm and the Treasure Horse. */
window.OJ = window.OJ || {};

OJ.Engine = (function () {
  var C = OJ.CONFIG;
  var U = OJ.util;
  var E = OJ.Entities;
  var Island = OJ.Island;

  var match = null;

  function newMatch(seed, humanName) {
    Island.generate(seed);
    var rng = U.mulberry32(seed + 7777);

    var names = C.names.slice();
    U.shuffle(names, rng);

    var players = [];
    var i, p, pt;
    for (i = 0; i < C.match.maxPlayers; i++) {
      pt = Island.randomLandPoint(rng, 50);
      p = E.createPlayer({
        id: i,
        name: i === 0 ? (humanName || 'You') : names[i % names.length] + (i > names.length ? i : ''),
        isHuman: i === 0,
        x: pt.x, y: pt.y
      });
      if (!p.isHuman) OJ.Bots.attach(p);
      players.push(p);
    }

    var byId = {};
    for (i = 0; i < players.length; i++) byId[players[i].id] = players[i];

    match = {
      seed: seed,
      players: players,
      byId: byId,
      human: players[0],
      bullets: [],
      horse: null,
      events: [],
      time: 0,                 // match time in seconds
      stormActive: false,
      stormProgress: 0,
      lastHighlightIndex: -1,
      highlightStrength: 0,
      highlightPings: [],
      shotsFired: 0,
      finished: false,
      standings: []
    };
    return match;
  }

  function log(text, kind) {
    if (!match) return;
    match.events.unshift({ text: text, kind: kind || 'info', life: 6 });
    if (match.events.length > 40) match.events.pop();
  }

  /* ---------- firing ---------- */

  function tryFire(p, now) {
    if (p.swimming && !C.movement.shootWhileSwimming) return;
    if (p.reloading) return;
    if (now < p.nextShotAt) return;
    if (p.mag <= 0) { tryReload(p, now); return; }
    p.mag--;
    p.nextShotAt = now + C.combat.fireIntervalSeconds;
    p.muzzleUntil = now + 0.05;
    var muzzleDist = C.combat.playerRadius + 10;
    match.bullets.push(E.createBullet(
      p,
      p.x + Math.cos(p.angle) * muzzleDist,
      p.y + Math.sin(p.angle) * muzzleDist,
      p.angle
    ));
    match.shotsFired++;
  }

  function tryReload(p, now) {
    if (p.reloading || p.mag >= C.combat.magazineSize || p.reserve < 1) return;
    p.reloading = true;
    p.reloadUntil = now + C.combat.reloadSeconds;
  }

  function finishReload(p) {
    var need = C.combat.magazineSize - p.mag;
    var take = Math.min(need, Math.floor(p.reserve));
    p.mag += take;
    p.reserve -= take;
    p.reloading = false;
  }

  /* ---------- the coin transfer rule (spec section 3) ---------- */

  function registerHit(shooter, victim, now) {
    victim.hits++;
    shooter.hits++;
    // Nobody is eliminated. A hit only moves coins.
    if (now - victim.lastHitAt < C.combat.hitCooldownSeconds) return;
    victim.lastHitAt = now;
    victim.lastHitBy = shooter.id;

    if (victim.coins <= 0) {
      E.addPopup(victim, 'no coins', '#9aa7b8');
      return;
    }
    var amount = Math.min(C.combat.coinsPerHit, victim.coins);
    victim.coins -= amount;
    shooter.coins += amount;
    victim.coinsLost += amount;
    shooter.coinsStolen += amount;

    E.addPopup(victim, '-' + amount + ' Coin', '#ff6b6b');
    E.addPopup(shooter, '+' + amount + ' Coin', '#ffd166');
    log(shooter.name + ' → ' + victim.name + '  +' + amount + ' Coin', 'hit');
    if (shooter.isHuman || victim.isHuman) OJ.UI.flashCoin(shooter.isHuman ? 1 : -1);
  }

  function registerHorseHit(shooter, now) {
    var h = match.horse;
    if (!h || !h.alive) return;
    if (now - h.lastHitAt < C.horse.hitCooldownSeconds) return;
    h.lastHitAt = now;
    var amount = Math.min(C.horse.coinsPerHit, h.coins);
    h.coins -= amount;
    shooter.coins += amount;
    shooter.horseHits++;
    E.addPopup(shooter, '+' + amount + ' Coin', '#ffd166');
    E.addPopup(h, '-' + amount, '#ff9f43');
    if (shooter.isHuman) OJ.UI.flashCoin(1);
    if (h.coins <= 0) {
      h.alive = false;
      h.respawnAt = match.time + C.horse.respawnSeconds;
      log('Treasure Horse is out of Coins - returning with new Coins...', 'horse');
    }
  }

  /* ---------- per-frame update ---------- */

  function update(dt, clock) {
    if (!match) return;
    var now = clock.matchTime;
    match.time = now;

    /* storm + flood (spec section 5) */
    match.stormActive = clock.stormActive;
    match.stormProgress = clock.stormProgress;
    Island.setFlood(match.stormProgress * C.storm.maxFloodRatio);

    if (match.stormActive && !match.horse) {
      var hp = Island.randomLandPoint(Math.random, 120);
      match.horse = E.createHorse(hp.x, hp.y);
      log('Storm incoming! Water is rising. The Treasure Horse has arrived.', 'storm');
    }

    /* 2-minute location highlight (spec section 4) */
    var hIndex = OJ.Schedule.highlightIndex(now);
    if (hIndex > 0 && hIndex !== match.lastHighlightIndex) {
      match.lastHighlightIndex = hIndex;
      match.highlightPings = match.players.map(function (p) {
        return { x: p.x, y: p.y, id: p.id, color: p.color };
      });
      log('Player locations highlighted on the map', 'ping');
    }
    match.highlightStrength = OJ.Schedule.highlightStrength(now);

    /* players */
    var i, p;
    for (i = 0; i < match.players.length; i++) {
      p = match.players[i];
      if (!p.isHuman) OJ.Bots.update(p, match, dt, now);
      updatePlayer(p, dt, now);
      E.updatePopups(p, dt);
    }

    /* horse */
    updateHorse(dt, now);

    /* bullets */
    updateBullets(dt, now);

    /* event feed decay */
    for (i = match.events.length - 1; i >= 0; i--) {
      match.events[i].life -= dt;
    }
  }

  function updatePlayer(p, dt, now) {
    var depth = Island.waterDepth(p.x, p.y);
    p.swimming = depth > 0;

    var speed = p.swimming
      ? C.movement.swimSpeed
      : (p.sprinting ? C.movement.sprintSpeed : C.movement.walkSpeed);

    var mx = p.moveX || 0, my = p.moveY || 0;
    var len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    p.vx = mx * speed;
    p.vy = my * speed;

    var nx = p.x + p.vx * dt;
    var ny = p.y + p.vy * dt;

    var fixed = Island.resolve(nx, ny, C.combat.playerRadius);
    nx = fixed.x; ny = fixed.y;

    // Hard clamp: deep water is not swimmable, it just pushes you back in.
    var a = Math.atan2(ny - Island.data.cy, nx - Island.data.cx);
    var d = U.dist(nx, ny, Island.data.cx, Island.data.cy);
    var limit = Island.landRadius(a) + 150;
    if (d > limit) {
      nx = Island.data.cx + Math.cos(a) * limit;
      ny = Island.data.cy + Math.sin(a) * limit;
    }

    p.x = nx; p.y = ny;

    // ammo scavenged back into the reserve, so nobody is unarmed for 20 minutes
    if (p.reserve < C.combat.reserveAmmo) {
      p.reserve = Math.min(C.combat.reserveAmmo, p.reserve + C.combat.reserveRegenPerSecond * dt);
    }

    if (p.reloading && now >= p.reloadUntil) finishReload(p);
    if (p.wantsReload) { tryReload(p, now); p.wantsReload = false; }
    if (p.wantsFire) tryFire(p, now);
    if (p.mag <= 0 && !p.reloading) tryReload(p, now);
  }

  function updateHorse(dt, now) {
    var h = match.horse;
    if (!h) return;
    E.updatePopups(h, dt);
    h.bob += dt * 6;

    if (!h.alive) {
      if (now >= h.respawnAt) {
        // "When its Coins run out, the SAME Horse returns with new Coins."
        var pt = Island.randomLandPoint(Math.random, 120);
        h.x = pt.x; h.y = pt.y;
        h.coins = C.horse.coins;
        h.alive = true;
        h.popups = [];
        log('Treasure Horse returned with ' + C.horse.coins + ' Coins!', 'horse');
      }
      return;
    }

    if (now > h.nextRepathAt || U.dist(h.x, h.y, h.targetX, h.targetY) < 70) {
      var t = Island.randomLandPoint(Math.random, 140);
      h.targetX = t.x; h.targetY = t.y;
      h.nextRepathAt = now + U.rand(4, 9);
    }
    var ang = U.angleTo(h.x, h.y, h.targetX, h.targetY);
    h.angle = ang;
    var nx = h.x + Math.cos(ang) * C.horse.speed * dt;
    var ny = h.y + Math.sin(ang) * C.horse.speed * dt;
    var fixed = Island.resolve(nx, ny, C.horse.radius);
    var safe = Island.nearestLand(fixed.x, fixed.y, 60);
    h.x = safe.x; h.y = safe.y;
  }

  function updateBullets(dt, now) {
    var hitR = C.combat.hitRadius;
    for (var i = match.bullets.length - 1; i >= 0; i--) {
      var b = match.bullets[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl -= dt;

      var dead = b.ttl <= 0;

      if (!dead && Island.blocked(b.x, b.y, 3)) dead = true;

      if (!dead) {
        // horse first - it is the big target during the storm
        var h = match.horse;
        if (h && h.alive && U.dist2(b.x, b.y, h.x, h.y) < (C.horse.radius + 6) * (C.horse.radius + 6)) {
          registerHorseHit(b.ownerRef, now);
          dead = true;
        }
      }

      if (!dead) {
        for (var j = 0; j < match.players.length; j++) {
          var q = match.players[j];
          if (q.id === b.owner) continue;
          if (U.dist2(b.x, b.y, q.x, q.y) < hitR * hitR) {
            registerHit(b.ownerRef, q, now);
            dead = true;
            break;
          }
        }
      }

      if (dead) match.bullets.splice(i, 1);
    }
  }

  /* ---------- results (spec section 6) ---------- */

  function finish() {
    if (!match || match.finished) return match && match.standings;
    match.finished = true;
    match.standings = match.players.slice().sort(function (a, b) {
      if (b.coins !== a.coins) return b.coins - a.coins;
      return b.coinsStolen - a.coinsStolen;
    });
    return match.standings;
  }

  return {
    get match() { return match; },
    newMatch: newMatch,
    update: update,
    finish: finish,
    tryFire: tryFire,
    tryReload: tryReload,
    log: log
  };
})();
