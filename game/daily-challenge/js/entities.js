/* Entity factories: players, bullets and the Treasure Horse. */
window.OJ = window.OJ || {};

OJ.Entities = (function () {
  var C = OJ.CONFIG;
  var U = OJ.util;

  var PALETTE = [
    '#4ea8ff', '#ff6b6b', '#ffd166', '#8ce99a', '#da77f2', '#ffa94d',
    '#63e6be', '#f783ac', '#9775fa', '#74c0fc', '#ffe066', '#69db7c'
  ];

  function createPlayer(opts) {
    return {
      id: opts.id,
      name: opts.name,
      isHuman: !!opts.isHuman,
      color: opts.color || PALETTE[opts.id % PALETTE.length],
      x: opts.x, y: opts.y,
      vx: 0, vy: 0,
      angle: U.rand(0, Math.PI * 2),
      coins: C.match.startingCoins,
      coinsStolen: 0,
      coinsLost: 0,
      horseHits: 0,
      hits: 0,
      // weapon
      mag: C.combat.magazineSize,
      reserve: C.combat.reserveAmmo,
      reloading: false,
      reloadUntil: 0,
      nextShotAt: 0,
      // state
      lastHitAt: -999,
      lastHitBy: null,
      sprinting: false,
      swimming: false,
      landedAt: 0,
      // bot brain
      bot: null,
      // floating feedback
      popups: []
    };
  }

  function createHorse(x, y) {
    return {
      x: x, y: y,
      angle: 0,
      coins: C.horse.coins,
      maxCoins: C.horse.coins,
      alive: true,
      respawnAt: 0,
      targetX: x, targetY: y,
      nextRepathAt: 0,
      lastHitAt: -999,
      bob: 0,
      popups: []
    };
  }

  function createBullet(owner, x, y, angle) {
    var spread = U.rand(-C.combat.spreadRad, C.combat.spreadRad);
    var a = angle + spread;
    return {
      owner: owner.id,
      ownerRef: owner,
      x: x, y: y,
      px: x, py: y,
      vx: Math.cos(a) * C.combat.bulletSpeed,
      vy: Math.sin(a) * C.combat.bulletSpeed,
      ttl: C.combat.bulletRangeSeconds
    };
  }

  function addPopup(entity, text, color) {
    entity.popups.push({ text: text, color: color || '#ffd166', life: 1.1, dy: 0 });
    if (entity.popups.length > 6) entity.popups.shift();
  }

  function updatePopups(entity, dt) {
    for (var i = entity.popups.length - 1; i >= 0; i--) {
      var p = entity.popups[i];
      p.life -= dt;
      p.dy -= dt * 34;
      if (p.life <= 0) entity.popups.splice(i, 1);
    }
  }

  return {
    PALETTE: PALETTE,
    createPlayer: createPlayer,
    createHorse: createHorse,
    createBullet: createBullet,
    addPopup: addPopup,
    updatePopups: updatePopups
  };
})();
