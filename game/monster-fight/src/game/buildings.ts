import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// OJASSS — Hill of Doom: procedural, walk-in buildings. Every building is real geometry built from
// textured blocks (no flat pictures): solid walls, window and door openings, hinged doors, floors,
// stairs and rooftops you can walk on. Static parts are merged per material so each building costs
// only a handful of draw calls on phones.

export interface Door { pivot: THREE.Group; open: boolean; x: number; z: number; y?: number }
/** Wall collider. minY/maxY let players walk under upper floors and stand on top of low walls. */
export interface Box { minX: number; maxX: number; minZ: number; maxZ: number; minY?: number; maxY?: number; door?: Door; /** a ledge you can step up onto from stairs */ step?: boolean }
/** Walkable surface: a floor at height y, or a ramp (stairs) rising along a direction. */
export interface Deck { minX: number; maxX: number; minZ: number; maxZ: number; y: number; ramp?: { x0: number; z0: number; dx: number; dz: number; len: number; y0: number; y1: number } }
export interface Room { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }
export type Pickup = 'shotgun' | 'supplies' | 'medkit' | 'smg' | 'sniper' | 'deathbox' | 'tshirt';
export type Loot = Pickup | null;

export interface Hooks {
  scene: THREE.Scene;
  boxes: Box[]; decks: Deck[]; rooms: Room[]; doors: Door[]; solids: THREE.Object3D[];
  tex(name: string): THREE.Texture;
  heightAt(x: number, z: number): number;
  crate(x: number, y: number, z: number, loot: Pickup): void;
}

/** Height of the walkable surface under (x, z) for something whose feet are at y. */
export function surfaceAt(decks: Deck[], ground: number, x: number, z: number, y: number): number {
  let best = ground;
  for (const d of decks) {
    if (x < d.minX || x > d.maxX || z < d.minZ || z > d.maxZ) continue;
    let top = d.y;
    if (d.ramp) {
      const r = d.ramp, t = Math.max(0, Math.min(1, ((x - r.x0) * r.dx + (z - r.z0) * r.dz) / r.len));
      top = r.y0 + (r.y1 - r.y0) * t;
    }
    if (top <= y + 0.75 && top > best) best = top;
  }
  return best;
}

// ------------------------------------------------------------------ materials

const TILE = 2.4; // metres per texture repeat

function boxGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / TILE, (uv.getY(i) * dims[f][1]) / TILE);
  }
  return g;
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

type Mats = ReturnType<typeof makeMats>;
let M: Mats | null = null;

