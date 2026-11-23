/* The island: shape, terrain bake, obstacles and the rising flood. */
window.OJ = window.OJ || {};

OJ.Island = (function () {
  var U = OJ.util;
  var IC = OJ.CONFIG.island;

  var island = {
    size: IC.worldSize,
    cx: IC.worldSize / 2,
    cy: IC.worldSize / 2,
    baseRadius: IC.radius,
    harmonics: [],
    obstacles: [],
    terrain: null,      // offscreen canvas
    terrainScale: 0.5,
    floodRatio: 0       // 0 = dry, grows during the storm
  };

  /** Coast radius for a given angle (the island is a lumpy blob, not a circle). */
  function coastRadius(angle) {
    var r = island.baseRadius, h;
    for (var i = 0; i < island.harmonics.length; i++) {
      h = island.harmonics[i];
      r += island.baseRadius * h.amp * Math.sin(h.freq * angle + h.phase);
    }
    return r;
  }

  /** Current (flooded) land radius for an angle. */
  function landRadius(angle) {
    return coastRadius(angle) * (1 - island.floodRatio);
  }

  function isLand(x, y) {
    var a = Math.atan2(y - island.cy, x - island.cx);
    var d = U.dist(x, y, island.cx, island.cy);
    return d < landRadius(a);
  }

  /** How deep underwater a point is, 0 = dry land, 1 = far out at sea. */
  function waterDepth(x, y) {
    var a = Math.atan2(y - island.cy, x - island.cx);
    var d = U.dist(x, y, island.cx, island.cy);
    var edge = landRadius(a);
    if (d <= edge) return 0;
    return U.clamp((d - edge) / 260, 0, 1);
  }

  /** Push a point back towards dry land. Used to keep everyone on the island. */
  function nearestLand(x, y, margin) {
    var a = Math.atan2(y - island.cy, x - island.cx);
    var max = landRadius(a) - (margin || 30);
    var d = U.dist(x, y, island.cx, island.cy);
    if (d <= max) return { x: x, y: y };
    return { x: island.cx + Math.cos(a) * max, y: island.cy + Math.sin(a) * max };
  }

  function randomLandPoint(rng, margin) {
    var r = rng || Math.random;
    for (var i = 0; i < 80; i++) {
      var a = r() * Math.PI * 2;
      var rad = coastRadius(a) * (0.08 + r() * 0.82);
      var x = island.cx + Math.cos(a) * rad;
      var y = island.cy + Math.sin(a) * rad;
      if (!blocked(x, y, 34)) return { x: x, y: y };
    }
    return { x: island.cx, y: island.cy };
  }

  /* ---------- obstacles ---------- */

  function blocked(x, y, radius) {
    var o, i;
    for (i = 0; i < island.obstacles.length; i++) {
      o = island.obstacles[i];
      if (o.type === 'rock') {
        if (U.dist2(x, y, o.x, o.y) < (o.r + radius) * (o.r + radius)) return o;
      } else if (o.type === 'hut') {
        var nx = U.clamp(x, o.x - o.w / 2, o.x + o.w / 2);
        var ny = U.clamp(y, o.y - o.h / 2, o.y + o.h / 2);
        if (U.dist2(x, y, nx, ny) < radius * radius) return o;
      }
    }
    return null;
  }

  /** Slide a circle out of whatever it overlaps (cheap but stable). */
  function resolve(x, y, radius) {
    var o, i, pass;
    for (pass = 0; pass < 2; pass++) {
      for (i = 0; i < island.obstacles.length; i++) {
        o = island.obstacles[i];
        if (o.type === 'rock') {
          var d = U.dist(x, y, o.x, o.y), min = o.r + radius;
          if (d < min && d > 0.0001) {
            x = o.x + (x - o.x) / d * min;
            y = o.y + (y - o.y) / d * min;
          }
        } else if (o.type === 'hut') {
          var nx = U.clamp(x, o.x - o.w / 2, o.x + o.w / 2);
          var ny = U.clamp(y, o.y - o.h / 2, o.y + o.h / 2);
          var dd = U.dist(x, y, nx, ny);
          if (dd < radius) {
            if (dd < 0.0001) { y = o.y - o.h / 2 - radius; continue; }
            x = nx + (x - nx) / dd * radius;
            y = ny + (y - ny) / dd * radius;
          }
        }
      }
    }
    return { x: x, y: y };
  }

  /* ---------- generation ---------- */

  function generate(seed) {
    var rng = U.mulberry32(seed);
    island.floodRatio = 0;
    island.harmonics = [
      { freq: 3, amp: 0.13, phase: rng() * 6.28 },
      { freq: 5, amp: 0.085, phase: rng() * 6.28 },
      { freq: 7, amp: 0.05, phase: rng() * 6.28 },
      { freq: 11, amp: 0.028, phase: rng() * 6.28 }
    ];
    island.obstacles = [];

    var i, p;
    // village huts, clustered in 4 settlements
    var clusters = [];
    for (i = 0; i < 4; i++) {
      var a = rng() * Math.PI * 2;
      var rad = coastRadius(a) * (0.25 + rng() * 0.5);
      clusters.push({ x: island.cx + Math.cos(a) * rad, y: island.cy + Math.sin(a) * rad });
    }
    for (i = 0; i < IC.hutCount; i++) {
      var c = clusters[i % clusters.length];
      var w = 70 + rng() * 60, h = 60 + rng() * 55;
      var hx = c.x + (rng() - 0.5) * 420;
      var hy = c.y + (rng() - 0.5) * 420;
      var ha = Math.atan2(hy - island.cy, hx - island.cx);
      if (U.dist(hx, hy, island.cx, island.cy) > coastRadius(ha) * 0.86) continue;
      island.obstacles.push({ type: 'hut', x: hx, y: hy, w: w, h: h, roof: rng() });
    }
    // rocks
    for (i = 0; i < IC.rockCount; i++) {
      p = randomLandPoint(rng, 40);
      island.obstacles.push({ type: 'rock', x: p.x, y: p.y, r: 22 + rng() * 34 });
    }
    // trees are decoration only (they do not block)
    island.trees = [];
    for (i = 0; i < IC.treeCount; i++) {
      var ta = rng() * Math.PI * 2;
      var tr = coastRadius(ta) * (0.1 + rng() * 0.88);
      island.trees.push({
        x: island.cx + Math.cos(ta) * tr,
        y: island.cy + Math.sin(ta) * tr,
        r: 16 + rng() * 14,
        shade: rng()
      });
    }

    bakeTerrain(rng);
    return island;
  }

  /** Draw the static ground once into an offscreen canvas. */
  function bakeTerrain(rng) {
    var s = island.terrainScale;
    var n = Math.round(island.size * s);
    var cv = document.createElement('canvas');
    cv.width = n; cv.height = n;
    var g = cv.getContext('2d');

    // open sea
    var sea = g.createLinearGradient(0, 0, 0, n);
    sea.addColorStop(0, '#0b3b63');
    sea.addColorStop(1, '#07293f');
    g.fillStyle = sea;
    g.fillRect(0, 0, n, n);

    var cx = island.cx * s, cy = island.cy * s;
    var steps = 420;

    function blob(scale, fill) {
      g.beginPath();
      for (var i = 0; i <= steps; i++) {
        var a = (i / steps) * Math.PI * 2;
        var r = coastRadius(a) * s * scale;
        var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    }

    blob(1.13, 'rgba(56,160,200,0.45)');   // shallow shelf
    blob(1.05, 'rgba(99,205,224,0.55)');   // surf
    blob(1.0, '#e4d3a2');                  // sand
    blob(0.93, '#9fbf6a');                 // grass
    blob(0.74, '#7faa55');                 // inner grass

    // grass texture dabs
    var i2, a2, r2;
    for (i2 = 0; i2 < 2600; i2++) {
      a2 = rng() * Math.PI * 2;
      r2 = coastRadius(a2) * s * 0.95 * Math.sqrt(rng());
      g.fillStyle = 'rgba(0,0,0,' + (0.015 + rng() * 0.05) + ')';
      g.beginPath();
      g.arc(cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2, 4 + rng() * 16, 0, 6.3);
      g.fill();
    }
    // dirt paths between the settlements
    g.strokeStyle = 'rgba(190,165,110,0.55)';
    g.lineWidth = 16 * s * 2;
    g.lineCap = 'round';
    for (i2 = 0; i2 < 5; i2++) {
      g.beginPath();
      var pa = rng() * Math.PI * 2;
      var px = cx + Math.cos(pa) * coastRadius(pa) * s * 0.8;
      var py = cy + Math.sin(pa) * coastRadius(pa) * s * 0.8;
      g.moveTo(px, py);
      g.quadraticCurveTo(cx + (rng() - 0.5) * 300, cy + (rng() - 0.5) * 300, cx, cy);
      g.stroke();
    }

    island.terrain = cv;
  }

  function setFlood(ratio) {
    island.floodRatio = OJ.util.clamp(ratio, 0, 1);
  }

  return {
    data: island,
    generate: generate,
    coastRadius: coastRadius,
    landRadius: landRadius,
    isLand: isLand,
    waterDepth: waterDepth,
    nearestLand: nearestLand,
    randomLandPoint: randomLandPoint,
    blocked: blocked,
    resolve: resolve,
    setFlood: setFlood
  };
})();
