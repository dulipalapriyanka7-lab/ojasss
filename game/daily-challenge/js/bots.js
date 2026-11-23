/* Bot brains - they stand in for the other 19 registered players. */
window.OJ = window.OJ || {};

OJ.Bots = (function () {
  var C = OJ.CONFIG;
  var B = OJ.CONFIG.bots;
  var U = OJ.util;

  function attach(p) {
    p.bot = {
      targetX: p.x, targetY: p.y,
      nextRepathAt: 0,
      enemyId: null,
      lockUntil: 0,
      reactAt: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      nextStrafeFlip: 0,
      greedy: Math.random() < B.horseGreedDuringStorm
    };
  }

  function pickEnemy(p, match) {
    var best = null, bestD = B.viewRange * B.viewRange;
    for (var i = 0; i < match.players.length; i++) {
      var q = match.players[i];
      if (q === p) continue;
      if (q.coins <= 0 && Math.random() < 0.7) continue; // broke players are poor targets
      var d = U.dist2(p.x, p.y, q.x, q.y);
      if (d < bestD) { bestD = d; best = q; }
    }
    return best;
  }

  function update(p, match, dt, now) {
    var bot = p.bot;
    var island = OJ.Island;

    /* --- choose what to shoot at --- */
    var horse = match.horse;
    var target = null;
    var wantHorse = false;

    if (horse && horse.alive && bot.greedy) {
      var dh = U.dist(p.x, p.y, horse.x, horse.y);
      if (dh < B.viewRange * 1.3) { target = horse; wantHorse = true; }
    }
    if (!target) {
      if (now > bot.lockUntil || !bot.enemyId) {
        var e = pickEnemy(p, match);
        bot.enemyId = e ? e.id : null;
        bot.lockUntil = now + 2.5;
      }
      if (bot.enemyId != null) {
        var ref = match.byId[bot.enemyId];
        if (ref && U.dist(p.x, p.y, ref.x, ref.y) < B.viewRange * 1.25) target = ref;
        else bot.enemyId = null;
      }
    }

    /* --- aim --- */
    var desiredAngle = p.angle;
    if (target) {
      // lead the shot a little
      var lead = wantHorse ? 0.12 : 0.18;
      var tx = target.x + (target.vx || 0) * lead;
      var ty = target.y + (target.vy || 0) * lead;
      desiredAngle = U.angleTo(p.x, p.y, tx, ty) + U.rand(-B.aimErrorRad, B.aimErrorRad);
    }
    var diff = Math.atan2(Math.sin(desiredAngle - p.angle), Math.cos(desiredAngle - p.angle));
    p.angle += U.clamp(diff, -7 * dt, 7 * dt);

    /* --- move --- */
    var mx = 0, my = 0;
    var flooded = match.stormActive;

    if (target) {
      var d = U.dist(p.x, p.y, target.x, target.y);
      var ideal = wantHorse ? 230 : 310;
      var toward = U.angleTo(p.x, p.y, target.x, target.y);
      var drive = U.clamp((d - ideal) / 160, -1, 1);
      mx += Math.cos(toward) * drive;
      my += Math.sin(toward) * drive;
      if (now > bot.nextStrafeFlip) {
        bot.strafeDir *= -1;
        bot.nextStrafeFlip = now + U.rand(0.8, 2.2);
      }
      mx += Math.cos(toward + Math.PI / 2) * 0.75 * bot.strafeDir;
      my += Math.sin(toward + Math.PI / 2) * 0.75 * bot.strafeDir;
    } else {
      if (now > bot.nextRepathAt) {
        var pt = island.randomLandPoint(Math.random, 60);
        bot.targetX = pt.x; bot.targetY = pt.y;
        bot.nextRepathAt = now + B.repathSeconds + U.rand(0, 3);
      }
      var tw = U.angleTo(p.x, p.y, bot.targetX, bot.targetY);
      mx += Math.cos(tw); my += Math.sin(tw);
      if (U.dist(p.x, p.y, bot.targetX, bot.targetY) < 90) bot.nextRepathAt = 0;
      p.angle = tw;
    }

    // run from the rising water
    if (flooded || p.swimming) {
      var depth = island.waterDepth(p.x, p.y);
      if (depth > 0) {
        var inward = U.angleTo(p.x, p.y, island.data.cx, island.data.cy);
        mx += Math.cos(inward) * (1.6 + depth * 2);
        my += Math.sin(inward) * (1.6 + depth * 2);
      }
    }

    var len = Math.hypot(mx, my) || 1;
    p.moveX = mx / len;
    p.moveY = my / len;
    p.sprinting = !target && Math.random() < 0.6;

    /* --- shoot --- */
    p.wantsFire = false;
    if (target && !p.swimming) {
      var dd = U.dist(p.x, p.y, target.x, target.y);
      var aimed = Math.abs(diff) < 0.22;
      if (dd < B.fireRange && aimed) {
        if (now > bot.reactAt) p.wantsFire = true;
      } else {
        bot.reactAt = now + B.reactionSeconds;
      }
    }
    p.wantsReload = p.mag <= 0;
  }

  return { attach: attach, update: update };
})();
