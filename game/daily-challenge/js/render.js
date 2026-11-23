/* Canvas rendering: world view, storm, HUD markers and the minimap. */
window.OJ = window.OJ || {};

OJ.Render = (function () {
  var C = OJ.CONFIG;
  var U = OJ.util;
  var Island = OJ.Island;

  var cam = { x: 0, y: 0, zoom: 1 };
  var rain = [];
  var splashes = [];

  function initRain() {
    rain = [];
    for (var i = 0; i < C.storm.rainDrops; i++) {
      rain.push({ x: Math.random(), y: Math.random(), len: 10 + Math.random() * 22, sp: 0.7 + Math.random() * 0.9 });
    }
  }

  function follow(target, dt) {
    cam.x += (target.x - cam.x) * Math.min(1, dt * 7);
    cam.y += (target.y - cam.y) * Math.min(1, dt * 7);
  }

  function setCam(x, y, zoom) { cam.x = x; cam.y = y; if (zoom) cam.zoom = zoom; }

  function w2s(ctx, x, y) {
    return {
      x: (x - cam.x) * cam.zoom + ctx.canvas.width / 2,
      y: (y - cam.y) * cam.zoom + ctx.canvas.height / 2
    };
  }

  /* ---------- world ---------- */

  function drawWorld(ctx, match, clock) {
    var cw = ctx.canvas.width, ch = ctx.canvas.height;
    var z = cam.zoom;

    ctx.save();
    ctx.fillStyle = '#062033';
    ctx.fillRect(0, 0, cw, ch);

    ctx.translate(cw / 2, ch / 2);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);

    // baked terrain
    var t = Island.data.terrain;
    if (t) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(t, 0, 0, Island.data.size, Island.data.size);
    }

    drawFlood(ctx, match);
    drawTrees(ctx);
    drawObstacles(ctx);
    if (match) {
      drawHorse(ctx, match);
      drawPlayers(ctx, match);
      drawBullets(ctx, match);
    }

    ctx.restore();

    if (match && match.stormActive) drawStormOverlay(ctx, match);
  }

  function drawFlood(ctx, match) {
    if (!match || match.stormProgress <= 0) return;
    var d = Island.data;
    var steps = 160;
    // water that has climbed over the land
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i <= steps; i++) {
      var a = (i / steps) * Math.PI * 2;
      var r = Island.coastRadius(a) * 1.25;
      var x = d.cx + Math.cos(a) * r, y = d.cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (var j = steps; j >= 0; j--) {
      var a2 = (j / steps) * Math.PI * 2;
      var r2 = Island.landRadius(a2);
      var x2 = d.cx + Math.cos(a2) * r2, y2 = d.cy + Math.sin(a2) * r2;
      if (j === steps) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
    }
    ctx.fillStyle = 'rgba(26,104,150,0.72)';
    ctx.fill('evenodd');

    // shoreline foam
    ctx.beginPath();
    for (var k = 0; k <= steps; k++) {
      var a3 = (k / steps) * Math.PI * 2;
      var r3 = Island.landRadius(a3) + Math.sin(a3 * 9 + match.time * 2) * 6;
      var x3 = d.cx + Math.cos(a3) * r3, y3 = d.cy + Math.sin(a3) * r3;
      if (k === 0) ctx.moveTo(x3, y3); else ctx.lineTo(x3, y3);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(214,246,255,0.75)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  }

  function drawTrees(ctx) {
    var trees = Island.data.trees || [];
    for (var i = 0; i < trees.length; i++) {
      var t = trees[i];
      if (!inView(t.x, t.y, ctx, 80)) continue;
      if (Island.waterDepth(t.x, t.y) > 0.25) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(t.x + 6, t.y + 8, t.r, t.r * 0.6, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = t.shade > 0.5 ? '#2f6b34' : '#3a7f3e';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.5, 0, 6.3); ctx.fill();
    }
  }

  function drawObstacles(ctx) {
    var obs = Island.data.obstacles;
    for (var i = 0; i < obs.length; i++) {
      var o = obs[i];
      if (!inView(o.x, o.y, ctx, 140)) continue;
      if (o.type === 'rock') {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(o.x + 5, o.y + 7, o.r, o.r * 0.65, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#7d8691';
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#99a4b0';
        ctx.beginPath(); ctx.arc(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.55, 0, 6.3); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(o.x - o.w / 2 + 7, o.y - o.h / 2 + 9, o.w, o.h);
        ctx.fillStyle = '#b3783f';
        ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
        ctx.fillStyle = o.roof > 0.5 ? '#8a5a2b' : '#6f4a26';
        ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h * 0.45);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      }
    }
  }

  function inView(x, y, ctx, pad) {
    var z = cam.zoom;
    var hw = ctx.canvas.width / 2 / z + (pad || 0);
    var hh = ctx.canvas.height / 2 / z + (pad || 0);
    return Math.abs(x - cam.x) < hw && Math.abs(y - cam.y) < hh;
  }

  function drawPlayers(ctx, match) {
    for (var i = 0; i < match.players.length; i++) {
      var p = match.players[i];
      if (!inView(p.x, p.y, ctx, 120)) continue;
      drawPlayer(ctx, p, match);
    }
  }

  function drawPlayer(ctx, p, match) {
    var r = C.combat.playerRadius;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 6, r, r * 0.6, 0, 0, 6.3); ctx.fill();

    if (p.swimming) {
      ctx.strokeStyle = 'rgba(220,245,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 7 + Math.sin(match.time * 6 + p.id) * 2, 0, 6.3); ctx.stroke();
    }

    // body
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.3); ctx.fill();
    ctx.strokeStyle = p.isHuman ? '#ffffff' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = p.isHuman ? 3 : 2;
    ctx.stroke();

    // gun
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#2b3440';
    ctx.fillRect(r - 2, -4, 26, 8);
    ctx.fillStyle = '#1b2129';
    ctx.fillRect(r + 14, -3, 12, 6);
    if (p.muzzleUntil && match.time < p.muzzleUntil) {
      ctx.fillStyle = 'rgba(255,214,102,0.95)';
      ctx.beginPath(); ctx.arc(r + 30, 0, 10, 0, 6.3); ctx.fill();
    }
    ctx.restore();

    // hit flash
    if (match.time - p.lastHitAt < 0.18) {
      ctx.strokeStyle = 'rgba(255,107,107,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, 6.3); ctx.stroke();
    }

    // name + coin balance (spec section 3)
    var label = p.name;
    ctx.font = 'bold 13px system-ui, sans-serif';
    var tw = Math.max(ctx.measureText(label).width, 54) + 16;
    var ty = p.y - r - 36;
    ctx.fillStyle = p.isHuman ? 'rgba(20,120,60,0.9)' : 'rgba(10,20,32,0.78)';
    roundRect(ctx, p.x - tw / 2, ty, tw, 17, 5);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, p.x, ty + 13);

    ctx.font = 'bold 12px system-ui, sans-serif';
    var ct = 'Coins: ' + p.coins;
    var cwid = ctx.measureText(ct).width + 16;
    ctx.fillStyle = 'rgba(255,209,102,0.95)';
    roundRect(ctx, p.x - cwid / 2, ty + 18, cwid, 16, 5);
    ctx.fill();
    ctx.fillStyle = '#20150a';
    ctx.fillText(ct, p.x, ty + 30);
    ctx.textAlign = 'left';

    drawPopups(ctx, p);
  }

  function drawPopups(ctx, e) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px system-ui, sans-serif';
    for (var i = 0; i < e.popups.length; i++) {
      var p = e.popups[i];
      ctx.globalAlpha = U.clamp(p.life, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(p.text, e.x + 1, e.y - 46 + p.dy + 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, e.x, e.y - 46 + p.dy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawHorse(ctx, match) {
    var h = match.horse;
    if (!h || !h.alive) return;
    var r = C.horse.radius;
    var bob = Math.sin(h.bob) * 3;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(h.x + 5, h.y + 14, r * 1.15, r * 0.55, 0, 0, 6.3); ctx.fill();

    ctx.translate(h.x, h.y + bob);
    var face = Math.cos(h.angle) < 0 ? -1 : 1;
    ctx.scale(face, 1);

    var grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, '#ffe9a8');
    grad.addColorStop(0.5, '#e8b94d');
    grad.addColorStop(1, '#b8862a');
    ctx.fillStyle = grad;
    // body
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.72, 0, 0, 6.3); ctx.fill();
    // neck + head
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -r * 0.3);
    ctx.lineTo(r * 1.05, -r * 1.25);
    ctx.lineTo(r * 1.55, -r * 1.05);
    ctx.lineTo(r * 0.95, -r * 0.1);
    ctx.closePath(); ctx.fill();
    // legs
    ctx.fillRect(-r * 0.75, r * 0.5, 7, r * 0.85);
    ctx.fillRect(-r * 0.1, r * 0.55, 7, r * 0.8);
    ctx.fillRect(r * 0.55, r * 0.5, 7, r * 0.85);
    // tail
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, -r * 0.2);
    ctx.quadraticCurveTo(-r * 1.8, r * 0.1, -r * 1.5, r * 0.8);
    ctx.lineWidth = 6; ctx.strokeStyle = '#d8a63c'; ctx.stroke();
    ctx.restore();

    // glow ring
    ctx.strokeStyle = 'rgba(255,214,102,' + (0.35 + 0.25 * Math.sin(match.time * 4)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(h.x, h.y, r * 1.6, 0, 6.3); ctx.stroke();

    // visible coin balance (spec section 5)
    ctx.font = 'bold 14px system-ui, sans-serif';
    var txt = 'Treasure Horse  ' + h.coins;
    var tw = ctx.measureText(txt).width + 22;
    ctx.fillStyle = 'rgba(126,74,196,0.92)';
    roundRect(ctx, h.x - tw / 2, h.y - r * 2.1, tw, 22, 7);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(txt, h.x, h.y - r * 2.1 + 16);
    ctx.textAlign = 'left';

    // health-style coin bar
    var bw = tw;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, h.x - bw / 2, h.y - r * 2.1 + 24, bw, 6, 3); ctx.fill();
    ctx.fillStyle = '#ffd166';
    roundRect(ctx, h.x - bw / 2, h.y - r * 2.1 + 24, bw * (h.coins / h.maxCoins), 6, 3); ctx.fill();

    drawPopups(ctx, h);
  }

  function drawBullets(ctx, match) {
    ctx.strokeStyle = 'rgba(255,236,170,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (var i = 0; i < match.bullets.length; i++) {
      var b = match.bullets[i];
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  function drawStormOverlay(ctx, match) {
    var cw = ctx.canvas.width, ch = ctx.canvas.height;
    var p = match.stormProgress;

    ctx.save();
    ctx.fillStyle = 'rgba(12,24,46,' + (0.18 + p * 0.3) + ')';
    ctx.fillRect(0, 0, cw, ch);

    // rain
    if (!rain.length) initRain();
    ctx.strokeStyle = 'rgba(190,220,255,0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    var t = match.time;
    for (var i = 0; i < rain.length; i++) {
      var d = rain[i];
      var y = ((d.y + t * d.sp * 0.9) % 1) * ch;
      var x = ((d.x + t * 0.04) % 1) * cw;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + d.len);
    }
    ctx.stroke();

    // lightning
    if (Math.random() < 0.004 + p * 0.006) splashes.push({ life: 0.22 });
    for (var k = splashes.length - 1; k >= 0; k--) {
      splashes[k].life -= 0.016;
      if (splashes[k].life <= 0) { splashes.splice(k, 1); continue; }
      ctx.fillStyle = 'rgba(220,240,255,' + splashes[k].life * 0.5 + ')';
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.restore();
  }

  /* ---------- minimap (spec section 4) ---------- */

  function drawMinimap(ctx, match, clock) {
    var cw = ctx.canvas.width, ch = ctx.canvas.height;
    var d = Island.data;
    var scale = Math.min(cw, ch) / (d.size * 0.92);
    var ox = cw / 2 - d.cx * scale;
    var oy = ch / 2 - d.cy * scale;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0a2a44';
    ctx.fillRect(0, 0, cw, ch);

    // island silhouette
    ctx.beginPath();
    for (var i = 0; i <= 120; i++) {
      var a = (i / 120) * Math.PI * 2;
      var r = Island.coastRadius(a);
      var x = ox + (d.cx + Math.cos(a) * r) * scale;
      var y = oy + (d.cy + Math.sin(a) * r) * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#8fae5f';
    ctx.fill();

    // flooded ring
    if (match && match.stormProgress > 0) {
      ctx.beginPath();
      for (var j = 0; j <= 120; j++) {
        var a2 = (j / 120) * Math.PI * 2;
        var r2 = Island.landRadius(a2);
        var x2 = ox + (d.cx + Math.cos(a2) * r2) * scale;
        var y2 = oy + (d.cy + Math.sin(a2) * r2) * scale;
        if (j === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.strokeStyle = '#6ee7ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(143,174,95,1)';
      ctx.fill();
    }

    if (!match) return;

    // 2-minute highlight: every player's last pinged position
    var hs = match.highlightStrength;
    if (hs > 0 && match.highlightPings.length) {
      for (var k = 0; k < match.highlightPings.length; k++) {
        var pg = match.highlightPings[k];
        if (pg.id === match.human.id) continue;
        var px = ox + pg.x * scale, py = oy + pg.y * scale;
        ctx.globalAlpha = hs;
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 6.3); ctx.fill();
        ctx.strokeStyle = 'rgba(255,107,107,' + hs * 0.8 + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 4.5 + (1 - hs) * 16, 0, 6.3); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // horse
    if (match.horse && match.horse.alive) {
      var hx = ox + match.horse.x * scale, hy = oy + match.horse.y * scale;
      ctx.fillStyle = '#c084fc';
      ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(192,132,252,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hy, 5.5 + (Math.sin(match.time * 5) + 1) * 4, 0, 6.3); ctx.stroke();
    }

    // you
    var me = match.human;
    var mx = ox + me.x * scale, my = oy + me.y * scale;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.arc(mx, my, 5, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#eaffef';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // facing
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(me.angle) * 13, my + Math.sin(me.angle) * 13);
    ctx.stroke();
  }

  /* ---------- ship arrival cinematic (spec section 2) ---------- */

  function drawShip(ctx, progress, playerCount) {
    var cw = ctx.canvas.width, ch = ctx.canvas.height;
    var d = Island.data;

    // framing: whole island in view, with sea room for the ship on the left
    var zoom = Math.min(cw, ch) / (d.size * 1.05);
    cam.zoom = zoom;
    cam.x = d.cx; cam.y = d.cy;

    drawWorld(ctx, null, null);

    function sx(x) { return (x - cam.x) * zoom + cw / 2; }
    function sy(y) { return (y - cam.y) * zoom + ch / 2; }

    // the ship sails in from the left and stops off the coast
    var coastW = Island.coastRadius(Math.PI);
    var startX = d.cx - coastW - 900;
    var endX = d.cx - coastW - 180;
    var shipX = U.lerp(startX, endX, U.clamp(progress / 0.4, 0, 1));
    var shipY = d.cy + Math.sin(progress * 6) * 14;

    var psx = sx(shipX), psy = sy(shipY);
    var sw = 560 * zoom, sh = 160 * zoom;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(psx, psy + sh * 0.5, sw * 0.55, sh * 0.35, 0, 0, 6.3); ctx.fill();
    // hull
    ctx.fillStyle = '#39465a';
    ctx.beginPath();
    ctx.moveTo(psx - sw / 2, psy - sh * 0.1);
    ctx.lineTo(psx + sw / 2, psy - sh * 0.25);
    ctx.lineTo(psx + sw * 0.42, psy + sh * 0.35);
    ctx.lineTo(psx - sw * 0.44, psy + sh * 0.3);
    ctx.closePath(); ctx.fill();
    // deck block
    ctx.fillStyle = '#54637a';
    ctx.fillRect(psx - sw * 0.1, psy - sh * 0.75, sw * 0.34, sh * 0.6);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold ' + Math.max(11, 26 * zoom) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OJASSS', psx, psy + sh * 0.18);
    ctx.textAlign = 'left';
    ctx.restore();

    // players dropping onto the island
    if (progress > 0.38) {
      var dropT = (progress - 0.38) / 0.62;
      for (var i = 0; i < playerCount; i++) {
        var seed = (i * 97) % 1000 / 1000;
        var tt = U.clamp((dropT - seed * 0.45) / 0.55, 0, 1);
        if (tt <= 0) continue;
        var ang = (i / playerCount) * Math.PI * 2;
        var land = Island.coastRadius(ang) * 0.6;
        var tx = d.cx + Math.cos(ang) * land;
        var ty = d.cy + Math.sin(ang) * land;
        var x = U.lerp(shipX, tx, tt);
        var y = U.lerp(shipY, ty, tt);
        var px = sx(x), py = sy(y);
        if (tt < 1) {
          // parachute
          ctx.fillStyle = 'rgba(240,250,255,0.9)';
          ctx.beginPath(); ctx.arc(px, py - 16, 12, Math.PI, 0); ctx.fill();
          ctx.strokeStyle = 'rgba(220,235,250,0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px - 10, py - 16); ctx.lineTo(px, py); ctx.lineTo(px + 10, py - 16); ctx.stroke();
        }
        ctx.fillStyle = OJ.Entities.PALETTE[i % OJ.Entities.PALETTE.length];
        ctx.beginPath(); ctx.arc(px, py, 6, 0, 6.3); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return {
    cam: cam,
    follow: follow,
    setCam: setCam,
    drawWorld: drawWorld,
    drawMinimap: drawMinimap,
    drawShip: drawShip,
    w2s: w2s
  };
})();