function makeMats(H: Hooks) {
  // Photographed Poly Haven surfaces (CC0) with normal maps for real relief.
  const wall = H.tex('pbr/plastered_stone_wall_Diffuse'), rock = H.tex('pbr/stone_wall_Diffuse'), wood = H.tex('pbr/weathered_planks_Diffuse'), roof = H.tex('pbr/clay_roof_tiles_02_Diffuse');
  const nWall = H.tex('pbr/plastered_stone_wall_nor_gl'), nRock = H.tex('pbr/stone_wall_nor_gl'), nWood = H.tex('pbr/weathered_planks_nor_gl'), nRoof = H.tex('pbr/clay_roof_tiles_02_nor_gl');
  const normals = new Map<THREE.Texture, THREE.Texture>([[wall, nWall], [rock, nRock], [wood, nWood], [roof, nRoof]]);
  const std = (map: THREE.Texture | null, color = 0xffffff, extra: THREE.MeshStandardMaterialParameters = {}) => withNormal(map, normals,
    new THREE.MeshStandardMaterial({ map, color, roughness: 0.92, ...extra }));
  // Corrugated sheet: vertical ridges with rust streaks.
  const corr = canvasTex(256, 256, (c) => {
    for (let x = 0; x < 256; x++) { const v = 120 + Math.sin((x / 256) * Math.PI * 24) * 45; c.fillStyle = `rgb(${v},${v - 4},${v - 10})`; c.fillRect(x, 0, 1, 256); }
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${110 + Math.random() * 50},${50 + Math.random() * 20},20,${0.15 + Math.random() * 0.3})`; c.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 10, 20 + Math.random() * 120); }
  });
  const net = canvasTex(256, 256, (c) => {
    c.strokeStyle = 'rgba(70,80,70,0.95)'; c.lineWidth = 2;
    for (let i = 0; i <= 256; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 8, 256); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(256, i + 6); c.stroke(); }
  });
  return {
    // Colours above 1.0 brighten the weathered texture into sunlit, painted walls.
    plaster: std(wall, new THREE.Color(1.45, 1.38, 1.22).getHex()),
    plasterBlue: bright(std(wall), 0.95, 1.35, 1.6),
    plasterYellow: bright(std(wall), 1.75, 1.5, 0.85),
    plasterPink: bright(std(wall), 1.7, 1.15, 1.05),
    plasterWhite: bright(std(wall), 1.75, 1.72, 1.66),
    concrete: bright(std(wall), 1.45, 1.42, 1.36),
    stone: bright(std(rock), 1.45, 1.38, 1.28),
    darkStone: std(rock, 0x8e8880),
    wood: bright(std(wood), 1.3, 1.2, 1.1),
    woodLight: bright(std(wood), 1.9, 1.6, 1.25),
    tiles: bright(std(roof), 1.35, 1.15, 1.05),
    oldTiles: std(roof, 0xc0aca0),
    metal: std(corr, 0xffffff, { metalness: 0.45, roughness: 0.65 }),
    rust: std(rock, 0x9a5532, { metalness: 0.35, roughness: 0.8 }),
    steel: std(null, 0x5b5f63, { metalness: 0.7, roughness: 0.45 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8fa6a8, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false }),
    black: std(null, 0x1d1f1f),
    board: std(null, 0x23332a, { roughness: 0.7 }),
    net: new THREE.MeshStandardMaterial({ map: net, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 }),
    sand: std(null, 0x8c7a5a),
  };
}

function bright(m: THREE.MeshStandardMaterial, r: number, g: number, b: number): THREE.MeshStandardMaterial {
  // the photo textures are already light, so paint tints are applied gently
  m.color.setRGB(0.22 + r * 0.62, 0.22 + g * 0.62, 0.22 + b * 0.62, THREE.SRGBColorSpace);
  return m;
}

function withNormal(map: THREE.Texture | null, normals: Map<THREE.Texture, THREE.Texture>, m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const n = map && normals.get(map);
  if (n) { m.normalMap = n; m.normalScale.set(0.9, 0.9); }
  return m;
}

function signMat(text: string, bg: string, fg: string): THREE.MeshStandardMaterial {
  const t = canvasTex(512, 128, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; c.fillRect(Math.random() * 512, Math.random() * 128, 3, 3); }
    c.fillStyle = fg; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 66);
    c.fillStyle = 'rgba(60,40,20,0.35)'; c.fillRect(0, 100, 512, 28);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
}

// ------------------------------------------------------------------ builder

type Axis = 'x' | 'z';
interface Hole { a0: number; a1: number; y0: number; y1: number; glass?: boolean }
type Dir = '+x' | '-x' | '+z' | '-z';

/** Builds one structure in local space (front = +z), rotated in quarter turns and sat on the terrain. */
class B {
  g = new THREE.Group();
  statics: THREE.Mesh[] = [];
  private c: number; private s: number;
  constructor(public H: Hooks, public cx: number, public cz: number, public base: number, public rot: number) {
    this.g.position.set(cx, base, cz);
    this.g.rotation.y = (rot * Math.PI) / 2;
    this.c = Math.round(Math.cos((rot * Math.PI) / 2)); this.s = Math.round(Math.sin((rot * Math.PI) / 2));
  }
  w(lx: number, lz: number): [number, number] { return [this.cx + lx * this.c + lz * this.s, this.cz - lx * this.s + lz * this.c]; }
  wv(dx: number, dz: number): [number, number] { return [dx * this.c + dz * this.s, -dx * this.s + dz * this.c]; }
  rect(x0: number, x1: number, z0: number, z1: number) {
    const a = this.w(x0, z0), b = this.w(x1, z1);
    return { minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[1], b[1]), maxZ: Math.max(a[1], b[1]) };
  }

  /** A textured block; collides by default. Blocks starting at the floor block from below too. */
  block(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, collide = true): THREE.Mesh {
    const m = new THREE.Mesh(boxGeo(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.statics.push(m);
    if (collide) this.H.boxes.push({ ...this.rect(x0, x1, z0, z1), minY: y0 <= 0.5 ? -Infinity : this.base + y0, maxY: this.base + y1 });
    return m;
  }
  /** Rotated decorative mesh (roof panels etc.), no collision. */
  piece(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    this.statics.push(m);
    return m;
  }

  /** A wall along `axis` centred on the other coordinate `c`, with door / window openings. */
  wall(axis: Axis, c: number, a0: number, a1: number, y0: number, y1: number, mat: THREE.Material, holes: Hole[] = [], t = 0.3) {
    const put = (p0: number, p1: number, q0: number, q1: number) => {
      if (p1 - p0 < 0.02 || q1 - q0 < 0.02) return;
      if (axis === 'x') this.block(p0, p1, q0, q1, c - t / 2, c + t / 2, mat);
      else this.block(c - t / 2, c + t / 2, q0, q1, p0, p1, mat);
    };
    let cur = a0;
    for (const h of [...holes].sort((p, q) => p.a0 - q.a0)) {
      put(cur, h.a0, y0, y1);
      put(h.a0, h.a1, y0, Math.min(h.y0, y1));
      put(h.a0, h.a1, Math.max(h.y1, y0), y1);
      if (h.y0 > y0 + 0.4) { // window: sill and frame
        if (axis === 'x') this.block(h.a0 - 0.08, h.a1 + 0.08, h.y0 - 0.08, h.y0, c - t / 2 - 0.08, c + t / 2 + 0.08, M!.wood, false);
        else this.block(c - t / 2 - 0.08, c + t / 2 + 0.08, h.y0 - 0.08, h.y0, h.a0 - 0.08, h.a1 + 0.08, M!.wood, false);
      }
      if (h.glass) {
        if (axis === 'x') this.block(h.a0, h.a1, h.y0, h.y1, c - 0.02, c + 0.02, M!.glass, false);
        else this.block(c - 0.02, c + 0.02, h.y0, h.y1, h.a0, h.a1, M!.glass, false);
      }
      cur = h.a1;
    }
    put(cur, a1, y0, y1);
  }

  /** Hinged door in an opening of the wall at `c`, centred at `at`. */
  door(axis: Axis, c: number, at: number, width: number, y0: number, h = 2.2, mat: THREE.Material = M!.wood) {
    const outer = new THREE.Group(), pivot = new THREE.Group();
    const leaf = new THREE.Mesh(boxGeo(width, h, 0.08), mat);
    leaf.position.set(width / 2, h / 2, 0); leaf.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M!.steel); knob.position.set(width - 0.12, 1.0, 0.07);
    pivot.add(leaf, knob); outer.add(pivot);
    if (axis === 'x') outer.position.set(at - width / 2, y0, c);
    else { outer.position.set(c, y0, at + width / 2); outer.rotation.y = Math.PI / 2; }
    this.g.add(outer); this.H.solids.push(leaf);
    const [wx, wz] = axis === 'x' ? this.w(at, c) : this.w(c, at);
    const door: Door = { pivot, open: false, x: wx, z: wz, y: this.base + y0 };
    this.H.doors.push(door);
    const r = axis === 'x' ? this.rect(at - width / 2, at + width / 2, c - 0.15, c + 0.15) : this.rect(c - 0.15, c + 0.15, at - width / 2, at + width / 2);
    this.H.boxes.push({ ...r, minY: y0 <= 0.5 ? -Infinity : this.base + y0, maxY: this.base + y0 + h, door });
  }

  /** Walkable floor slab whose top is at y. */
  slab(x0: number, x1: number, z0: number, z1: number, y: number, mat: THREE.Material, th = 0.25) {
    this.block(x0, x1, y - th, y, z0, z1, mat, false);
    this.H.decks.push({ ...this.rect(x0, x1, z0, z1), y: this.base + y });
  }

  /** Solid foundation the building stands on, so it never floats on a slope. */
  plinth(hw: number, hd: number, mat: THREE.Material, top = 0.3) {
    this.block(-hw, hw, -10, top, -hd, hd, mat, false); // deep foundation: never floats on steep ground
    this.H.boxes.push({ ...this.rect(-hw, hw, -hd, hd), minY: -Infinity, maxY: this.base + top, step: true });
    this.H.decks.push({ ...this.rect(-hw, hw, -hd, hd), y: this.base + top });
  }

  /** Stairs from y0 to y1 inside the rectangle, rising toward `dir`. */
  stairs(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, dir: Dir, mat: THREE.Material) {
    const along = dir[1] === 'x' ? x1 - x0 : z1 - z0;
    const n = Math.max(2, Math.round((y1 - y0) / 0.22));
    for (let i = 0; i < n; i++) {
      const f0 = i / n, f1 = (i + 1) / n, top = y0 + (y1 - y0) * f1;
      const a = dir[0] === '+' ? f0 : 1 - f1, b = dir[0] === '+' ? f1 : 1 - f0;
      if (dir[1] === 'x') this.block(x0 + a * along, x0 + b * along, Math.min(y0, top - 0.25), top, z0, z1, mat, false);
      else this.block(x0, x1, Math.min(y0, top - 0.25), top, z0 + a * along, z0 + b * along, mat, false);
    }
    const ldx = dir === '+x' ? 1 : dir === '-x' ? -1 : 0, ldz = dir === '+z' ? 1 : dir === '-z' ? -1 : 0;
    const sx = dir === '+x' ? x0 : dir === '-x' ? x1 : (x0 + x1) / 2, sz = dir === '+z' ? z0 : dir === '-z' ? z1 : (z0 + z1) / 2;
    const [wx0, wz0] = this.w(sx, sz), [dx, dz] = this.wv(ldx, ldz);
    this.H.decks.push({ ...this.rect(x0, x1, z0, z1), y: this.base + y1, ramp: { x0: wx0, z0: wz0, dx, dz, len: along, y0: this.base + y0, y1: this.base + y1 } });
    this.stairRails(x0, x1, z0, z1, y0, y1, dir);
  }

  /** Steel hand rails along both sides of a flight. Their colliders run the full height, so the
   *  stairs can only be entered from the bottom or the top, never stepped onto or off the sides. */
  stairRails(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, dir: Dir) {
    const alongX = dir[1] === 'x', len = alongX ? x1 - x0 : z1 - z0, rise = y1 - y0;
    if (rise < 0.25) return;
    const ang = Math.atan2(rise, len), L = Math.hypot(len, rise), up = dir[0] === '+';
    const sides = alongX ? [z0, z1] : [x0, x1];
    for (const c of sides) {
      // collider: thin wall the whole length of the flight, taller than its top step
      const r = alongX ? this.rect(x0, x1, c - 0.06, c + 0.06) : this.rect(c - 0.06, c + 0.06, z0, z1);
      this.H.boxes.push({ ...r, minY: -Infinity, maxY: this.base + y1 + 1.2 });
      // sloped rail at hand height and posts every ~1.1 m
      const midA = alongX ? (x0 + x1) / 2 : (z0 + z1) / 2, yMid = (y0 + y1) / 2 + 0.95;
      if (alongX) this.piece(boxGeo(L, 0.05, 0.05), M!.steel, midA, yMid, c, 0, 0, up ? ang : -ang);
      else this.piece(boxGeo(0.05, 0.05, L), M!.steel, c, yMid, midA, up ? -ang : ang, 0, 0);
      const n = Math.max(1, Math.round(len / 1.1));
      for (let i = 0; i <= n; i++) {
        const f = i / n, a = (alongX ? x0 : z0) + len * f, y = up ? y0 + rise * f : y1 - rise * f;
        if (alongX) this.block(a - 0.025, a + 0.025, y - 0.05, y + 0.95, c - 0.025, c + 0.025, M!.steel, false);
        else this.block(c - 0.025, c + 0.025, y - 0.05, y + 0.95, a - 0.025, a + 0.025, M!.steel, false);
      }
    }
  }

  /** Steps from the terrain up to the floor. They overlap the floor edge and reach down to the
   *  actual ground at their foot, so there is never a gap or a ledge too high to climb. */
  entry(x: number, zFront: number, width: number, floor = 0.3, side: 'front' | 'left' = 'front') {
    const at = (along: number) => { const [wx, wz] = side === 'front' ? this.w(x, zFront + along) : this.w(zFront - along, x); return this.H.heightAt(wx, wz); };
    // Walk outward until a 0.6-rise-per-metre flight meets the ground.
    const slope = 0.6, top = this.base + floor;
    let len = 0.6;
    while (len < 10 && top - len * slope > at(len) + 0.25) len += 0.25;
    const drop = len * slope;
    if (drop < 0.3) return;
    if (side === 'front') this.stairs(x - width / 2, x + width / 2, zFront - 0.3, zFront + len, floor - drop, floor, '-z', M!.concrete);
    else this.stairs(zFront - len, zFront + 0.3, x - width / 2, x + width / 2, floor - drop, floor, '+x', M!.concrete);
  }

  railing(axis: Axis, c: number, a0: number, a1: number, y: number, mat: THREE.Material = M!.steel) {
    if (a1 - a0 < 0.05) return;
    if (axis === 'x') { this.block(a0, a1, y + 0.95, y + 1.05, c - 0.04, c + 0.04, mat); this.block(a0, a1, y, y + 0.08, c - 0.04, c + 0.04, mat, false); }
    else { this.block(c - 0.04, c + 0.04, y + 0.95, y + 1.05, a0, a1, mat); this.block(c - 0.04, c + 0.04, y, y + 0.08, a0, a1, mat, false); }
    const n = Math.max(1, Math.round((a1 - a0) / 1.2));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      if (axis === 'x') this.block(a - 0.04, a + 0.04, y, y + 1.0, c - 0.04, c + 0.04, mat, false);
      else this.block(c - 0.04, c + 0.04, y, y + 1.0, a - 0.04, a + 0.04, mat, false);
    }
    // collide the whole height so nobody walks off the edge
    if (axis === 'x') this.H.boxes.push({ ...this.rect(a0, a1, c - 0.06, c + 0.06), minY: this.base + y - 0.1, maxY: this.base + y + 1.05 });
    else this.H.boxes.push({ ...this.rect(c - 0.06, c + 0.06, a0, a1), minY: this.base + y - 0.1, maxY: this.base + y + 1.05 });
  }

  /** Pitched roof with the ridge along x, overhanging the walls, plus triangular gable ends. */
  gable(hw: number, hd: number, y: number, h: number, mat: THREE.Material, endMat: THREE.Material | null, over = 0.45, halfOnly = false) {
    const run = hd + over, slope = Math.hypot(run, h + (over * h) / hd), ang = Math.atan2(h, hd);
    const geo = boxGeo(hw * 2 + over * 2, 0.14, slope);
    const yMid = y + h / 2 - (over * h) / hd / 2;
    this.piece(geo, mat, 0, yMid, run / 2, ang, 0, 0);
    if (!halfOnly) this.piece(geo, mat, 0, yMid, -run / 2, -ang, 0, 0);
    if (endMat) {
      const shape = new THREE.Shape([new THREE.Vector2(-hd, 0), new THREE.Vector2(hd, 0), new THREE.Vector2(0, h)]);
      const tri = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
      const uv = tri.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TILE, uv.getY(i) / TILE);
      this.piece(tri, endMat, hw - 0.3, y, 0, 0, Math.PI / 2, 0);
      this.piece(tri.clone(), endMat, -hw, y, 0, 0, Math.PI / 2, 0);
    }
  }

  /** Single-slope roof, high at the back (-z). */
  shed(hw: number, hd: number, y: number, h: number, mat: THREE.Material, over = 0.4) {
    const d = hd * 2 + over * 2, ang = Math.atan2(h, hd * 2);
    this.piece(boxGeo(hw * 2 + over * 2, 0.12, Math.hypot(d, h)), mat, 0, y + h / 2, 0, ang, 0, 0);
  }

  room(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
    this.H.rooms.push({ ...this.rect(x0, x1, z0, z1), minY: this.base + y0 - 0.5, maxY: this.base + y1 });
  }

  /** A pickup inside the building; buildings without fixed loot get a random one (mostly medkits). */
  crate(x: number, y: number, z: number, loot: Loot) {
    const pool: Pickup[] = ['medkit', 'medkit', 'medkit', 'supplies', 'smg', 'sniper', 'tshirt', 'tshirt'];
    const kind = loot ?? pool[Math.floor(Math.random() * pool.length)];
    const [wx, wz] = this.w(x, z);
    this.H.crate(wx, this.base + y + 0.3, wz, kind);
    if (kind !== 'tshirt') {
      const [tx, tz] = this.w(x - 0.9, z - 0.4);
      this.H.crate(tx, this.base + y + 0.3, tz, 'tshirt');
    }
    if (kind !== 'medkit' && kind !== 'tshirt') { // every home also has a medkit beside its loot
      const [mx, mz] = this.w(x + 0.9, z + 0.4);
      this.H.crate(mx, this.base + y + 0.3, mz, 'medkit');
    }
  }

  /** Merge static meshes per material (few draw calls) and add the building to the scene. */
  finish() {
    const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const m of this.statics) {
      m.updateMatrix();
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.clearGroups();
      const mat = m.material as THREE.Material;
      if (!by.has(mat)) by.set(mat, []);
      by.get(mat)!.push(g);
    }
    for (const [mat, list] of by) {
      const geo = mergeGeometries(list);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      const see = mat !== M!.glass && mat !== M!.net;
      mesh.castShadow = see; mesh.receiveShadow = true;
      this.g.add(mesh);
      if (see) { this.H.solids.push(mesh); mesh.userData.building = true; }
    }
    this.g.userData.building = true;
    this.H.scene.add(this.g);
  }
}

// ------------------------------------------------------------------ the ten buildings

const win = (a0: number, a1: number, y0 = 1.25, y1 = 2.35, glass = true): Hole => ({ a0, a1, y0, y1, glass });
const doorway = (at: number, w = 1.3, top = 2.5): Hole => ({ a0: at - w / 2, a1: at + w / 2, y0: 0.3, y1: top });

/** 1 — Single-storey rural house: beige plaster, red clay tiles, wooden door, small windows. */
function villageHouse(b: B, loot: Loot) {
  const hw = 4, hd = 3, H = 3.3;
  b.plinth(hw + 0.2, hd + 0.2, M!.concrete);
  b.wall('x', -hd + 0.15, -hw, hw, 0.3, H, M!.plaster, [win(-2.6, -1.6), win(1.4, 2.4)]);
  b.wall('x', hd - 0.15, -hw, hw, 0.3, H, M!.plaster, [doorway(-0.6), win(1.6, 2.7)]);
  b.wall('z', -hw + 0.15, -hd + 0.3, hd - 0.3, 0.3, H, M!.plaster, [win(-0.5, 0.5)]);
  b.wall('z', hw - 0.15, -hd + 0.3, hd - 0.3, 0.3, H, M!.plaster, [win(-0.5, 0.5)]);
  b.wall('z', 0.6, -hd + 0.3, 0.2, 0.3, H, M!.plaster, [doorway(-1.3, 1.1)], 0.15); // inner partition
  b.door('x', hd - 0.15, -0.6, 1.3, 0.3);
  b.gable(hw, hd, H, 1.7, M!.tiles, M!.plaster);
  b.block(-hw + 0.3, hw - 0.3, H, H + 0.12, -hd + 0.3, hd - 0.3, M!.woodLight, false); // ceiling
  b.block(-3.5, -2.0, 0.3, 0.95, -2.6, -1.2, M!.wood); // cot
  b.block(1.4, 2.6, 0.3, 1.05, -2.6, -2.0, M!.wood); // table
  b.entry(-0.6, hd + 0.2, 1.6);
  b.room(-hw, hw, -hd, hd, 0.3, H);
  b.crate(2.4, 0.3, 0.8, loot);
}

/** 2 — Two-storey concrete house: balcony, external stairs, rooftop water tank, metal railings. */
function concreteHouse(b: B, loot: Loot) {
  const hw = 4.5, hd = 3.5, H1 = 3.3, H2 = 6.3;
  b.plinth(hw + 1.5, hd + 1.6, M!.concrete);
  b.wall('x', -hd + 0.15, -hw, hw, 0.3, H1, M!.plasterPink, [win(-3, -1.8), win(1.8, 3)]);
  b.wall('x', hd - 0.15, -hw, hw, 0.3, H1, M!.plasterPink, [doorway(0), win(-3.2, -1.8), win(1.8, 3.2)]);
  b.wall('z', -hw + 0.15, -hd + 0.3, hd - 0.3, 0.3, H1, M!.plasterPink, [win(-1, 0.4)]);
  b.wall('z', hw - 0.15, -hd + 0.3, hd - 0.3, 0.3, H1, M!.plasterPink, [win(-0.6, 0.6)]);
  b.door('x', hd - 0.15, 0, 1.3, 0.3);
  b.room(-hw, hw, -hd, hd, 0.3, H1);
  b.crate(-2.8, 0.3, -2, loot);
  // first floor: slab with a front balcony
  b.slab(-hw, hw, -hd, hd + 1.4, H1 + 0.25, M!.concrete, 0.3);
  const F = H1 + 0.25;
  // upper room on the left part
  b.wall('x', -hd + 0.15, -hw, 1, F, H2, M!.plasterPink, [win(-3, -1.8)]);
  b.wall('x', hd - 0.15, -hw, 1, F, H2, M!.plasterPink, [{ ...doorway(-1.2), y0: F, y1: F + 2.2 }, win(-3.6, -2.6, F + 0.95, F + 2.05)]);
  b.wall('z', -hw + 0.15, -hd + 0.3, hd - 0.3, F, H2, M!.plasterPink, [win(-0.6, 0.6, F + 0.95, F + 2.05)]);
  b.wall('z', 1 - 0.15, -hd + 0.3, hd - 0.3, F, H2, M!.plasterPink, [win(-0.6, 0.6, F + 0.95, F + 2.05)]);
  b.door('x', hd - 0.15, -1.2, 1.3, F, 2.1);
  b.room(-hw, 1, -hd, hd, F, H2);
  b.slab(-hw - 0.2, 1.2, -hd - 0.2, hd + 0.2, H2 + 0.25, M!.concrete, 0.3);
  b.block(-hw - 0.2, 1.2, H2 + 0.25, H2 + 0.75, -hd - 0.2, -hd, M!.plasterPink); // parapet
  // water tank on the roof
  b.piece(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 16), M!.black, -2.5, H2 + 0.9, -1.8);
  // railings around the open terrace and balcony
  b.railing('x', hd + 1.35, -hw, hw, F);
  b.railing('z', -hw + 0.05, hd, hd + 1.35, F);
  b.railing('z', hw - 0.05, -2, hd + 1.35, F);
  b.railing('x', -hd + 0.05, 1, hw, F);
  // external stairs on the right side up to a landing
  b.slab(hw, hw + 1.3, -hd, -1.6, F, M!.concrete, 0.3);
  b.stairs(hw + 0.05, hw + 1.3, -1.6, hd + 1.4, 0.3, F, '-z', M!.concrete);
  b.railing('z', hw + 1.32, -hd, -1.6, F - 0.1);
  b.entry(0, hd + 1.6, 2.4);
}

/** 3 — Abandoned stone house: cracked walls, half-collapsed roof, broken windows, no door. */
function abandonedHouse(b: B, loot: Loot) {
  const hw = 3.6, hd = 3, H = 3.1;
  b.plinth(hw + 0.2, hd + 0.2, M!.darkStone, 0.25);
  b.wall('x', -hd + 0.2, -hw, hw, 0.25, H, M!.stone, [win(-2.4, -1.4, 1.3, 2.3, false), win(1.2, 2.2, 1.3, 2.3, false)], 0.4);
  b.wall('x', hd - 0.2, -hw, hw, 0.25, H - 0.6, M!.stone, [{ ...doorway(-0.4, 1.3, 2.4), y0: 0.25 }, win(1.6, 2.6, 1.3, 2.2, false)], 0.4);
  b.wall('z', -hw + 0.2, -hd + 0.4, hd - 0.4, 0.25, H, M!.stone, [win(-0.4, 0.6, 1.3, 2.3, false)], 0.4);
  b.wall('z', hw - 0.2, -hd + 0.4, 0, 0.25, H - 0.2, M!.stone, [], 0.4);
  b.wall('z', hw - 0.2, 0, hd - 0.4, 0.25, 1.2, M!.stone, [], 0.4); // collapsed section
  b.gable(hw, hd, H, 1.4, M!.oldTiles, M!.stone, 0.3, true); // only the back slope survives
  // rubble and abandoned furniture
  b.block(hw - 0.2, hw + 1.1, 0, 0.6, 0.4, 2.0, M!.stone);
  b.block(hw + 0.4, hw + 1.4, 0, 0.35, -0.6, 0.6, M!.darkStone, false);
  b.block(-2.6, -1.0, 0.25, 1.0, -1.8, -0.9, M!.wood);
  b.piece(boxGeo(1.4, 0.08, 0.9), M!.wood, 0.8, 0.5, 0.4, 0.5, 0.3, 0.2); // fallen table top
  b.entry(-0.4, hd + 0.2, 1.4, 0.25);
  b.room(-hw, hw, -hd, hd, 0.25, H);
  b.crate(-2.2, 0.25, 1.2, loot);
}

/** 4 — Village shop: rolling shutter, faded sign, counter, shelves. */
function villageShop(b: B, loot: Loot) {
  const hw = 3.2, hd = 2.6, H = 3.2;
  b.plinth(hw + 0.2, hd + 0.2, M!.concrete);
  b.wall('x', -hd + 0.15, -hw, hw, 0.3, H, M!.plasterYellow);
  b.wall('x', hd - 0.15, -hw, hw, 0.3, H, M!.plasterYellow, [{ a0: -2.2, a1: 1.4, y0: 0.3, y1: 2.6 }]);
  b.wall('z', -hw + 0.15, -hd + 0.3, hd - 0.3, 0.3, H, M!.plasterYellow, [win(-0.6, 0.6)]);
  b.wall('z', hw - 0.15, -hd + 0.3, hd - 0.3, 0.3, H, M!.plasterYellow);
  b.block(-2.3, 1.5, 2.6, 2.95, hd - 0.2, hd + 0.05, M!.metal, false); // rolled shutter drum
  b.block(-2.2, 1.4, 2.05, 2.6, hd - 0.12, hd - 0.04, M!.metal, false); // shutter half down
  b.slab(-hw - 0.3, hw + 0.3, -hd - 0.3, hd + 0.3, H + 0.25, M!.concrete, 0.3);
  b.piece(boxGeo(hw * 2, 0.06, 1.6), M!.metal, 0, H - 0.2, hd + 0.9, 0.25, 0, 0); // awning
  b.piece(boxGeo(3.6, 0.9, 0.06), signMat('GENERAL STORE', '#7a2d1e', '#f1d8a4'), -0.3, H + 0.75, hd + 0.33);
  b.block(1.6, 2.9, 0.3, 1.25, -0.8, 1.6, M!.wood); // counter
  for (const z of [-2.1]) for (const y of [0.9, 1.6, 2.3]) b.block(-hw + 0.4, hw - 0.4, y, y + 0.06, z - 0.3, z + 0.3, M!.wood, false); // shelves
  b.block(-hw + 0.4, hw - 0.4, 0.3, 2.5, -2.45, -2.35, M!.wood);
  for (let i = 0; i < 9; i++) b.block(-2.6 + i * 0.6, -2.3 + i * 0.6, 1.66, 1.96, -2.3, -1.95, i % 2 ? M!.plasterBlue : M!.plasterPink, false); // goods
  b.entry(-0.4, hd + 0.3, 3);
  b.room(-hw, hw, -hd, hd, 0.3, H);
  b.crate(-1.8, 0.3, 0.2, loot);
}

/** 5 — Military watchtower: steel legs, guard platform with railings, stairs, small roof. */
function watchtower(b: B, loot: Loot) {
  const P = 6.2;
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) b.block(x - 0.12, x + 0.12, 0, P, z - 0.12, z + 0.12, M!.steel);
  for (const y of [2, 4]) { // cross bracing
    b.block(-1.7, 1.7, y, y + 0.1, -1.75, -1.65, M!.steel, false); b.block(-1.7, 1.7, y, y + 0.1, 1.65, 1.75, M!.steel, false);
    b.block(-1.75, -1.65, y, y + 0.1, -1.7, 1.7, M!.steel, false); b.block(1.65, 1.75, y, y + 0.1, -1.7, 1.7, M!.steel, false);
  }
  b.slab(-2, 2, -2, 2, P, M!.wood, 0.2);
  b.railing('x', -1.96, -2, 2, P); b.railing('z', -1.96, -2, 2, P); b.railing('z', 1.96, -2, 2, P);
  b.railing('x', 1.96, -2, -0.7, P); b.railing('x', 1.96, 0.7, 2, P);
  b.block(-2, 2, P, P + 0.9, -2, -1.9, M!.metal, false); // armour plates
  b.block(-2, -1.9, P, P + 0.9, -2, 2, M!.metal, false);
  b.block(1.9, 2, P, P + 0.9, -2, 2, M!.metal, false);
  for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) b.block(x - 0.05, x + 0.05, P, P + 2.4, z - 0.05, z + 0.05, M!.steel, false);
  b.shed(2.1, 2.1, P + 2.3, 0.4, M!.metal, 0.2);
  b.stairs(-0.65, 0.65, 2, 2 + P * 1.25, 0, P, '-z', M!.steel);
  b.railing('z', -0.68, 2, 2 + P * 1.25, 0, M!.steel);
  // sandbag ring at the foot
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 1.6 + 0.9; b.block(Math.cos(a) * 3.4 - 0.5, Math.cos(a) * 3.4 + 0.5, 0, 0.8, Math.sin(a) * 3.4 - 0.3, Math.sin(a) * 3.4 + 0.3, M!.sand); }
  b.crate(0.6, P, -0.8, loot);
}

/** 6 — Coastal fishing house: blue plaster, wooden shutters, corrugated roof, nets, storage. */
function fishingHouse(b: B, loot: Loot) {
  const hw = 3, hd = 2.4, H = 2.9;
  b.plinth(hw + 0.2, hd + 0.2, M!.concrete, 0.4);
  b.wall('x', -hd + 0.15, -hw, hw, 0.4, H, M!.plasterBlue, [win(-1.8, -0.9, 1.3, 2.1, false)]);
  b.wall('x', hd - 0.15, -hw, hw, 0.4, H, M!.plasterBlue, [{ ...doorway(-1, 1.3, 2.5), y0: 0.4 }, win(0.8, 1.9, 1.3, 2.1, false)]);
  b.wall('z', -hw + 0.15, -hd + 0.3, hd - 0.3, 0.4, H, M!.plasterBlue);
  b.wall('z', hw - 0.15, -hd + 0.3, hd - 0.3, 0.4, H, M!.plasterBlue, [win(-0.5, 0.5, 1.3, 2.1, false)]);
  b.door('x', hd - 0.15, -1, 1.3, 0.4);
  for (const [a, c] of [[0.8, hd + 0.02], [1.9, hd + 0.02]]) b.block(a + (a < 1 ? -0.5 : 0), a + (a < 1 ? 0 : 0.5), 1.3, 2.1, c, c + 0.06, M!.wood, false); // open shutters
  b.shed(hw, hd, H, 0.7, M!.metal, 0.6);
  // nets on poles and storage outside
  b.block(hw + 1.2, hw + 1.3, 0, 2.4, -1.5, -1.4, M!.wood); b.block(hw + 1.2, hw + 1.3, 0, 2.4, 1.4, 1.5, M!.wood);
  b.piece(new THREE.PlaneGeometry(2.9, 2.1), M!.net, hw + 1.25, 1.3, 0, 0, Math.PI / 2, 0);
  b.block(-hw - 1.4, -hw - 0.4, 0, 0.9, -1.2, -0.2, M!.wood);
  b.piece(new THREE.CylinderGeometry(0.35, 0.35, 0.95, 12), M!.rust, -hw - 0.9, 0.48, 0.8);
  b.piece(boxGeo(1.1, 0.5, 4), M!.woodLight, -hw - 2.6, 0.25, 2, 0, 0.3, 0.15); // upturned boat
  b.entry(-1, hd + 0.2, 1.5, 0.4);
  b.room(-hw, hw, -hd, hd, 0.4, H);
  b.crate(1.6, 0.4, -1.2, loot);
}

/** 7 — Abandoned warehouse: concrete shell, rusty sliding door, broken high windows, crates inside. */
function warehouse(b: B, loot: Loot) {
  const hw = 8, hd = 6, H = 6;
  b.plinth(hw + 0.2, hd + 0.2, M!.concrete, 0.25);
  const high = (a0: number, a1: number) => ({ a0, a1, y0: 4, y1: 5.2 });
  b.wall('x', -hd + 0.2, -hw, hw, 0.25, H, M!.concrete, [high(-6, -4), high(-1, 1), high(4, 6)], 0.4);
  b.wall('x', hd - 0.2, -hw, hw, 0.25, H, M!.concrete, [{ a0: -2.6, a1: 2.6, y0: 0.25, y1: 4.4 }, high(-6.5, -4.5), high(4.5, 6.5)], 0.4);
  b.wall('z', -hw + 0.2, -hd + 0.4, hd - 0.4, 0.25, H, M!.concrete, [high(-3.5, -1.5), high(1.5, 3.5), doorway(-4.5, 1.2)], 0.4);
  b.wall('z', hw - 0.2, -hd + 0.4, hd - 0.4, 0.25, H, M!.concrete, [high(-3.5, -1.5), high(1.5, 3.5)], 0.4);
  b.door('z', -hw + 0.2, -4.5, 1.2, 0.25, 2.2, M!.rust);
  b.block(2.6, 6.2, 0.25, 4.5, hd + 0.05, hd + 0.2, M!.rust); // sliding door, half open
  b.block(-2.8, 6.4, 4.5, 4.65, hd + 0.0, hd + 0.25, M!.steel, false); // door rail
  b.gable(hw, hd, H, 1.6, M!.metal, M!.concrete, 0.3);
  for (const x of [-4, 0, 4]) b.block(x - 0.12, x + 0.12, H - 0.3, H, -hd, hd, M!.steel, false); // trusses
  const stack = (x: number, z: number, n: number) => { for (let i = 0; i < n; i++) b.block(x - 0.6, x + 0.6, 0.25 + i * 1.2, 1.45 + i * 1.2, z - 0.6, z + 0.6, M!.woodLight, i === 0); };
  stack(-5.5, -3.5, 3); stack(-4.2, -3.5, 2); stack(-5.5, -2.2, 1); stack(5, -4, 2); stack(5, 2.5, 1); stack(-1.5, 1.5, 2);
  for (const z of [-5]) for (const y of [1.2, 2.6]) b.block(-2, 3.5, y, y + 0.08, z - 0.4, z + 0.4, M!.steel, false);
  b.block(-2, -1.9, 0.25, 3, -5.4, -4.6, M!.steel); b.block(3.4, 3.5, 0.25, 3, -5.4, -4.6, M!.steel);
  b.entry(0, hd + 0.2, 5, 0.25);
  b.entry(-4.5, -hw - 0.2, 1.6, 0.25, 'left');
  b.room(-hw, hw, -hd, hd, 0.25, H);
  b.crate(2, 0.25, -2.5, loot);
}

/** 10 — OJASSS armory: an open steel-frame factory hall. The front is open, the sides have big
 *  bays, and the floor holds weapon racks with gun cases, ammo, medkits and OJ T-shirts. */
function factory(b: B, _loot: Loot) {
  const hw = 12, hd = 8, H = 7.5;
  b.plinth(hw + 0.3, hd + 0.3, M!.concrete, 0.25);
  const high = (a0: number, a1: number) => ({ a0, a1, y0: 4.6, y1: 6.2 });
  // back wall with a row of high windows; side walls with wide open bays
  b.wall('x', -hd + 0.2, -hw, hw, 0.25, H, M!.metal, [high(-9, -6), high(-3, 0), high(3, 6), high(7.5, 10)], 0.35);
  b.wall('z', -hw + 0.2, -hd + 0.4, hd - 0.4, 0.25, H, M!.metal, [{ a0: -4, a1: 4, y0: 0.25, y1: 4.8 }], 0.35);
  b.wall('z', hw - 0.2, -hd + 0.4, hd - 0.4, 0.25, H, M!.metal, [{ a0: -4, a1: 4, y0: 0.25, y1: 4.8 }], 0.35);
  // open front: steel columns and a header beam carrying the OJASSS sign
  for (const x of [-hw + 0.2, -6, 0, 6, hw - 0.2]) b.block(x - 0.2, x + 0.2, 0.25, H, hd - 0.4, hd, M!.steel);
  b.block(-hw, hw, H - 0.9, H, hd - 0.45, hd, M!.steel, false);
  b.block(-4.2, 4.2, H - 2.2, H - 0.95, hd + 0.02, hd + 0.12, signMat('OJASSS ARMORY', '#1b1b1f', '#ff8a2b'), false);
  b.gable(hw, hd, H, 2, M!.metal, M!.metal, 0.4);
  for (const x of [-8, -4, 0, 4, 8]) b.block(x - 0.12, x + 0.12, H - 0.35, H, -hd, hd, M!.steel, false); // roof trusses
  // weapon racks along the back wall (two shelves each)
  for (const x0 of [-9.5, -3, 3.5]) {
    b.block(x0, x0 + 0.1, 0.25, 2.6, -hd + 0.5, -hd + 1.3, M!.steel); b.block(x0 + 5, x0 + 5.1, 0.25, 2.6, -hd + 0.5, -hd + 1.3, M!.steel);
    for (const y of [1.1, 2.3]) b.block(x0, x0 + 5.1, y, y + 0.08, -hd + 0.5, -hd + 1.3, M!.steel, false);
  }
  // workbenches and pallets
  b.block(-6, -2, 0.25, 1.1, -1, 0.4, M!.woodLight); b.block(2, 6, 0.25, 1.1, -1, 0.4, M!.woodLight);
  const pallet = (x: number, z: number, n: number) => { for (let i = 0; i < n; i++) b.block(x - 0.6, x + 0.6, 0.25 + i * 1.1, 1.3 + i * 1.1, z - 0.6, z + 0.6, M!.woodLight, i === 0); };
  pallet(-10, 4, 2); pallet(-8.6, 4.4, 1); pallet(10, 3.5, 3); pallet(9.6, -2, 1);
  // the loot: more weapons here than anywhere else on the island
  b.crate(-7, 1.2, -hd + 0.9, 'sniper');
  b.crate(-1, 1.2, -hd + 0.9, 'smg');
  b.crate(5.5, 1.2, -hd + 0.9, 'shotgun');
  b.crate(-4, 1.1, -0.3, 'supplies');
  b.crate(4, 1.1, -0.3, 'tshirt');
  b.crate(-1, 2.4, -hd + 0.9, 'tshirt');
  b.crate(0, 0, 3, 'smg');
  b.entry(0, hd + 0.2, 10, 0.25);
  b.room(-hw, hw, -hd, hd, 0.25, H);
}

/** 8 — Mountain cabin: stone base, timber walls, porch with posts, steep roof. */
function mountainCabin(b: B, loot: Loot) {
  const hw = 3.4, hd = 2.8, H = 3;
  b.plinth(hw + 0.2, hd + 0.2, M!.darkStone);
  const sides = (y0: number, y1: number, mat: THREE.Material, wins: boolean) => {
    b.wall('x', -hd + 0.15, -hw, hw, y0, y1, mat, wins ? [win(-1.8, -0.8, 1.3, 2.2)] : [], 0.35);
    b.wall('x', hd - 0.15, -hw, hw, y0, y1, mat, [doorway(0.8, 1.2, 2.4), ...(wins ? [win(-2.4, -1.4, 1.3, 2.2)] : [])], 0.35);
    b.wall('z', -hw + 0.15, -hd + 0.3, hd - 0.3, y0, y1, mat, wins ? [win(-0.5, 0.5, 1.3, 2.2)] : [], 0.35);
    b.wall('z', hw - 0.15, -hd + 0.3, hd - 0.3, y0, y1, mat, [], 0.35);
  };
  sides(0.3, 1.2, M!.stone, false);
  sides(1.2, H, M!.wood, true);
  b.door('x', hd - 0.15, 0.8, 1.2, 0.3, 2.1);
  for (const x of [-hw + 0.15, hw - 0.15]) for (const z of [-hd + 0.15, hd - 0.15]) b.block(x - 0.18, x + 0.18, 0.3, H, z - 0.18, z + 0.18, M!.wood, false); // corner beams
  b.gable(hw, hd, H, 2.2, M!.wood, M!.wood, 0.5);
  // porch
  b.slab(-hw, hw, hd + 0.2, hd + 2.2, 0.3, M!.woodLight, 0.3);
  for (const x of [-hw + 0.2, -1, hw - 0.2]) b.block(x - 0.1, x + 0.1, 0.3, 2.5, hd + 2.0, hd + 2.2, M!.wood);
  b.piece(boxGeo(hw * 2 + 0.6, 0.1, 2.5), M!.wood, 0, 2.6, hd + 1.2, 0.18, 0, 0);
  b.block(-2.6, -1.2, 0.3, 0.75, hd + 0.5, hd + 1.0, M!.woodLight); // bench
  b.block(-1.5, 1.5, 0.3, 1.2, -hd + 0.3, -hd + 1.0, M!.darkStone); // hearth
  b.entry(0.8, hd + 2.2, 1.8);
  b.room(-hw, hw, -hd, hd, 0.3, H);
  b.crate(-2.3, 0.3, -0.5, loot);
}

/** 9 — Village school: veranda with pillars, two classrooms, benches, blackboards, painted walls. */
function villageSchool(b: B, loot: Loot) {
  const hw = 7.5, hd = 3.2, H = 3.4;
  b.plinth(hw + 0.2, hd + 2.6, M!.concrete, 0.45);
  const wins = (s: number) => [win(s * 6.2 - 0.6, s * 6.2 + 0.6, 1.3, 2.4), win(s * 1.8 - 0.6, s * 1.8 + 0.6, 1.3, 2.4)].sort((p, q) => p.a0 - q.a0);
  b.wall('x', -hd + 0.15, -hw, hw, 0.45, H, M!.plasterYellow, [...wins(-1), ...wins(1)].sort((p, q) => p.a0 - q.a0));
  b.wall('x', hd - 0.15, -hw, hw, 0.45, H, M!.plasterYellow, [win(-6.3, -5.1, 1.3, 2.4), { ...doorway(-3.6, 1.3, 2.6), y0: 0.45 }, win(-1.9, -0.9, 1.3, 2.4), win(0.9, 1.9, 1.3, 2.4), { ...doorway(3.6, 1.3, 2.6), y0: 0.45 }, win(5.1, 6.3, 1.3, 2.4)]);
  b.wall('z', -hw + 0.15, -hd + 0.3, hd - 0.3, 0.45, H, M!.plasterYellow, [win(-0.6, 0.6, 1.3, 2.4)]);
  b.wall('z', hw - 0.15, -hd + 0.3, hd - 0.3, 0.45, H, M!.plasterYellow, [win(-0.6, 0.6, 1.3, 2.4)]);
  b.wall('z', 0, -hd + 0.3, hd - 0.3, 0.45, H, M!.plasterWhite, [], 0.2); // classroom divider
  b.door('x', hd - 0.15, -3.6, 1.3, 0.45); b.door('x', hd - 0.15, 3.6, 1.3, 0.45);
  b.block(-hw, hw, 0.45, 1.0, hd + 0.02, hd + 0.08, M!.plasterBlue, false); // painted dado band
  // veranda
  for (const x of [-hw + 0.3, -5.4, -1.8, 1.8, 5.4, hw - 0.3]) b.block(x - 0.18, x + 0.18, 0.45, H, hd + 2.0, hd + 2.36, M!.plasterWhite);
  b.slab(-hw - 0.2, hw + 0.2, hd - 0.1, hd + 2.6, H + 0.2, M!.concrete, 0.2);
  b.gable(hw, hd, H, 1.6, M!.tiles, M!.plasterYellow);
  b.piece(boxGeo(5, 0.7, 0.06), signMat('GOVT. PRIMARY SCHOOL', '#1f4a7a', '#f4efe1'), 0, H + 0.6, hd + 2.62);
  // classrooms: blackboards and benches
  for (const s of [-1, 1]) {
    b.block(s * 3.7 - 1.4, s * 3.7 + 1.4, 1.1, 2.3, -hd + 0.31, -hd + 0.36, M!.board, false);
    for (let r = 0; r < 3; r++) for (const c of [-1, 1]) {
      const x = s * 3.7 + c * 1.5, z = -1.3 + r * 1.3;
      b.block(x - 0.8, x + 0.8, 0.45, 1.15, z - 0.25, z + 0.05, M!.woodLight);
    }
  }
  b.entry(-3.6, hd + 2.6, 1.8, 0.45); b.entry(3.6, hd + 2.6, 1.8, 0.45);
  b.room(-hw, hw, -hd, hd, 0.45, H);
  b.crate(-6.2, 0.45, -2.2, loot);
}

/** 10 — Ancient ruins around the summit arena: broken pillars, arches, collapsed walls, steps. */
function monsterRuins(H: Hooks) {
  const piece = (x: number, z: number, rot: number, fn: (b: B) => void) => {
    let lo = Infinity;
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, 0]]) lo = Math.min(lo, H.heightAt(x + dx, z + dz));
    const b = new B(H, x, z, lo - 0.3, rot);
    fn(b); b.finish();
  };
  const R = 19;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.1, x = Math.cos(a) * R, z = Math.sin(a) * R, rot = Math.round(-a / (Math.PI / 2) + 1) & 3;
    const kind = i % 4;
    piece(x, z, rot, (b) => {
      if (kind === 0) { // arch
        b.block(-2.4, -1.4, 0, 6.5, -0.5, 0.5, M!.stone); b.block(1.4, 2.4, 0, 6.5, -0.5, 0.5, M!.stone);
        b.block(-2.7, 2.7, 6.5, 7.5, -0.6, 0.6, M!.darkStone);
        b.block(-3, 3, 0, 0.4, -1.4, 1.4, M!.darkStone, false);
      } else if (kind === 1) { // broken pillars
        b.block(-0.6, 0.6, 0, 9 + (i % 3) * 2, -0.6, 0.6, M!.stone);
        b.block(-0.8, 0.8, 0, 0.6, -0.8, 0.8, M!.darkStone, false);
        b.piece(boxGeo(1.2, 3.5, 1.2), M!.stone, 2.4, 0.6, 0.4, 0, 0.4, 1.35); // toppled drum
        b.H.boxes.push({ ...b.rect(0.6, 4.2, -0.4, 1.2), minY: -Infinity, maxY: b.base + 1.2 });
      } else if (kind === 2) { // collapsed wall with a gap you can shoot through
        b.wall('x', 0, -4, 4, 0, 3.2, M!.stone, [{ a0: -0.8, a1: 0.9, y0: 1.2, y1: 2.4 }], 0.9);
        b.block(1.6, 4, 3.2, 4.4, -0.45, 0.45, M!.stone);
        b.block(-4.6, -3.2, 0, 0.8, 0.6, 2, M!.darkStone);
      } else { // weathered steps up to a fighting platform
        b.slab(-2.4, 2.4, -2.4, 0.6, 1.6, M!.stone, 1.9);
        b.H.boxes.push({ ...b.rect(-2.4, 2.4, -2.4, 0.6), minY: -Infinity, maxY: b.base + 1.6 });
        b.stairs(-1.6, 1.6, 0.6, 3.2, 0, 1.6, '-z', M!.darkStone);
        b.block(-2.4, -1.8, 1.6, 3.4, -2.4, -1.8, M!.stone); b.block(1.8, 2.4, 1.6, 2.6, -2.4, -1.8, M!.stone);
      }
    });
  }
}

// ------------------------------------------------------------------ village layout

type Builder = (b: B, loot: Loot) => void;
const KINDS: Record<string, { fn: Builder; r: number; plinth?: 'max' | 'min' }> = {
  village: { fn: villageHouse, r: 5.5 }, concrete: { fn: concreteHouse, r: 7 }, abandoned: { fn: abandonedHouse, r: 5 },
  shop: { fn: villageShop, r: 4.5 }, tower: { fn: watchtower, r: 6 }, fishing: { fn: fishingHouse, r: 5 },
  warehouse: { fn: warehouse, r: 10 }, factory: { fn: factory, r: 14.5 }, cabin: { fn: mountainCabin, r: 5.5 }, school: { fn: villageSchool, r: 9 },
};

/** Builds every structure on the island. `isFree` lets the caller keep trees out of footprints. */
export function buildVillages(H: Hooks): { x: number; z: number; r: number }[] {
  M ??= makeMats(H);
  const placed: { x: number; z: number; r: number }[] = [];
  const put = (kind: string, x: number, z: number, rot: number, loot: Loot) => {
    const k = KINDS[kind];
    let hi = -Infinity, lo = Infinity;
    for (let a = 0; a < 8; a++) { const y = H.heightAt(x + Math.cos(a) * k.r * 0.7, z + Math.sin(a) * k.r * 0.7); hi = Math.max(hi, y); lo = Math.min(lo, y); }
    if (lo < 1.2 || placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + k.r)) return false;
    const b = new B(H, x, z, kind === 'tower' ? lo + 0.05 : hi - 0.15, rot & 3);
    k.fn(b, loot); b.finish();
    placed.push({ x, z, r: k.r });
    return true;
  };

  // Clusters around dirt clearings; mixed types, turned to different headings, never in rows.
  const clusters: [number, number, [string, number, number, number, Loot][]][] = [
    [92, 96, [['village', 0, 0, 0, 'shotgun'], ['shop', 12, -5, 3, 'supplies'], ['concrete', -4, -15, 1, null]]],
    [-110, 40, [['village', 0, 0, 1, 'supplies'], ['abandoned', 9, 10, 2, null], ['tower', -12, -8, 0, null]]],
    [90, -95, [['warehouse', 0, 0, 2, 'supplies'], ['tower', 15, 6, 3, 'shotgun']]],
    [-95, -100, [['school', 0, 0, 0, 'supplies'], ['village', 14, 9, 3, null]]],
    [0, 125, [['concrete', 0, 0, 2, 'shotgun'], ['shop', -13, 3, 1, null], ['village', 12, -2, 2, 'supplies']]],
    [130, 5, [['tower', 0, 0, 1, 'supplies'], ['abandoned', -10, 8, 3, 'shotgun']]],
    [-125, -10, [['village', 0, 0, 3, 'shotgun'], ['cabin', 4, -13, 0, null]]],
    [10, -125, [['concrete', 0, 0, 0, 'supplies'], ['village', -13, 4, 1, null], ['shop', 12, 6, 0, null]]],
    [60, 50, [['cabin', 0, 0, 2, 'supplies'], ['abandoned', 11, -6, 1, null]]],
    [-55, 60, [['cabin', 0, 0, 1, 'shotgun'], ['tower', -11, 7, 2, null]]],
    [40, -48, [['cabin', 0, 0, 3, null]]],
    [-50, -45, [['abandoned', 0, 0, 0, 'supplies']]],
    [75, -20, [['factory', 0, 0, 1, null], ['concrete', 0, 19, 2, 'tshirt']]],
    [-80, 10, [['factory', 0, 0, 3, null], ['village', 2, -18, 0, 'tshirt']]],
    [-20, 85, [['warehouse', 0, 0, 1, 'tshirt'], ['shop', 13, 4, 2, 'supplies']]],
    [30, 95, [['village', 0, 0, 2, 'tshirt'], ['cabin', 11, -6, 1, null]]],
  ];
  for (const [cx, cz, list] of clusters) for (const [kind, dx, dz, rot, loot] of list) {
    // nudge outward/inward a little if the exact spot is unusable
    for (const s of [1, 0.85, 1.15, 0.7]) if (put(kind, cx * s + dx, cz * s + dz, rot, loot)) break;
  }

  // Fishing houses along the shore, facing the sea.
  [0.55, 1.6, 2.5, 3.5, 4.4, 5.5].forEach((a, i) => {
    for (let r = 120; r < 184; r += 2) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H.heightAt(x, z);
      if (y < 4.5 && y > 1.6) {
        const rot = (Math.round(-Math.atan2(z, x) / (Math.PI / 2) + 1) % 4 + 4) % 4; // front (+z) faces outward
        if (put('fishing', x * 0.97, z * 0.97, rot, i % 2 ? 'supplies' : null)) break;
      }
    }
  });

  monsterRuins(H);
  placed.push({ x: 0, z: 0, r: 23 });
  return placed;
}
