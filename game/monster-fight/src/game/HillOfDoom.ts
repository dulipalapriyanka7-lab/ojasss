import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addMixamoClips, attachFBXRig, attachRig, instanceModel, makeGun, play, SOLDIER_CLIPS, TITAN_CLIPS, type Rig } from './models';
import { buildVillages, surfaceAt, type Box, type Deck, type Door, type Pickup, type Room } from './buildings';

// OJASSS — Hill of Doom: browser vertical slice (Three.js). Single-player against clearly
// labelled AI bots. Characters are built from primitives and animated procedurally; every
// sound is synthesised and bound to a gameplay event.

export type Phase = 'intro' | 'drop' | 'play' | 'ended';

export interface Hud {
  /** final minute: sea height and summit height in metres (null before) */
  flood: { sea: number; top: number } | null;
  /** directions (deg, 0 = ahead) of recent hits on the player, with strength 0..1 */
  hurtDirs: { a: number; o: number }[];
  /** red screen flash 0..1 when hit */
  hurtFlash: number;
  /** grenade armed: showing the throw arc */
  nadeAim: boolean;
  /** top-down picture of the island (world -200..200 on both axes) */
  mapImg?: string;
  /** nearby hostile soldiers / Titan: direction relative to the view (deg, 0 = ahead) and distance */
  threats: { a: number; d: number; boss: boolean }[];
  /** weapon name -> picture rendered from its 3D model */
  icons?: Record<string, string>;
  /** 0 none, 1 body hit, 2 headshot (crosshair hit marker) */
  hit: number;
  phase: Phase;
  dropAltitude: number;
  hp: number;
  /** your battle coins, coins held by everyone in the match, real players connected */
  coins: number;
  matchCoins: number;
  livePlayers: number | null;
  /** last coin change for the +N / -N animation */
  coinFx: { delta: number; id: number } | null;
  ammo: number;
  reserve: number;
  weapon: string;
  slots: { name: string; owned: boolean; active: boolean; ammo: number; reserve: number }[];
  medkits: number;
  grenades: number;
  aiming: boolean;
  fps: number;
  quality: GraphicsQuality;
  renderSize: string;
  bossDist: number;
  atSummit: boolean;
  kills: number;
  botsLeft: number;
  timeLeft: number;
  bossHp: number;
  bossMax: number;
  bossPhase: number;
  bossNear: boolean;
  message: string;
  /** last elimination, shown as a banner for a few seconds */
  kill: { name: string; weapon: string; dist: number; head: boolean; left: number } | null;
  reloading: boolean;
  swimming: boolean;
  diving: boolean;
  oxygen: number;
  crouching: boolean;
  sprinting: boolean;
  action: string;
  heading: number;
  map: { x: number; z: number; yaw: number; boss: [number, number] | null; bots: [number, number][] };
}

export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
const MILITARY_SOLDIER = 'soldier-real/military-soldier-v2';

export interface MatchEconomy { starting_coins: number; coins_per_hit: number; start_hp: number; match_minutes: number; coin_elimination: boolean; win_rule: 'objective' | 'last_standing' | 'most_coins' }

export interface MatchResult {
  /** battle coins at the end (virtual, never withdrawable) */
  battleCoins: number;
  hitsLanded: number;
  kills: number;
  bossDefeated: boolean;
  victory: boolean;
  reason: string;
  survivedSeconds: number;
}

interface Parts { armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; torso: THREE.Mesh; head: THREE.Mesh }
interface Ent {
  /** seconds since death (bots turn into an OJASSS loot box) */
  boxT?: number;
  kind: 'bot' | 'boss';
  group: THREE.Group;
  parts: Parts;
  hp: number;
  maxHp: number;
  alive: boolean;
  walk: number;
  target: THREE.Vector3;
  shootAt: number;
  /** battle coins this bot took from the player (won back by eliminating it) */
  coins?: number;
  deadT: number;
  flinch: number;
}
interface Weapon { name: string; mag: number; ammo: number; reserve: number; rate: number; dmg: number; pellets: number; spread: number; owned: boolean; kind: 'rifle' | 'pistol' | 'shotgun' | 'smg' | 'sniper' | 'melee' }

const ISLAND = 186;
const TITAN_SCALE = 6.2; // 2.1 m model x 6.2 = 13 m Volcanic Titan
/** Bot uniforms: charcoal, olive jungle, desert, navy special forces, mountain grey, OJASSS elite. */
const OUTFITS: [number, number][] = [[0x3a3d42, 0x17181a], [0x55603a, 0x2a2e1e], [0x9a7d55, 0x4a3a26], [0x2a3a5c, 0x141b2b], [0x7c8086, 0x3d4045], [0x1d1d1f, 0xe8732e]];
// Set true for a gun model whose muzzle points backwards after normalising.
const GUN_FLIP: Record<string, boolean> = { ak47: false, pistol: false, shotgun: false, smg: false, sniper: false, ['ph/bolt_action_rifle_7_62/bolt_action_rifle_7_62.gltf']: false, ['ph/service_pistol/service_pistol.gltf']: false };
const WATER = 0;
const LAKE = { x: 112, z: 60 };

export function heightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const mountain = 70 * Math.exp(-(d * d) / (2 * 55 * 55));
  const hills = 4 * Math.sin(x * 0.05) * Math.cos(z * 0.06) + 2 * Math.sin(x * 0.13 + z * 0.09);
  const t = Math.min(1, Math.max(0, (d - 150) / 45));
  const fall = t * t * (3 - 2 * t);
  const lx = x - LAKE.x, lz = z - LAKE.z;
  const lake = -22 * Math.exp(-(lx * lx + lz * lz) / (2 * 13 * 13));
  return (mountain + hills + 3) * (1 - fall) - 6 * fall + lake;
}

function limb(w: number, h: number, color: number, map?: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), limbMat(color, map, true));
  m.position.y = -h / 2; m.castShadow = true;
  g.add(m);
  return g;
}

// ---- Textures (generated images in /public/game) ----
const loader = new THREE.TextureLoader();
// How many textures/models are still downloading (all loaders share the default manager).
let assetsPending = 0;
THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => { assetsPending = Math.max(0, total - loaded); };
THREE.DefaultLoadingManager.onLoad = () => { assetsPending = 0; };
export function assetsStillLoading(): number { return assetsPending; }
const texCache = new Map<string, THREE.Texture>();
function tex(name: string, rx = 1, ry = rx, wrap: THREE.Wrapping = THREE.RepeatWrapping): THREE.Texture {
  const key = `${name}:${rx}:${ry}:${wrap}`;
  let t = texCache.get(key);
  if (!t) {
    // Start with a neutral 1-pixel image (flat normal for normal maps) so a surface is never drawn
    // black while its photo is still downloading, and retry a failed download a few times.
    const isNormal = name.endsWith('_nor_gl') || name.endsWith('waternormals');
    const ph = document.createElement('canvas'); ph.width = ph.height = 1;
    const pc = ph.getContext('2d')!; pc.fillStyle = isNormal ? '#8080ff' : '#9a9187'; pc.fillRect(0, 0, 1, 1);
    t = new THREE.Texture(ph); t.needsUpdate = true;
    const url = name.startsWith('pbr/') ? `/game/${name}.jpg` : `/game/${name}.webp`;
    const tt = t;
    const fetchImg = (left: number) => loader.load(url, (img) => { tt.dispose(); tt.image = img.image; tt.needsUpdate = true; }, // dispose: the GPU copy was sized for the 1-px placeholder
      undefined, () => { if (left > 0) setTimeout(() => fetchImg(left - 1), 1500); });
    fetchImg(3);
    t.colorSpace = name.endsWith('_nor_gl') || name.endsWith('waternormals') ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = wrap;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    texCache.set(key, t);
  }
  return t;
}

// Capture the fallback parts before inserting the animated rig. Keep the fallback
// visible until the rig is usable and preserve the separate combat hit boxes.
function retirePreview(group: THREE.Group, keep: THREE.Object3D[] = []): () => void {
  const parts: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && !keep.includes(o)) parts.push(o);
  });
  return () => {
    for (const part of parts) {
      part.visible = false;
      part.castShadow = false;
    }
  };
}

function labelTex(text: string, bg: string, fg: string, w = 256, h = 128): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 2); }
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
  c.fillStyle = fg; c.font = `bold ${Math.round(h * 0.42)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Square backpack patch: dark badge with the red brush OJ and OJASSS under it. */
export function ojPatchTex(): THREE.Texture {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  // dark smoky badge
  c.fillStyle = '#0d0d0f'; c.beginPath(); c.roundRect(6, 6, S - 12, S - 12, 56); c.fill();
  for (let i = 0; i < 70; i++) { const g = c.createRadialGradient(Math.random() * S, Math.random() * S, 0, Math.random() * S, Math.random() * S, 40 + Math.random() * 90); g.addColorStop(0, 'rgba(70,70,74,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); }
  // brush 'OJ' on its own layer, scaled so the slanted letters always fit inside the badge
  const L = document.createElement('canvas'); L.width = L.height = S;
  const l = L.getContext('2d')!;
  l.textAlign = 'center'; l.textBaseline = 'middle';
  l.font = 'italic 900 300px Impact, "Arial Black", sans-serif';
  const w = l.measureText('OJ').width + 300 * 0.22; // width plus the slant
  const k = Math.min(1, (S * 0.72) / w);
  l.save(); l.translate(S / 2, S * 0.55); l.scale(k, k); l.transform(1, 0, -0.2, 1, 0, 0);
  l.fillStyle = '#e3122a'; l.fillText('OJ', 0, 0);
  l.restore();
  // dry-brush texture: knock thin horizontal streaks and specks out of the letters
  l.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) { const y = Math.random() * S; l.fillStyle = 'rgba(0,0,0,' + (0.25 + Math.random() * 0.6) + ')'; l.fillRect(Math.random() * S, y, 8 + Math.random() * 70, 1 + Math.random() * 2.2); }
  for (let i = 0; i < 500; i++) { l.fillStyle = 'rgba(0,0,0,0.8)'; l.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5); }
  l.globalCompositeOperation = 'source-over';
  c.drawImage(L, 0, 0);
  // a few red flecks around the strokes, kept inside the badge
  for (let i = 0; i < 26; i++) { c.fillStyle = 'rgba(227,18,42,' + (0.4 + Math.random() * 0.5) + ')'; c.beginPath(); c.arc(S * 0.15 + Math.random() * S * 0.7, S * 0.22 + Math.random() * S * 0.5, 1 + Math.random() * 3, 0, 7); c.fill(); }
  c.fillStyle = '#f2f2f2'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  // white spaced caps above the OJ, like a film title card
  c.font = '600 40px Georgia, "Times New Roman", serif';
  const title = 'T H E Y   C A L L   H I M';
  const tw = c.measureText(title).width; if (tw > S * 0.84) c.font = '600 ' + Math.floor(40 * S * 0.84 / tw) + 'px Georgia, serif';
  c.fillText(title, S / 2, S * 0.2);
  c.font = 'bold 30px sans-serif'; c.fillText('O J A S S S', S / 2, S * 0.88);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** A natural boulder: a fine sphere pushed in and out by layered noise, squashed and flattened
 *  underneath, so it reads as weathered rock rather than a faceted gem. */
function boulderGeo(radius: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 3);
  const pos = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  const h = (x: number, y: number, z: number) => Math.sin(x * 1.7 + seed) * Math.sin(y * 2.3 + seed * 1.3) * Math.sin(z * 1.9 + seed * 0.7);
  const sx = 1 + ((seed * 7.13) % 0.5), sz = 1 + ((seed * 3.71) % 0.4);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n = 1 + 0.22 * h(v.x * 2, v.y * 2, v.z * 2) + 0.09 * h(v.x * 5, v.y * 5, v.z * 5) + 0.035 * h(v.x * 11, v.y * 11, v.z * 11);
    v.multiplyScalar(radius * n);
    v.x *= sx; v.z *= sz; v.y *= 0.72;
    if (v.y < -radius * 0.25) v.y = -radius * 0.25 + (v.y + radius * 0.25) * 0.15; // flat-ish base
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
let rockMatCache: THREE.MeshStandardMaterial | null = null;
function rockMat(): THREE.MeshStandardMaterial {
  rockMatCache ??= new THREE.MeshStandardMaterial({
    map: tex('pbr/rocky_terrain_02_Diffuse', 1.5), normalMap: tex('pbr/rocky_terrain_02_nor_gl', 1.5),
    color: new THREE.Color(1.55, 1.5, 1.44), roughness: 0.92, normalScale: new THREE.Vector2(1.3, 1.3),
  });
  // the photo has moss in it: keep its relief but turn it into grey weathered stone
  rockMatCache.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n{ float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, 0.18) * vec3(1.02, 1.0, 0.96); }');
  };
  return rockMatCache;
}

/** Floating pickups: medkit (red cross), ammo can, and stencilled gun cases, with a soft glow ring. */
function makePickup(kind: Pickup): THREE.Group {
  const g = new THREE.Group();
  const side = (t: THREE.Texture, base: number) => [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial(i === 2 || i === 3 ? { color: base, roughness: 0.7 } : { map: t, roughness: 0.7 }));
  let box: THREE.Mesh, glow = 0x55ff88;
  if (kind === 'medkit') {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d')!; c.fillStyle = '#f1f1ee'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#c4161c'; c.fillRect(50, 22, 28, 84); c.fillRect(22, 50, 84, 28);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.45), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    handle.position.y = 0.2; g.add(handle);
  } else if (kind === 'tshirt') {
    // folded-out OJASSS T-shirt: black shirt with the orange OJ logo, on a small hanger
    glow = 0xff2a3a;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#121214';
    c.beginPath(); c.moveTo(70, 20); c.lineTo(100, 20); c.quadraticCurveTo(128, 46, 156, 20); c.lineTo(186, 20); c.lineTo(250, 70); c.lineTo(220, 112); c.lineTo(196, 96); c.lineTo(196, 246); c.lineTo(60, 246); c.lineTo(60, 96); c.lineTo(36, 112); c.lineTo(6, 70); c.closePath(); c.fill();
    c.strokeStyle = '#2a2a2e'; c.lineWidth = 4; c.stroke();
    // red brush-stroke OJ: several jittered, slanted passes give a rough painted edge
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.translate(128, 136); c.transform(1, 0, -0.18, 1, 0, 0);
    for (let i = 0; i < 7; i++) { c.fillStyle = i < 6 ? 'rgba(200,16,30,0.35)' : '#e3122a'; c.font = 'italic 900 ' + (78 + (i % 3) * 2) + 'px Impact, sans-serif'; c.fillText('OJ', (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5); }
    c.restore();
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(227,18,42,' + Math.random() * 0.5 + ')'; c.fillRect(70 + Math.random() * 120, 92 + Math.random() * 90, 1 + Math.random() * 3, 1 + Math.random() * 2); }
    c.fillStyle = '#f5f5f5'; c.font = 'bold 15px sans-serif'; c.fillText('O J A S S S', 128, 196);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    box = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }));
    box.position.y = 0.15;
    const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3 }));
    hanger.position.y = 0.6; g.add(hanger);
  } else if (kind === 'supplies') {
    glow = 0xffd060;
    box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.3), side(labelTex('AMMO', '#4b5232', '#e8d9a0'), 0x3d4329));
  } else {
    glow = 0xffa040;
    const name = kind === 'smg' ? 'SMG' : kind === 'sniper' ? 'SNIPER' : 'SHOTGUN';
    box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 0.42), side(labelTex(name, '#3f472d', '#efe6c4', 512, 128), 0x343b25));
  }
  box.castShadow = true; g.add(box);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.28; g.add(ring);
  return g;
}

/** Parachute canopy: orange and charcoal panels with the OJASSS patch front and back, plus lines. */
function makeChute(): THREE.Mesh {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const c = cv.getContext('2d')!;
  for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#1e1d1f' : '#e8732e'; c.fillRect((i * 1024) / 12, 0, 1024 / 12 + 1, 512); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    // the lower band of the dome (just above the rim) is the least curved, so the logo reads there
    for (const cx of [256, 768]) { c.fillStyle = '#1e1d1f'; c.fillRect(cx - 118, 104, 236, 150); c.drawImage(img, cx - 112, 108, 224, 144); }
    t.needsUpdate = true;
  };
  img.src = '/game/ojasss-patch.webp';
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.85 }));
  canopy.castShadow = true;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 3.35, 0, Math.sin(a) * 3.35), new THREE.Vector3(Math.cos(a) * 0.25, -3.0, Math.sin(a) * 0.15)); }
  canopy.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a2a })));
  return canopy;
}

/** Invisible hit boxes: a body cylinder and a head sphere (the only thing bullets test). */
function addHitbox(group: THREE.Group, h: number, r: number) {
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h * 0.8, 8), mat);
  body.position.y = h * 0.4; body.userData.hitbox = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 10, 8), mat);
  head.position.y = h * 0.89; head.userData.hitbox = true; head.userData.head = true;
  group.add(body, head);
}

/** Tactical backpack with the OJASSS patch, worn on the player's back. */
/** Woven nylon fabric texture for the pack (subtle weave and wear). */
let fabricTex: THREE.Texture | null = null;
function fabric(): THREE.Texture {
  if (fabricTex) return fabricTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#7d7d7d'; c.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) { c.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.05})`; c.fillRect(0, y, 128, 1); }
  for (let x = 0; x < 128; x += 2) { c.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.04})`; c.fillRect(x, 0, 1, 128); }
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; c.beginPath(); c.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 8, 0, 6.3); c.fill(); }
  fabricTex = new THREE.CanvasTexture(cv); fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping; fabricTex.repeat.set(2, 2);
  return fabricTex;
}

/** Tactical assault pack: rounded main body, lid, side and front pouches with MOLLE webbing, buckles,
 *  rolled sleeping mat, shoulder straps, and the OJASSS patch on the front pouch. */
function makeBackpack(): THREE.Group {
  const g = new THREE.Group();
  const tan = new THREE.MeshStandardMaterial({ map: fabric(), color: 0x6b6250, roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ map: fabric(), color: 0x34312a, roughness: 0.95 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x23211c, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 });
  const rb = (w: number, h: number, d: number, r: number, m: THREE.Material) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m);
  const body = rb(0.38, 0.5, 0.2, 0.05, tan); body.position.z = -0.02;
  const lid = rb(0.39, 0.12, 0.22, 0.04, dark); lid.position.set(0, 0.25, -0.02);
  const front = rb(0.28, 0.24, 0.08, 0.03, dark); front.position.set(0, -0.06, -0.15);
  g.add(body, lid, front);
  for (const x of [-0.215, 0.215]) { const side = rb(0.07, 0.22, 0.14, 0.025, dark); side.position.set(x, -0.08, -0.03); g.add(side); }
  for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.012, 0.004), strap); w.position.set(0, -0.15 + i * 0.045, -0.192); g.add(w); }
  for (const x of [-0.09, 0.09]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.012), strap); b.position.set(x, 0.17, -0.13); const k = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.016), metal); k.position.set(x, 0.12, -0.137); g.add(b, k); }
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.44, 14), new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.9 }));
  mat.rotation.z = Math.PI / 2; mat.position.set(0, -0.3, -0.04); g.add(mat);
  for (const x of [-0.12, 0.12]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.025), strap); s.position.set(x, 0.02, 0.11); s.rotation.x = 0.12; g.add(s); }
  // OJASSS patch centred on the front pouch, just proud of the webbing so the straps never stripe through it
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: tex('ojasss-patch'), roughness: 0.8, transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -6 }));
  patch.position.set(0, -0.06, -0.199); patch.rotation.y = Math.PI; patch.renderOrder = 2; g.add(patch);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; (o as THREE.Mesh).raycast = () => {}; } });
  return g;
}


/** OJASSS patch on the left shoulder (+x is a +z-facing character's left). */
function shoulderPatch(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), new THREE.MeshStandardMaterial({ map: tex('ojasss-patch'), roughness: 0.8, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
  m.position.set(0.25, 1.42, 0); m.rotation.y = Math.PI / 2;
  m.raycast = () => {};
  return m;
}

/** Floating name and health bar above a bot. */
function makeNameplate(name: string, coins = 5): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(1.5, 0.375, 1); s.position.y = 2.25;
  s.userData.nameplate = true; s.userData.name = name; s.userData.coins = coins;
  s.raycast = () => {};
  drawNameplate(s, 1);
  return s;
}
function drawNameplate(s: THREE.Sprite, hp: number) {
  const t = s.material.map as THREE.CanvasTexture, c = (t.image as HTMLCanvasElement).getContext('2d')!;
  c.clearRect(0, 0, 256, 64);
  c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.75)';
  c.strokeText(s.userData.name as string, 128, 28); c.fillStyle = '#ffd7cf'; c.fillText(s.userData.name as string, 128, 28);
  // separate health bar (green), plus the battle coins this bot holds, if any
  const coins = (s.userData.coins as number) ?? 0;
  const barW = coins > 0 ? 120 : 160, x0 = coins > 0 ? 40 : 48;
  c.fillStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.roundRect(x0 - 4, 38, barW + 8, 18, 9); c.fill();
  c.fillStyle = hp > 0.5 ? '#22c55e' : hp > 0.25 ? '#eab308' : '#ef4444'; c.beginPath(); c.roundRect(x0, 42, Math.max(0, barW * hp), 10, 5); c.fill();
  if (coins > 0) {
    c.fillStyle = '#facc15'; c.beginPath(); c.arc(184, 47, 9, 0, 6.3); c.fill();
    c.font = 'bold 20px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#fde68a'; c.fillText(String(coins), 197, 54);
  }
  t.needsUpdate = true;
}

/** OJASSS loot box: a 0.9 m weathered-plank crate (Poly Haven texture, CC0) with steel bands and
 *  the OJASSS logo on the lid and all four sides. */
function makeLootBox(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: tex('pbr/weathered_planks_Diffuse', 1, 1), normalMap: tex('pbr/weathered_planks_nor_gl', 1, 1), color: 0xb08a5a, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.8, roughness: 0.4 });
  const logo = new THREE.MeshStandardMaterial({ map: tex('ojasss-patch'), roughness: 0.7, transparent: true, alphaTest: 0.3, emissive: 0xff7a1a, emissiveMap: tex('ojasss-patch'), emissiveIntensity: 0.35 });
  const W = 0.9, H = 0.62, D = 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wood); body.position.y = H / 2; g.add(body);
  for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, H + 0.01, D + 0.01), steel); band.position.set(x, H / 2, 0); g.add(band); }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.05, D + 0.02), steel); lid.position.y = H; g.add(lid);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), logo); top.rotation.x = -Math.PI / 2; top.position.y = H + 0.03; g.add(top);
  for (const [x, z, ry] of [[0, D / 2 + 0.006, 0], [0, -D / 2 - 0.006, Math.PI], [W / 2 + 0.006, 0, Math.PI / 2], [-W / 2 - 0.006, 0, -Math.PI / 2]] as const) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), logo); s.position.set(x, H / 2, z); s.rotation.y = ry; g.add(s);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; (o as THREE.Mesh).raycast = () => {}; } });
  return g;
}

/** Render a small side-view picture of a gun model for the HUD. */
let iconRenderer: THREE.WebGLRenderer | null = null;
function gunIcon(gun: THREE.Object3D): string {
  try {
    iconRenderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    iconRenderer.setSize(240, 90, false); iconRenderer.setClearColor(0x000000, 0);
    iconRenderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(1, 2, 3); scene.add(key);
    const copy = gun.clone(true); copy.position.set(0, 0, 0); copy.quaternion.identity(); copy.visible = true;
    copy.rotation.y = -Math.PI / 2; // barrel (+z) points to the right of the picture
    scene.add(copy);
    const box = new THREE.Box3().setFromObject(copy), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const cam = new THREE.OrthographicCamera(-s.x * 0.56, s.x * 0.56, s.x * 0.21, -s.x * 0.21, 0.01, 100);
    cam.position.set(c.x, c.y, c.z + 10); cam.lookAt(c);
    iconRenderer.render(scene, cam);
    return iconRenderer.domElement.toDataURL('image/png');
  } catch { return ''; }
}

/** Paint a shaded top-down map of the island: sea depth, beaches, hill-shaded grass and rock,
 *  building footprints and the summit arena. World x/z -200..200 maps to 0..512 pixels. */
function renderMap(boxes: Box[]): string {
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d')!, img = c.createImageData(N, N), px = img.data;
  const W = 400 / N, sun = new THREE.Vector3(-0.6, 0.8, -0.5).normalize();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -200 + i * W, z = -200 + j * W, h = heightAt(x, z);
    let r: number, g: number, b: number;
    if (h < 0) { const d = Math.min(1, -h / 8); r = 30 - 18 * d; g = 110 - 55 * d; b = 140 - 40 * d; }
    else {
      const nx = heightAt(x - 1, z) - heightAt(x + 1, z), nz = heightAt(x, z - 1) - heightAt(x, z + 1);
      const shade = Math.max(0.55, Math.min(1.25, 0.85 + (nx * sun.x + nz * sun.z) * 0.18 + sun.y * 0.15));
      if (h < 2.4) { r = 214; g = 196; b = 150; }
      else if (h > 34) { const t = Math.min(1, (h - 34) / 20); r = 120 + 25 * t; g = 116 + 20 * t; b = 104 + 22 * t; }
      else { const t = h / 34; r = 78 + 40 * t; g = 118 + 8 * t; b = 58 + 22 * t; }
      r *= shade; g *= shade; b *= shade;
      if (h > 0 && h < 0.7) { r = (r + 240) / 2; g = (g + 240) / 2; b = (b + 230) / 2; } // surf line
    }
    const k = (j * N + i) * 4; px[k] = r; px[k + 1] = g; px[k + 2] = b; px[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  // building footprints
  c.fillStyle = 'rgba(232,226,214,.92)'; c.strokeStyle = 'rgba(40,30,20,.55)'; c.lineWidth = 0.6;
  for (const bx of boxes) {
    const w = (bx.maxX - bx.minX) / W, d = (bx.maxZ - bx.minZ) / W;
    if (w * d > 900 || bx.door) continue;
    const x = (bx.minX + 200) / W, y = (bx.minZ + 200) / W;
    c.fillRect(x, y, Math.max(1, w), Math.max(1, d));
  }
  // summit arena ring
  c.strokeStyle = 'rgba(249,115,22,.85)'; c.lineWidth = 2; c.setLineDash([4, 3]);
  c.beginPath(); c.arc(N / 2, N / 2, 26 / W, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  return cv.toDataURL('image/jpeg', 0.85);
}

/** Frag grenade: olive body with ribbing, a steel fuse and spoon. */
/** OJ Katana: long curved steel blade, round guard, crimson collar and a black diamond-wrapped
 *  two-handed grip. Original geometry; the blade runs along +Y from the grip. */
function makeKatana(): THREE.Group {
  const g = new THREE.Group();
  const wrap = document.createElement('canvas'); wrap.width = 64; wrap.height = 256;
  const c = wrap.getContext('2d')!;
  c.fillStyle = '#0b0b0d'; c.fillRect(0, 0, 64, 256);
  for (let y = -32; y < 288; y += 32) {
    c.strokeStyle = '#2a2a30'; c.lineWidth = 9;
    c.beginPath(); c.moveTo(0, y); c.lineTo(64, y + 32); c.moveTo(64, y); c.lineTo(0, y + 32); c.stroke();
    c.fillStyle = '#c9a227'; c.beginPath(); c.moveTo(32, y + 10); c.lineTo(38, y + 16); c.lineTo(32, y + 22); c.lineTo(26, y + 16); c.fill();
  }
  const wrapTex = new THREE.CanvasTexture(wrap); wrapTex.colorSpace = THREE.SRGBColorSpace;
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: 0.75, roughness: 0.22, emissive: 0x2b3038, emissiveIntensity: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23252b, metalness: 0.8, roughness: 0.4, emissive: 0x0c0d10 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.3, 14), new THREE.MeshStandardMaterial({ map: wrapTex, roughness: 0.85 }));
  grip.position.y = -0.15;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.019, 0.03, 14), dark); cap.position.y = -0.315;
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.009, 24), dark); guard.position.y = 0.005;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 24), steel); rim.rotation.x = Math.PI / 2; rim.position.y = 0.005;
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.034), new THREE.MeshStandardMaterial({ color: 0xb01020, metalness: 0.6, roughness: 0.35, emissive: 0x400408 }));
  collar.position.y = 0.032;
  // blade profile: gentle curve toward the back edge and a pointed tip
  const sh = new THREE.Shape();
  sh.moveTo(-0.026, 0.01); sh.lineTo(0.026, 0.01);
  sh.quadraticCurveTo(0.05, 0.55, 0.008, 0.98);          // cutting edge sweeps back
  sh.lineTo(-0.034, 1.02);                                 // tip
  sh.quadraticCurveTo(0.006, 0.55, -0.026, 0.01);        // spine
  const bladeGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1, curveSegments: 16 });
  bladeGeo.translate(0, 0, -0.007);
  const blade = new THREE.Mesh(bladeGeo, steel); blade.rotation.y = Math.PI / 2;
  // a second, crossed copy keeps the blade visible from any camera angle
  const blade2 = new THREE.Mesh(bladeGeo, steel); blade2.scale.set(0.55, 1, 1);
  g.userData.steel = steel;
  g.add(grip, cap, guard, rim, collar, blade, blade2);
  g.traverse((o) => { o.castShadow = true; (o as THREE.Mesh).raycast = () => {}; });
  return g;
}

function makeGrenade(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshStandardMaterial({ color: 0x4b5a32, roughness: 0.7, metalness: 0.2 }));
  body.scale.y = 1.2;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.007, 6, 18), new THREE.MeshStandardMaterial({ color: 0x3a4526, roughness: 0.8 }));
  band.rotation.x = Math.PI / 2;
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.9, roughness: 0.3 }));
  fuse.position.y = 0.1;
  const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.12, 0.006), fuse.material); spoon.position.set(0.035, 0.05, 0); spoon.rotation.z = -0.25;
  g.add(body, band, fuse, spoon);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; (o as THREE.Mesh).raycast = () => {}; } });
  return g;
}

/** Soft puff texture: a hot fire puff (white core) or a soft grey smoke puff with noise. */
const puffCache: Record<string, THREE.Texture> = {};
function puffTex(hot: boolean): THREE.Texture {
  const key = hot ? 'hot' : 'smoke';
  if (puffCache[key]) return puffCache[key];
  const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d')!;
  for (let i = 0; i < 26; i++) {
    const x = N / 2 + (Math.random() - 0.5) * N * 0.36, y = N / 2 + (Math.random() - 0.5) * N * 0.36, r = N * (0.16 + Math.random() * 0.2);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    if (hot) { g.addColorStop(0, 'rgba(255,255,240,.55)'); g.addColorStop(0.35, 'rgba(255,200,90,.35)'); g.addColorStop(1, 'rgba(255,90,10,0)'); }
    else { g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    c.fillStyle = g; c.fillRect(0, 0, N, N);
  }
  // soft round edge so no puff ever shows a square outline
  c.globalCompositeOperation = 'destination-in';
  const m = c.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.55, 'rgba(0,0,0,.85)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = m; c.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (puffCache[key] = t);
}

/** Cached lookup of a Mixamo bone ("mixamorigHips", "mixamorig:Hips" or "mixamorigHips_01"). */
const boneCache = new WeakMap<object, Map<string, THREE.Object3D | undefined>>();
function boneOf(rig: Rig, key: string): THREE.Object3D | undefined {
  let m = boneCache.get(rig);
  if (!m) { m = new Map(); boneCache.set(rig, m); }
  if (!m.has(key)) m.set(key, [...rig.meshes.values()].find((o) => new RegExp('^mixamorig:?' + key + '(_\\d+)?$').test(o.name)));
  return m.get(key);
}

/** How the katana sits in the right hand (blade leaves the fist on the thumb side). */
const KATANA_GRIP = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

function limbMat(color: number, map?: THREE.Texture, glow?: boolean): THREE.MeshStandardMaterial {
  return map
    ? new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.9, ...(glow ? { emissive: 0xff5a00, emissiveMap: map, emissiveIntensity: 0.55 } : {}) })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
}

function humanoid(body: number, skin: number, pants: number, map?: THREE.Texture): { group: THREE.Group; parts: Parts } {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), limbMat(body, map, true));
  torso.position.y = 1.35; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), map ? limbMat(skin, map, true) : new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }));
  head.position.y = 2.05; head.castShadow = true;
  const armL = limb(0.2, 0.75, body, map); armL.position.set(-0.47, 1.75, 0);
  const armR = limb(0.2, 0.75, body, map); armR.position.set(0.47, 1.75, 0);
  const legL = limb(0.26, 0.9, pants, map); legL.position.set(-0.19, 0.9, 0);
  const legR = limb(0.26, 0.9, pants, map); legR.position.set(0.19, 0.9, 0);
  group.add(torso, head, armL, armR, legL, legR);
  return { group, parts: { armL, armR, legL, legR, torso, head } };
}

/** AK-47 built from primitives, modelled along +z then turned to lie along the arm. */
function makeAK(): { gun: THREE.Group; muzzle: THREE.Object3D; mag: THREE.Mesh } {
  const steel = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, metalness: 0.75, roughness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.7 });
  const body = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; body.add(m); return m;
  };
  add(new THREE.BoxGeometry(0.07, 0.11, 0.5), steel, 0, 0, 0);
  add(new THREE.BoxGeometry(0.075, 0.035, 0.3), steel, 0, 0.07, 0.02);
  add(new THREE.BoxGeometry(0.075, 0.085, 0.3), wood, 0, -0.005, 0.38);
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 8), steel, 0, 0.015, 0.72, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), steel, 0, 0.055, 0.5, Math.PI / 2);
  add(new THREE.BoxGeometry(0.02, 0.07, 0.02), steel, 0, 0.06, 0.88);
  add(new THREE.BoxGeometry(0.06, 0.1, 0.34), wood, 0, -0.03, -0.41, 0.12);
  add(new THREE.BoxGeometry(0.05, 0.15, 0.06), wood, 0, -0.12, -0.14, -0.3);
  const mag = add(new THREE.BoxGeometry(0.05, 0.27, 0.09), steel, 0, -0.17, 0.1, 0.4);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, 0.95); body.add(muzzle);
  const gun = new THREE.Group(); gun.add(body);
  gun.rotation.x = Math.PI / 2; gun.position.set(0, -0.72, 0.08);
  return { gun, muzzle, mag };
}

export class HillOfDoom {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1100);
  private clock = new THREE.Clock();
  private raf = 0;
  private keys = new Set<string>();
  private yaw = Math.PI / 4;
  private pitch = 0.15;
  private freeLook = false;
  private stick = new THREE.Vector2();
  private sprintOn = false;
  private touchId: number | null = null;
  private touchLast = new THREE.Vector2();
  private player: { group: THREE.Group; parts: Parts };
  private chute: THREE.Mesh;
  private gun: THREE.Object3D;
  private muzzle: THREE.Object3D;
  private magMesh: THREE.Mesh;
  private flash = new THREE.PointLight(0xffb347, 0, 14);
  private flashMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  private flashT = 0;
  private audio: AudioContext | null = null;
  private vy = 0;
  private grounded = false;
  private walk = 0;
  private stride = 0;
  private recoil = 0;
  private swimming = false;
  private diving = false;
  private oxygen = 100;
  private crouching = false;
  private ents: Ent[] = [];
  private boss!: Ent;
  private bossEyes: THREE.MeshStandardMaterial;
  private bossAwake = false;
  private sky = new Sky();
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 1.0);
  private fog = new THREE.Fog(0xbcd6ea, 120, 620);
  private mood = 0;
  private waves: THREE.Texture | null = null;
  private lightning = 0;
  private boltT = 6;
  private bolt: THREE.Line | null = null;
  private sea = WATER;
  private water!: THREE.Mesh;
  private storm = new THREE.ShaderMaterial({
    uniforms: { k: { value: 0 }, flash: { value: 0 }, col: { value: new THREE.Color(0x0b0f1f) } },
    vertexShader: 'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float k; uniform float flash; uniform vec3 col; varying float vy; void main(){ float a = k * (0.93 + 0.06 * smoothstep(-0.02, 0.45, vy)); gl_FragColor = vec4(mix(col, vec3(0.78, 0.82, 1.0), flash * 0.85), a * (1.0 - flash * 0.55)); }',
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
  });
  private stormDome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.storm); // inside the 1100 m view distance, so it is never clipped into a circle

  /** Lightning in the dark sky: a jagged bolt, a flash, and thunder that arrives after the light. */
  private weather(dt: number) {
    this.stormDome.position.copy(this.camera.position);
    this.lightning = Math.max(0, this.lightning - dt * 4);
    if (this.bolt && this.lightning < 0.2) { this.scene.remove(this.bolt); this.bolt = null; }
    if (this.mood < 0.6) return;
    this.boltT -= dt;
    if (this.boltT > 0) return;
    this.boltT = 3 + Math.random() * 6;
    const a = Math.random() * Math.PI * 2, r = 260 + Math.random() * 500, cam = this.camera.position;
    const pts: THREE.Vector3[] = [];
    let x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
    for (let y = 420; y > 0; y -= 30 + Math.random() * 25) { pts.push(new THREE.Vector3(x, y, z)); x += (Math.random() - 0.5) * 40; z += (Math.random() - 0.5) * 40; }
    pts.push(new THREE.Vector3(x, 0, z));
    this.bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe8eeff, fog: false }));
    this.scene.add(this.bolt);
    this.lightning = 1;
    setTimeout(() => { this.lightning = Math.max(this.lightning, 0.7); }, 90);
    setTimeout(() => this.thunder(r), Math.min(2600, (r / 340) * 1000));
  }
  private thunder(dist: number) {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime, vol = 0.9 / (1 + dist / 500);
    const crack = this.noise(a, 0.4, 1.5), hp = a.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 900;
    const cg = a.createGain(); cg.gain.setValueAtTime(vol * 0.5, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    crack.connect(hp).connect(cg).connect(this.master(a)); crack.start(t);
    const rum = this.noise(a, 3.2, 0.7), lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const rg = a.createGain(); rg.gain.setValueAtTime(0.001, t); rg.gain.linearRampToValueAtTime(vol * 1.4, t + 0.25); rg.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    rum.connect(lp).connect(rg).connect(this.master(a)); rum.start(t);
  }
  private clouds: THREE.Sprite[] = [];

  /** 0 = clear daytime sky; 1 = dark sky once the Titan is awake. */
  private applyMood(t: number) {
    const u = this.sky.material.uniforms;
    // the sun sinks below the horizon so the sky turns properly dark when the Titan wakes
    const elev = THREE.MathUtils.degToRad(45 - 52 * t);
    u.sunPosition.value.setFromSphericalCoords(1, Math.PI / 2 - elev, THREE.MathUtils.degToRad(35));
    u.turbidity.value = 3 + 9 * t; u.rayleigh.value = 1.6 + 1.4 * t; u.mieCoefficient.value = 0.004 + 0.02 * t;
    this.renderer.toneMappingExposure = 0.9;
    // Under the storm the sun turns into cool moonlight and the sky fill turns blue, but the
    // ground and soldiers stay lit (no global darkening).
    this.sun.color.setRGB(1 - 0.23 * t, 0.96 - 0.11 * t, 0.88 + 0.12 * t);
    this.sun.intensity = 2.8 - 0.6 * t;
    this.hemi.color.setRGB(0.81 - 0.16 * t, 0.9 - 0.12 * t, 1);
    this.hemi.groundColor.setRGB(0.29 - 0.08 * t, 0.35 - 0.12 * t, 0.23 - 0.04 * t);
    this.hemi.intensity = 1.35 - 0.15 * t + this.lightning * 1.4;
    this.fog.color.setRGB(0.74 - 0.58 * t, 0.84 - 0.62 * t, 0.92 - 0.6 * t);
    this.fog.near = 120 - 60 * t;
    this.storm.uniforms.k.value = t; this.storm.uniforms.flash.value = this.lightning;
    for (const c of this.clouds) c.material.color.setRGB(1 - 0.72 * t, 1 - 0.72 * t, 1 - 0.68 * t);
  }

  private addClouds() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d')!;
    for (let i = 0; i < 9; i++) {
      const x = 30 + Math.random() * 68, y = 50 + Math.random() * 30, r = 18 + Math.random() * 22;
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(cv);
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
      const a = Math.random() * Math.PI * 2, r = 250 + Math.random() * 450;
      s.position.set(Math.cos(a) * r, 120 + Math.random() * 110, Math.sin(a) * r);
      s.scale.set(140 + Math.random() * 160, 60 + Math.random() * 50, 1);
      s.userData.drift = 1.5 + Math.random() * 2;
      this.clouds.push(s); this.scene.add(s);
    }
  }

  private rigClock = new THREE.Clock();
  private lastPos = new WeakMap<THREE.Group, THREE.Vector3>();

  /** Pick each character's animation from what it is doing, and advance all mixers. */
  private updateRigs() {
    const dt = Math.min(0.1, this.rigClock.getDelta());
    for (const c of this.clouds) { c.position.x += c.userData.drift * dt; if (c.position.x > 700) c.position.x = -700; }
    const pp = this.player.group.position;
    const speedOf = (g: THREE.Group) => {
      const last = this.lastPos.get(g), now = g.position;
      const v = last && dt > 0 ? Math.hypot(now.x - last.x, now.z - last.z) / dt : 0;
      if (last) last.copy(now); else this.lastPos.set(g, now.clone());
      return v;
    };
    const pr = this.player.group.userData.rig as Rig | undefined;
    // smoothed speed, so per-frame noise never flips the clip between Walk and Run
    this.psSmooth += (speedOf(this.player.group) - this.psSmooth) * Math.min(1, dt * 8);
    const ps = this.phase === 'drop' ? 0 : this.psSmooth;
    if (pr) {
      if (pr.actions.has('Fire')) {
        // Motion-capture soldier: pick the clip from what the player is doing.
        let c = 'Idle';
        if (this.hp <= 0) c = 'Death';
        else if (!this.grounded && !this.swimming && this.phase === 'play') c = 'Jump';
        else if (this.hurtT > 0) c = 'Hit';
        else if (this.reloadT > 0 && ps <= 0.6) c = 'Reload';
        else if (this.phase === 'drop') c = 'Idle'; // hanging under the canopy, no running in mid-air
        else if (ps > 0.6) c = this.firing && this.w.kind !== 'melee' ? 'RunFire' : (this.lastClip === 'Run' ? ps < 3.4 : ps < 4.4) ? 'Walk' : 'Run';
        else if (this.firing && this.w.kind !== 'melee') c = 'Fire';
        else if (this.crouching) c = 'Crouch';
        else if (this.aiming) c = 'Aim';
        this.lastClip = c;
        play(pr, c, c === 'Death' || c === 'Jump' || c === 'Hit', 0.18);
        this.hurtT -= dt;
        const run = pr.actions.get(c);
        if (run) run.timeScale = c === 'Run' || c === 'RunFire' ? Math.min(1.5, Math.max(0.7, ps / 6.5)) : c === 'Walk' ? Math.min(1.5, Math.max(0.7, ps / 3)) : c === 'Reload' ? 3.3 / 1.6 : c === 'Hit' ? 2.2 : 1;
      }
      else if (this.hp <= 0) play(pr, 'Death', true);
      else if (ps > 0.6) play(pr, this.firing ? 'Run_Shoot' : 'Run');
      else play(pr, this.firing ? 'Idle_Gun_Shoot' : 'Idle_Gun');
      for (const [weapon, gun] of this.guns) {
        gun.visible = this.w.name === weapon && !this.nadeAim && this.throwT <= 0;
        if (!gun.visible) continue;
        const tip = this.holdGun(this.player.group, pr, gun, this.pitch * 0.7, this.recoil, ps);
        this.flash.position.copy(tip); this.flashMesh.position.copy(tip);
      }
      // recoil: the body and rifle kick back on every shot, then settle
      pr.root.userData.base ??= pr.root.position.clone();
      pr.root.position.copy(pr.root.userData.base as THREE.Vector3).add(new THREE.Vector3(0, 0, -this.recoil * 0.55));
      pr.root.rotation.x = -this.recoil * 0.5;
      pr.mixer.update(dt);
      if (!pr.actions.has('Run')) this.mixamoPose(pr, this.hp > 0 ? ps : 0, dt);
      this.throwPose(pr);
      this.katanaPose(pr);
    }
    for (const e of this.ents) {
      const rig = e.group.userData.rig as Rig | undefined;
      const v = speedOf(e.group);
      if (!rig) continue;
      if (rig.actions.has('Fire') && e.kind === 'bot') {
        const engaged = this.phase === 'play' && e.group.position.distanceTo(pp) < 48;
        const c = !e.alive ? 'Death' : e.flinch > 0.05 ? 'Hit' : v > 0.5 ? (engaged ? 'RunFire' : v < 3 ? 'Walk' : 'Run') : engaged ? 'Fire' : 'Idle';
        play(rig, c, c === 'Death' || c === 'Hit', 0.12);
        const ha = rig.actions.get('Hit'); if (ha) ha.timeScale = 2.5;
        const far = e.group.position.distanceTo(this.camera.position);
        rig.root.visible = far < 150;
        const every = far < 35 ? 1 : far < 80 ? 2 : 4; // animation update rate by distance
        rig.root.userData.acc = ((rig.root.userData.acc as number) ?? 0) + dt;
        if (rig.root.visible && (this.frameNo + (e.group.id % every)) % every === 0) { rig.mixer.update(rig.root.userData.acc as number); rig.root.userData.acc = 0; }
        const gun = e.group.userData.gun as THREE.Object3D | undefined;
        if (gun) { gun.visible = e.alive; if (e.alive) this.holdGun(e.group, rig, gun, 0); }
        continue;
      }
      if (!e.alive) play(rig, 'Death', true);
      else if (e.flinch > 0.12) play(rig, 'HitRecieve', true, 0.06);
      else if (e.kind === 'boss') {
        if (!this.bossAwake) play(rig, 'Idle');
        else if (this.titanRoarT > 0) { this.titanRoarT -= dt; play(rig, 'Roar', true, 0.25); }
        else if (this.bossAtk < 0.7) play(rig, this.bossSmash ? 'Smash' : 'Attack', true, 0.15);
        else {
          const c = v > 4.2 ? 'Run' : v > 0.3 ? 'Walk' : 'Idle';
          play(rig, c);
          // stride speed matches ground speed so the feet don't slide (clip speeds x Titan scale)
          const act = rig.actions.get(c);
          if (act) act.timeScale = c === 'Walk' ? THREE.MathUtils.clamp(v / (1.15 * TITAN_SCALE), 0.35, 1.3) : c === 'Run' ? THREE.MathUtils.clamp(v / (3.2 * TITAN_SCALE), 0.4, 1.3) : 1;
        }
      } else {
        const engaged = this.phase === 'play' && e.group.position.distanceTo(pp) < 48;
        play(rig, v > 0.5 ? (engaged ? 'Run_Shoot' : 'Run') : engaged ? 'Idle_Gun_Shoot' : 'Idle_Gun');
      }
      rig.mixer.update(dt);
      if (e.kind === 'boss' && e.alive) this.plantFeet(e.group, rig, dt);
      const gun = e.group.userData.gun as THREE.Object3D | undefined;
      if (gun) { gun.visible = e.alive; if (e.alive) this.holdGun(e.group, rig, gun, 0); }
    }
  }

  /** Foot planting: after each animation frame, measure how high the lower foot is above the ground
   *  under it and shift the Titan so that foot rests on the surface (no floating, no sinking). */
  private plantFeet(g: THREE.Group, rig: Rig, dt: number) {
    const l = boneOf(rig, 'LeftFoot'), r = boneOf(rig, 'RightFoot');
    if (!l || !r) return;
    const base = this.titanGround(g);
    const gap = (f: THREE.Object3D) => { const w = f.getWorldPosition(new THREE.Vector3()); return w.y - heightAt(w.x, w.z); };
    const low = Math.min(gap(l), gap(r));
    // the ankle sits ~4% of the body height above the sole
    const ankle = 0.04 * 2.1 * g.scale.y;
    this.titanLift -= (low - ankle) * Math.min(1, dt * 6);
    g.position.y = base + THREE.MathUtils.clamp(this.titanLift, -4, 4);
  }
  private titanLift = 0;

  /** Hold a gun at the character's right hand, barrel along its facing, tilted by `pitch`.
   *  Returns the muzzle position in the character group's space. */
  private carryK = 1;
  private holdGun(group: THREE.Group, rig: Rig, gun: THREE.Object3D, pitch: number, kick = 0, speed = 0): THREE.Vector3 {
    const len = (gun.userData.len as number) ?? 0.9;
    let hands = this.handBones.get(rig);
    if (!hands) {
      const find = (k: string) => [...rig.meshes.values()].find((o) => o.name.startsWith('mixamorig' + k + '_') || o.name === 'mixamorig' + k);
      hands = { r: find('RightHand'), l: find('LeftHand') };
      this.handBones.set(rig, hands);
    }
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
    if (hands.r && hands.l) {
      // In the hands: the grip sits in the right hand and the barrel runs through the left hand,
      // so the rifle follows every recorded animation (aim, run, reload).
      const rh = hands.r.getWorldPosition(new THREE.Vector3()), lh = hands.l.getWorldPosition(new THREE.Vector3());
      group.worldToLocal(rh); group.worldToLocal(lh);
      const dir = lh.clone().sub(rh);
      const long = len > 0.5 && dir.length() > 0.12;
      const aim = long ? dir.normalize().lerp(fwd, 0.35).normalize() : fwd.clone();
      // Own soldier at rest: carry the rifle diagonally across the chest (barrel up and to the left)
      // so the third-person camera behind the player can actually see it; it swings back to the
      // aim line the moment the player fires or aims.
      if (group === this.player.group && long) {
        const ready = this.firing || this.aiming || this.fireT > 0 || kick > 0.01 || this.reloadT > 0;
        this.carryK += ((ready ? 0 : 1) - this.carryK) * Math.min(1, 0.016 * 9);
        if (this.carryK > 0.01) aim.lerp(new THREE.Vector3(0.3, 0.32, 0.9).normalize(), this.carryK * 0.6).normalize();
      }
      // Recoil: the muzzle climbs and the gun drives back into the shoulder, then settles.
      aim.y += kick * 0.9; aim.normalize();
      gun.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
      const t = performance.now() / 1000, sway = Math.min(1, speed / 6);
      gun.position.copy(rh).addScaledVector(aim, (long ? len * 0.18 : len * 0.25) - kick * 0.35)
        .add(new THREE.Vector3(Math.sin(t * 9) * 0.012 * sway, 0.03 + Math.abs(Math.sin(t * 9)) * 0.015 * sway, 0));
      // own soldier: carry the gun on the right shoulder (-x is the character's right) so the
      // over-the-shoulder camera sees it instead of it hiding behind the body and backpack
      return gun.position.clone().addScaledVector(aim, len * 0.5);
    }
    const at = new THREE.Vector3(-0.27, 1.32, 0.18);
    gun.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
    gun.position.copy(at).addScaledVector(fwd, len * 0.22);
    return gun.position.clone().addScaledVector(fwd, len * 0.5);
  }
  /** Final minute: the sea climbs to the summit; anyone it covers takes heavy damage. */
  private riseSea(dt: number) {
    if (this.timeLeft > 60) return;
    if (this.timeLeft + dt > 60) { this.floodCamT = 4; this.roar(); this.thud(1); this.say('THE SEA IS RISING — 60 seconds until it swallows the island', 5); }
    if (this.timeLeft <= 30 && this.timeLeft + dt > 30) { this.thud(1); this.say('30 seconds — the water is still rising!', 4); }
    const k = 1 - this.timeLeft / 60;
    this.sea = WATER + Math.pow(k, 1.35) * (heightAt(0, 0) + 6);
    this.water.position.y = this.sea; this.seaU.value = this.sea;
    const p = this.player.group.position;
    if (p.y + 1.2 < this.sea) this.damagePlayer(22 * dt, 'Swallowed by the rising sea');
    for (const e of this.ents) if (e.alive && e.kind === 'bot' && e.group.position.y + 1.2 < this.sea) { e.alive = false; e.hp = 0; }
  }
  private hitMark = 0;
  private hitMarkT = 0;
  private camRay = new THREE.Raycaster();
  private guns = new Map<string, THREE.Object3D>();
  private medkits = 1;
  private aiming = false;
  /** Heal 50 with a carried medkit. */
  private grenades = 2;
  private nades: { m: THREE.Group; v: THREE.Vector3; t: number }[] = [];
  /** Throw a frag grenade along the view: it arcs, bounces, and explodes after 2.4 s. */
  /** Grenade button: first press raises the grenade and shows the throw arc; second press throws. */
  throwGrenade() {
    if (this.phase !== 'play' || this.grenades <= 0 || this.swimming) { this.nadeAim = false; return; }
    if (!this.nadeAim) { this.nadeAim = true; this.click(0, 1100, 0.05); return; }
    this.nadeAim = false;
    this.throwT = 0.55;
    this.grenades--;
    const m = makeGrenade();
    const { pos, vel } = this.throwStart();
    m.position.copy(pos);
    const v = vel;
    this.scene.add(m);
    this.nades.push({ m, v, t: 2.4 });
    this.click(0, 900, 0.08); this.burst(0.12, 700, 1.2, 0.15);
    this.say('Grenade out!', 1.2);
  }
  /** Where and how fast a thrown grenade leaves the hand (matches the arc preview). */
  private throwStart() {
    const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
    const p = this.player.group.position;
    const pos = new THREE.Vector3(p.x, p.y + 1.9, p.z).addScaledVector(f, 0.5);
    return { pos, vel: f.multiplyScalar(10.5).add(new THREE.Vector3(0, 4.5, 0)) };
  }
  private nadeAim = false;
  private throwT = 0;
  private arcLine: THREE.Line | null = null;
  private arcMark: THREE.Mesh | null = null;
  /** Dotted throw arc and a landing ring while a grenade is armed. */
  private updateArc() {
    const show = this.nadeAim && this.phase === 'play';
    if (!this.arcLine) {
      this.arcLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xfff3c4, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.9, depthTest: false }));
      this.arcLine.renderOrder = 10;
      this.arcMark = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 40), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
      this.arcMark.rotation.x = -Math.PI / 2; this.arcMark.renderOrder = 10;
      const inner = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthTest: false }));
      this.arcMark.add(inner);
      this.scene.add(this.arcLine, this.arcMark);
    }
    this.arcLine.visible = this.arcMark!.visible = show;
    if (!show) return;
    const { pos, vel } = this.throwStart();
    const pts: THREE.Vector3[] = [pos.clone()];
    const q = pos.clone(), v = vel.clone();
    for (let i = 0; i < 90; i++) {
      v.y -= 9.8 * 0.03; q.addScaledVector(v, 0.03);
      const floor = surfaceAt(this.decks, heightAt(q.x, q.z), q.x, q.z, q.y + 0.3);
      if (q.y <= floor) { q.y = floor + 0.05; pts.push(q.clone()); break; }
      pts.push(q.clone());
    }
    this.arcLine.geometry.setFromPoints(pts); this.arcLine.computeLineDistances();
    this.arcMark!.position.copy(pts[pts.length - 1]).setY(pts[pts.length - 1].y + 0.06);
    this.arcMark!.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.06);
  }
  private updateGrenades(dt: number) {
    this.nades = this.nades.filter((n) => {
      n.t -= dt;
      n.v.y -= 9.8 * dt;
      const next = n.m.position.clone().addScaledVector(n.v, dt);
      // bounce off walls
      const before = next.clone(); this.collide(next, 0.12);
      if (before.distanceToSquared(next) > 1e-6) { n.v.x *= -0.4; n.v.z *= -0.4; this.click(0, 380, 0.05); }
      const floor = surfaceAt(this.decks, heightAt(next.x, next.z), next.x, next.z, next.y + 0.3) + 0.06;
      if (next.y < floor) { next.y = floor; if (n.v.y < -1.5) this.click(0, 300, 0.06); n.v.y = Math.abs(n.v.y) * 0.35; n.v.x *= 0.6; n.v.z *= 0.6; }
      n.m.position.copy(next); n.m.rotation.x += dt * 8; n.m.rotation.z += dt * 5;
      if (n.t > 0) return true;
      this.scene.remove(n.m);
      this.explode(n.m.position.clone());
      return false;
    });
  }
  /** Frag explosion: blast damage with falloff (walls block it), flash, fire, smoke, debris and a boom. */
  private explode(at: THREE.Vector3) {
    const R = 8;
    for (const e of this.ents) {
      if (!e.alive) continue;
      const c = e.group.position.clone(); c.y += 1;
      const d = c.distanceTo(at);
      if (d > R * (e.kind === 'boss' ? 1.6 : 1)) continue;
      this.camRay.set(at, c.clone().sub(at).normalize()); this.camRay.far = d - 0.5;
      if (this.camRay.intersectObjects(this.solids, false).length) continue;
      const dmg = (e.kind === 'boss' ? 70 : 110) * (1 - d / (R * (e.kind === 'boss' ? 1.6 : 1)));
      this.hurt(e, Math.max(10, dmg));
    }
    const pd = this.player.group.position.distanceTo(at);
    if (pd < R) this.damagePlayer(70 * (1 - pd / R), 'Caught in your own grenade', at);
    this.blast(at);
    this.dust(at, 2.2);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(this.bitGeo, i % 3 ? this.fxMats.spark : this.fxMats.dust);
      m.position.copy(at); m.scale.setScalar(1.5 + Math.random() * 2);
      this.scene.add(m);
      this.bits.push({ mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 18, 4 + Math.random() * 10, (Math.random() - 0.5) * 18), t: 0.8, life: 0.8 });
    }
    // boom: sharp crack + deep thump + rumble, quieter with distance
    this.burst(0.5, 1400, 0.7, 0.9, at); this.thud(1.4, at);
    setTimeout(() => this.burst(1.6, 160, 0.6, 0.6, at), 60);
    if (pd < 30) { this.recoil = Math.max(this.recoil, 0.18 * (1 - pd / 30)); this.pitch -= 0.04 * (1 - pd / 30); }
  }

  useMedkit() {
    if (this.phase !== 'play' || this.medkits <= 0 || this.hp >= 100) return;
    this.medkits--; this.hp = Math.min(100, this.hp + 50);
    this.say('Healed +50', 1.6); this.pickupSound('heal');
  }
  /** Aim down sights: tighter view and spread. */
/** Separate SNIPER button: 1st tap takes out the sniper and scopes in, next taps fire (bolt-action pace). */
  sniperShot() {
    if (this.phase !== 'play' || this.swimming) return;
    const k = this.weapons.findIndex((w) => w.kind === 'sniper');
    if (k < 0) return;
    if (this.slot !== k) { if (this.reloadT > 0) return; this.slot = k; this.fireT = 0.25; this.aiming = true; this.click(0, 800, 0.1); this.say('Sniper · tap again to fire', 1.4); return; }
    if (!this.aiming) { this.aiming = true; this.click(0, 1200, 0.06); return; }
    this.shoot();
  }
  /** Separate BLADE button: takes out the OJ Katana and swings it in one tap. */
  private gunSlot = 0;
  bladeStrike() {
    if (this.phase !== 'play' || this.swimming) return;
    const k = this.weapons.findIndex((w) => w.kind === 'melee');
    if (k < 0) return;
    // Second tap while holding the blade: back to the gun you had before.
    if (this.slot === k) { const g = this.weapons[this.gunSlot]?.owned ? this.gunSlot : 0; this.slot = g; this.fireT = 0.3; this.slashT = 0; this.click(0, 800, 0.1); this.say(this.weapons[g].name + ' ready', 1.2); return; }
    this.gunSlot = this.slot; this.slot = k; this.aiming = false; this.reloadT = 0; this.fireT = 0;
    this.slash();
  }
  toggleAim() { if (this.phase === 'play') { this.aiming = !this.aiming; this.click(0, 1200, 0.06); } }
  /** Bot nameplates show within 45 m and only with a clear line of sight. */
  private updateTags() {
    const cam = this.camera.position;
    for (const e of this.ents) {
      const tag = e.group.children.find((c) => c.userData.nameplate);
      if (!tag) continue;
      const d = e.group.position.distanceTo(cam);
      let show = e.alive && d < 45;
      if (show && (this.tagCheck = (this.tagCheck + 1) % 4) === 0) {
        const head = e.group.position.clone(); head.y += 2;
        this.camRay.set(cam, head.clone().sub(cam).normalize()); this.camRay.far = d;
        e.group.userData.occluded = this.camRay.intersectObjects(this.solids, false).length > 0;
      }
      if (e.group.userData.occluded) show = false;
      tag.visible = show;
    }
  }
  private tagCheck = 0;
  readonly soldierReady: Promise<void>;
  private quality: GraphicsQuality = 'auto';
  private autoResolution = 1;
  private landT = 0;
  private dropStuckT = 0;
  private unstickT = 0;
  private unstickX = 0;
  private unstickZ = 0;
  private camOff = new THREE.Vector3();
  private camOffOn = false;
  /** opponents in this match (admin bots; minimum 5) */
  opponents = 12;
  private psSmooth = 0;
  private lastClip = '';
  private settleT = 0;
  private belowTarget = 0;
  private fps = 60;
  private fpsN = 0;
  private fpsT = 0;
  /** Graphics quality: resolution and shadows (the rest is shared). */
  setQuality(q: GraphicsQuality) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low' && (q !== 'auto' || !this.lowPower);
    const shadowSize = q === 'high' || q === 'ultra' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    this.resize();
    try { localStorage.setItem('hod-quality-v2', q); } catch { /* storage unavailable */ }
  }
  /** Arm offsets (radians, bone-local XYZ) that put a Mixamo soldier's hands on a shouldered rifle. */
  armPose = { r: [0, 0.3, -1.25], rf: [0, 0, -0.8], l: [0, -0.5, 1.3], lf: [0, 0, 0.6] };
  private mixBones = new WeakMap<Rig, Record<string, THREE.Object3D | undefined>>();
  /** Procedural run cycle and rifle-hold arms layered over the soldier's idle clip. */
  private mixamoPose(rig: Rig, speed: number, dt: number) {
    let b = this.mixBones.get(rig);
    if (!b) {
      const find = (k: string) => [...rig.meshes.values()].find((o) => o.name.startsWith('mixamorig' + k + '_'));
      b = { lu: find('LeftUpLeg'), ru: find('RightUpLeg'), ll: find('LeftLeg'), rl: find('RightLeg'), la: find('LeftArm'), ra: find('RightArm'), lf: find('LeftForeArm'), rf: find('RightForeArm'), sp: find('Spine1') };
      this.mixBones.set(rig, b);
    }
    const amp = Math.min(1, speed / 6), ph = (rig.root.userData.ph = ((rig.root.userData.ph as number) ?? 0) + dt * (4 + speed * 1.2));
    const s = Math.sin(ph);
    if (b.lu) b.lu.rotation.x += -s * 0.75 * amp;
    if (b.ru) b.ru.rotation.x += s * 0.75 * amp;
    if (b.ll) b.ll.rotation.x += Math.max(0, s) * 1.1 * amp;
    if (b.rl) b.rl.rotation.x += Math.max(0, -s) * 1.1 * amp;
    if (b.sp) b.sp.rotation.x += 0.12 * amp;
    const P = this.armPose, add = (o: THREE.Object3D | undefined, v: number[]) => { if (o) { o.rotation.x += v[0]; o.rotation.y += v[1]; o.rotation.z += v[2]; } };
    add(b.ra, P.r); add(b.rf, P.rf); add(b.la, P.l); add(b.lf, P.lf);
  }
  private hurtT = 0;
  private handBones = new WeakMap<Rig, { r?: THREE.Object3D; l?: THREE.Object3D }>();
  // ---- spent shell casings
  private shells: { m: THREE.Mesh; v: THREE.Vector3; t: number; rest: boolean }[] = [];
  private shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.045, 6).rotateZ(Math.PI / 2);
  private shellMat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 });
  /** Eject a brass casing to the right of the gun; it tumbles, bounces and clinks. */
  private ejectShell(from: THREE.Vector3) {
    const m = new THREE.Mesh(this.shellGeo, this.shellMat);
    m.position.copy(from);
    const right = new THREE.Vector3(Math.cos(this.yaw + Math.PI), 0, -Math.sin(this.yaw + Math.PI));
    const v = right.multiplyScalar(-(1.6 + Math.random())).add(new THREE.Vector3(0, 2.2 + Math.random(), 0));
    m.castShadow = true; this.scene.add(m);
    this.shells.push({ m, v, t: 3, rest: false });
    if (this.shells.length > 40) this.scene.remove(this.shells.shift()!.m);
  }
  private updateShells(dt: number) {
    this.shells = this.shells.filter((s) => {
      s.t -= dt;
      if (!s.rest) {
        s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
        s.m.rotation.x += dt * 18; s.m.rotation.y += dt * 11;
        const floor = surfaceAt(this.decks, heightAt(s.m.position.x, s.m.position.z), s.m.position.x, s.m.position.z, s.m.position.y + 0.3) + 0.01;
        if (s.m.position.y <= floor) {
          s.m.position.y = floor;
          if (Math.abs(s.v.y) > 1.2) { s.v.y *= -0.35; s.v.x *= 0.5; s.v.z *= 0.5; this.burst(0.03, 5200 + Math.random() * 1500, 9, 0.05, s.m.position); }
          else { s.rest = true; s.m.rotation.set(0, Math.random() * 6, 0); }
        }
      }
      if (s.t <= 0) { this.scene.remove(s.m); return false; }
      return true;
    });
  }

  // ---- OJASSS loot box dropped by fallen soldiers
  private spawnDeathBox(at: THREE.Vector3) {
    const holder = new THREE.Group();
    holder.position.copy(at);
    holder.userData.still = true;
    const y = surfaceAt(this.decks, heightAt(at.x, at.z), at.x, at.z, at.y + 0.5);
    holder.position.y = y;
    const add = (box: THREE.Object3D) => {
      holder.add(box);
      const b = new THREE.Box3().setFromObject(box), s = b.getSize(new THREE.Vector3());
      const glow = new THREE.Mesh(new THREE.RingGeometry(Math.max(s.x, s.z) * 0.6, Math.max(s.x, s.z) * 0.8, 32), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; holder.add(glow);
    };
    add(makeLootBox());
    holder.rotation.y = Math.random() * Math.PI;
    this.scene.add(holder);
    this.crates.push({ mesh: holder, taken: false, gives: 'deathbox', y });
  }
  private icons: Record<string, string> = {};
  private flagTime = { value: 0 };
  private fadedNow = new Set<THREE.Mesh>();
  /** Swap blocking building meshes to a see-through copy of their material; restore the rest. */
  private fadeBuildings(want: Set<THREE.Mesh>) {
    for (const m of this.fadedNow) if (!want.has(m)) { m.material = m.userData.orig as THREE.Material; }
    for (const m of want) {
      if (!m.userData.orig) {
        m.userData.orig = m.material;
        const f = (m.material as THREE.Material).clone(); f.transparent = true; f.opacity = 0.22; f.depthWrite = false;
        m.userData.fade = f;
      }
      m.material = m.userData.fade as THREE.Material;
    }
    this.fadedNow = want;
  }
  /** Light aim assist (mobile-friendly): a shot that just misses a visible soldier or the Titan
   *  bends onto its body if it passed within ~2 degrees (1.2 degrees while aiming). */
  private aimAssist(ray: THREE.Ray, maxDist: number): THREE.Intersection | undefined {
    // Auto-target: lock on to the enemy nearest the crosshair. The cone is an angle up close and a
    // fixed miss radius (metres) far away, so long shots still connect. Range depends on the weapon.
    const k = this.w.kind;
    const range = k === 'sniper' ? 420 : k === 'shotgun' ? 60 : k === 'smg' ? 160 : 260;
    const limit = THREE.MathUtils.degToRad(this.aiming ? 4 : 6.5);
    const radius = this.aiming ? 2.2 : 3.2;
    let best: { e: Ent; at: THREE.Vector3; a: number } | undefined;
    for (const e of this.ents) {
      if (!e.alive) continue;
      const s = e.group.scale.y, at = e.group.position.clone(); at.y += 1.0 * s;
      const to = at.clone().sub(ray.origin), d = to.length();
      if (d > range || d > maxDist + 12) continue;
      const a = to.angleTo(ray.direction) - (e.kind === 'boss' ? Math.atan2(1.2 * s, d) : 0);
      const allow = Math.max(limit, Math.atan2(radius * Math.max(1, s), d));
      if (a < allow && (!best || a < best.a)) best = { e, at, a };
    }
    if (!best) return undefined;
    const dir = best.at.clone().sub(ray.origin), d = dir.length(); dir.normalize();
    this.camRay.set(ray.origin, dir); this.camRay.far = d - 0.5;
    if (this.camRay.intersectObjects(this.solids, false).length) return undefined; // no shots through walls
    const body = best.e.group.children.find((c) => c.userData.hitbox && !c.userData.head);
    return body ? { distance: d, point: best.at, object: body } as THREE.Intersection : undefined;
  }
  /** OJASSS and Janasena flags on poles: around the coast, at the villages and on the summit. */
  private addFlags() {
    const time = this.flagTime;
    const mk = (map: THREE.Texture) => {
      const m = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.85 });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = time;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nfloat k = uv.x; transformed.z += sin(uv.x * 7.0 - uTime * 5.0 + position.y * 1.5) * 0.22 * k; transformed.y -= k * k * 0.12;');
      };
      return m;
    };
    const ojasssCanvas = document.createElement('canvas'); ojasssCanvas.width = 512; ojasssCanvas.height = 340;
    const oc = ojasssCanvas.getContext('2d')!;
    oc.fillStyle = '#18181b'; oc.fillRect(0, 0, 512, 340); oc.fillStyle = '#e8732e'; oc.fillRect(0, 0, 512, 26); oc.fillRect(0, 314, 512, 26);
    const ojTex = new THREE.CanvasTexture(ojasssCanvas); ojTex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image(); img.onload = () => { oc.drawImage(img, 146, 40, 220, 220); oc.fillStyle = '#fcd34d'; oc.font = 'bold 40px sans-serif'; oc.textAlign = 'center'; oc.fillText('OJASSS', 256, 300); ojTex.needsUpdate = true; };
    img.src = '/game/ojasss-patch.webp';
    const jsTex = tex('flag-janasena');
    const mats = [mk(ojTex), mk(jsTex)];
    const geo = new THREE.PlaneGeometry(2.6, 1.7, 16, 8).translate(1.3, 0, 0);
    const pole = new THREE.CylinderGeometry(0.05, 0.07, 7, 8), poleMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.35 });
    const plant = (x: number, z: number, i: number) => {
      const y = heightAt(x, z);
      if (y < 0.6) return;
      const p = new THREE.Mesh(pole, poleMat); p.position.set(x, y + 3.5, z); p.castShadow = true;
      const f = new THREE.Mesh(geo, mats[i % 2]); f.position.set(x, y + 6.0, z); f.rotation.y = -0.6; f.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), poleMat); cap.position.set(x, y + 7.05, z);
      for (const o of [p, f, cap]) (o as THREE.Mesh).raycast = () => {};
      for (const o of [p, f, cap]) { o.userData.farR = 170; this.farItems.push(o); }
      this.scene.add(p, f, cap);
    };
    // coast ring
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (let r = 175; r > 100; r -= 3) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (heightAt(x, z) > 2.2) { plant(x, z, i); break; } }
    }
    // villages and the summit arena
    [[92, 110], [-110, 52], [90, -80], [-95, -86], [0, 138], [130, 18], [-125, 3], [10, -112], [60, 63], [-55, 73]].forEach(([x, z], i) => plant(x, z, i + 1));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; plant(Math.cos(a) * 26, Math.sin(a) * 26, i); }
  }
  private mapImg = '';
  private hurtFrom: { x: number; z: number; t: number }[] = [];
  private hurtFlash = 0;
  private heldNade: THREE.Group | null = null;
  /** Overhand throw: arm cocked back above the shoulder while aiming, snapping forward on release. */
  // ---------------- OJ Katana (melee)
  private katana: THREE.Group | null = null;
  private slashT = 0;
  private slashStyle = 0;
  private slashHit = true;
  private static readonly SLASH = 0.46;
  private slash() {
    this.lastHead = false; this.fireT = 0.5; this.slashT = HillOfDoom.SLASH; this.slashStyle = (this.slashStyle + 1) % 3; this.slashHit = false;
    this.click(0, 1900, 0.09); this.click(0.07, 900, 0.07);
  }
  /** Sword handling: ready stance, then one of three moves per swing (diagonal cut, wide sweep, spinning cut). */
  private katanaPose(rig: Rig) {
    const on = this.w.kind === 'melee' && this.phase === 'play' && !this.swimming && !this.nadeAim && this.throwT <= 0;
    const root = rig.root; root.userData.baseY ??= root.rotation.y;
    root.rotation.y = root.userData.baseY as number;
    if (!on) { if (this.katana) this.katana.visible = false; this.slashT = 0; return; }
    if (!this.katana) { this.katana = makeKatana(); this.scene.add(this.katana); }
    const arm = boneOf(rig, 'RightArm'), fore = boneOf(rig, 'RightForeArm'), hand = boneOf(rig, 'RightHand'), spine = boneOf(rig, 'Spine1') ?? boneOf(rig, 'Spine');
    const larm = boneOf(rig, 'LeftArm');
    const p = this.slashT > 0 ? 1 - this.slashT / HillOfDoom.SLASH : -1;      // 0..1 through the swing
    if (p >= 0 && arm && fore) {
      const wind = Math.sin(Math.min(1, p / 0.3) * Math.PI / 2) * (p < 0.3 ? 1 : Math.max(0, 1 - (p - 0.3) / 0.25));
      const cut = p < 0.3 ? 0 : Math.sin(Math.min(1, (p - 0.3) / 0.45) * Math.PI);
      if (this.slashStyle === 0) {            // diagonal cut: high right to low left
        arm.rotation.x += -1.1 * wind + 1.5 * cut; arm.rotation.z += -0.5 * wind + 0.9 * cut; fore.rotation.z += 0.5 * cut;
        if (spine) spine.rotation.y += 0.35 * wind - 0.75 * cut;
      } else if (this.slashStyle === 1) {     // wide horizontal sweep
        arm.rotation.y += -1.0 * wind + 1.9 * cut; arm.rotation.x += 0.35 * cut; fore.rotation.z += -0.4 * wind + 0.6 * cut;
        if (spine) spine.rotation.y += -0.5 * wind + 0.95 * cut;
        if (larm) larm.rotation.y += -0.6 * cut;
      } else {                                 // spinning cut: full turn with the blade out
        root.rotation.y = (root.userData.baseY as number) + p * Math.PI * 2;
        arm.rotation.z += -0.9 * Math.sin(p * Math.PI); arm.rotation.y += 0.8 * Math.sin(p * Math.PI);
      }
    }
    // the sword follows the right hand
    const k = this.katana;
    if (hand) {
      hand.updateWorldMatrix(true, false);
      hand.getWorldPosition(k.position); hand.getWorldQuaternion(k.quaternion);
      k.quaternion.multiply(KATANA_GRIP);
      k.scale.setScalar(1.35);
      const st = k.userData.steel as THREE.MeshStandardMaterial;
      st.emissive.setHex(this.slashT > 0 ? 0x9fd8ff : 0x2b3038); st.emissiveIntensity = this.slashT > 0 ? 0.9 : 0.55;
      k.visible = true;
    }
    // the cut lands mid-swing on everyone in reach in front of the player
    if (p >= 0.42 && !this.slashHit) {
      this.slashHit = true;
      const me = this.player.group.position, fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      let hits = 0;
      for (const e of this.ents) {
        if (!e.alive) continue;
        const dx = e.group.position.x - me.x, dz = e.group.position.z - me.z, d = Math.hypot(dx, dz);
        const reach = e.kind === 'boss' ? 6.5 : 3;
        if (d > reach || Math.abs(e.group.position.y - me.y) > (e.kind === 'boss' ? 12 : 2.5)) continue;
        if (this.slashStyle !== 2 && d > 0.6 && (dx * fx + dz * fz) / d < 0.25) continue;   // the spin hits all round
        this.hurt(e, this.w.dmg); hits++;
        const at = e.group.position.clone(); at.y += 1.2; this.spark(at, 0xff5a5a);
      }
      if (hits) { this.hitMark = 1; this.hitMarkT = 0.2; this.click(0, 260, 0.14); }
    }
  }
  private throwPose(rig: Rig) {
    const arm = boneOf(rig, 'RightArm'), fore = boneOf(rig, 'RightForeArm'), hand = boneOf(rig, 'RightHand');
    if (!arm || !fore) return;
    const cock = this.nadeAim ? 1 : 0, release = this.throwT > 0 ? this.throwT / 0.55 : 0;
    if (cock) { arm.rotation.z += -2.5; arm.rotation.x += -0.4; fore.rotation.z += -1.4; }
    else if (release) { const k = Math.sin(release * Math.PI); arm.rotation.z += -1.6 * k; arm.rotation.x += 0.7 * k; fore.rotation.z += -0.3 * k; }
    // the grenade sits in the raised hand
    if (!this.heldNade) { this.heldNade = makeGrenade(); this.heldNade.scale.setScalar(1 / Math.max(0.001, this.player.group.scale.x)); }
    if (cock && hand) { if (this.heldNade.parent !== this.scene) this.scene.add(this.heldNade); hand.updateWorldMatrix(true, false); hand.getWorldPosition(this.heldNade.position); this.heldNade.visible = true; }
    else this.heldNade.visible = false;
  }
  // ---------------- cinematic explosion
  private fx: ((dt: number) => boolean)[] = [];
  private updateFx(dt: number) { this.fx = this.fx.filter((f) => f(dt)); }
  private fireMat = new THREE.SpriteMaterial({ map: puffTex(true), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  private plumeMat = new THREE.SpriteMaterial({ map: puffTex(false), color: 0x6b645c, depthWrite: false, transparent: true });
  /** Fireball, shockwave, rising smoke plume, flying embers, scorch mark and a brief orange light. */
  private blast(at: THREE.Vector3) {
    const ground = at.clone();
    // light
    const light = new THREE.PointLight(0xffa040, 90, 34, 1.5); light.position.copy(at).setY(at.y + 1.2); this.scene.add(light);
    // fireball: layered additive puffs that swell, rise and cool from white-yellow to deep red
    const fire: { s: THREE.Sprite; v: THREE.Vector3; size: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(this.fireMat.clone());
      sp.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2));
      sp.material.rotation = Math.random() * 6.28;
      this.scene.add(sp);
      fire.push({ s: sp, v: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5), size: 1.6 + Math.random() * 1.8 });
    }
    // shockwave ring on the ground
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(ground).setY(ground.y + 0.15); this.scene.add(ring);
    // scorch mark that stays for a while
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), new THREE.MeshBasicMaterial({ map: puffTex(false), color: 0x0b0806, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.copy(ground).setY(ground.y + 0.04); this.scene.add(scorch);
    // smoke plume
    const plume: { s: THREE.Sprite; v: THREE.Vector3; size: number; delay: number }[] = [];
    for (let i = 0; i < 22; i++) {
      const sp = new THREE.Sprite(this.plumeMat.clone());
      sp.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2));
      sp.material.rotation = Math.random() * 6.28; sp.material.opacity = 0; sp.scale.setScalar(0.1);
      this.scene.add(sp);
      plume.push({ s: sp, v: new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.6 + Math.random() * 2.4, (Math.random() - 0.5) * 1.6), size: 2.4 + Math.random() * 2.6, delay: Math.random() * 0.25 });
    }
    // embers with gravity
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(this.bitGeo, this.fxMats.spark);
      m.position.copy(at).setY(at.y + 0.5); m.scale.setScalar(0.6 + Math.random());
      this.scene.add(m);
      this.bits.push({ mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 22, 5 + Math.random() * 12, (Math.random() - 0.5) * 22), t: 1 + Math.random() * 0.6, life: 1.6 });
    }
    let t = 0;
    const cool = new THREE.Color();
    this.fx.push((dt) => {
      t += dt;
      light.intensity = Math.max(0, 90 * (1 - t / 0.35));
      for (const f of fire) {
        const k = Math.min(1, t / 0.75);
        f.v.multiplyScalar(1 - dt * 2.2); f.s.position.addScaledVector(f.v, dt);
        f.s.scale.setScalar(f.size * (0.6 + Math.sqrt(k) * 1.6));
        cool.setRGB(1, 1 - k * 0.55, 0.75 - k * 0.7);
        f.s.material.color.copy(cool);
        f.s.material.opacity = Math.max(0, 1 - Math.pow(k, 1.4));
      }
      ring.scale.setScalar(1 + t * 34); (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - t * 2.4);
      for (const p of plume) {
        const lt = t - p.delay; if (lt < 0) continue;
        p.v.y *= 1 - dt * 0.35; p.v.x *= 1 - dt * 0.6; p.v.z *= 1 - dt * 0.6;
        p.s.position.addScaledVector(p.v, dt);
        p.s.scale.setScalar(p.size * (0.4 + lt * 0.9));
        p.s.material.opacity = Math.min(0.55, lt * 2.5) * Math.max(0, 1 - lt / 4.2);
        p.s.material.rotation += dt * 0.2;
      }
      if (t > 12) (scorch.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - (t - 12) / 6);
      if (t < 18) return true;
      this.scene.remove(light, ring, scorch); for (const f of fire) this.scene.remove(f.s); for (const p of plume) this.scene.remove(p.s);
      return false;
    });
    // remove fire and plume sprites earlier (they are invisible after ~4.5 s)
    this.fx.push(((tt = 0) => (dt: number) => { tt += dt; if (tt < 4.6) return true; for (const f of fire) this.scene.remove(f.s); for (const p of plume) this.scene.remove(p.s); return false; })());
  }
  /** The Titan's feet straddle about 3 m: stand it on the lowest ground under them, so no foot floats. */
  private titanGround(g: THREE.Group): number {
    const r = 0.45 * TITAN_SCALE, x = g.position.x, z = g.position.z, c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y);
    let lo = heightAt(x, z);
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r * 0.6], [0, -r * 0.6]]) lo = Math.min(lo, heightAt(x + dx * c + dz * sn, z - dx * sn + dz * c));
    return lo + 0.05;
  }
  private backpack: THREE.Group | null = null;
  private packBone: THREE.Object3D | null = null;
  /** Keep the backpack strapped to the upper back: follow the spine bone's position and lean. */
  private fitBackpack() {
    const b = this.packBone, pack = this.backpack;
    if (!b || !pack) return;
    pack.visible = this.player.group.visible && this.phase !== 'intro';
    b.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    b.matrixWorld.decompose(pos, q, sc);
    // the bone's own axes: +Y up the spine, +Z out of the chest
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
    pack.position.copy(pos).addScaledVector(fwd, -0.2).addScaledVector(up, -0.02);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, fwd).normalize(), up, fwd);
    pack.quaternion.setFromRotationMatrix(m);
  }
  private seaU = { value: WATER };
  private floodCamT = 0;
  /** Below the sea surface the view turns murky blue-green with short visibility. */
  private underwater() {
    const under = this.camera.position.y < this.sea - 0.1;
    if (under) { this.fog.color.setRGB(0.04, 0.22, 0.28); this.fog.near = 1; this.fog.far = 38; }
    else { this.fog.far = 620; }
  }
  // ---------------- smoothness (works with the Auto quality resolution control)
  private frameNo = 0;
  private farT = 0;
  private farItems: THREE.Object3D[] = [];
  /** Redraw shadows every other frame around the player; every 0.25 s hide buildings, flags,
   *  tree blocks and pickups beyond fog range. */
  private smooth(dt: number) {
    const sm = this.renderer.shadowMap;
    if (sm.enabled) {
      sm.autoUpdate = false;
      if (this.frameNo % 2 === 0) {
        const p = this.player.group.position;
        this.sun.position.set(p.x + 120, p.y + 160, p.z + 60); this.sun.target.position.copy(p); this.sun.target.updateMatrixWorld();
        sm.needsUpdate = true;
      }
    }
    this.farT -= dt;
    if (this.farT > 0) return;
    this.farT = 0.25;
    const c = this.camera.position;
    for (const o of this.farItems) o.visible = ((o.userData.c as THREE.Vector3 | undefined) ?? o.position).distanceToSquared(c) < (o.userData.farR as number) ** 2;
    for (const k of this.crates) if (!k.taken) k.mesh.visible = k.mesh.position.distanceToSquared(c) < 75 * 75;
  }
  /** Compile every shader once everything has loaded, so the first explosion or Titan view never hitches. */
  private async prewarm() {
    // Show every far-away object for a moment so its shader is compiled and its textures are sent to
    // the graphics chip now, behind the loading screen, instead of mid-parachute as it comes into view.
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => { if (!o.visible && (o as THREE.Mesh).isMesh) { hidden.push(o); o.visible = true; } });
    try {
      this.scene.traverse((o) => {
        const mats = ([] as THREE.Material[]).concat((o as THREE.Mesh).material ?? []);
        for (const m of mats) for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture && (v as THREE.Texture).image) this.renderer.initTexture(v as THREE.Texture);
      });
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch { /* compile lazily */ }
    for (const o of hidden) o.visible = false;
    this.warm = true;
  }
  /** true once every shader is compiled and every texture uploaded */
  warm = false;
  private bossStep = 0;
  private boxes: Box[] = [];
  private doors: Door[] = [];
  private solids: THREE.Object3D[] = [];
  private decks: Deck[] = [];
  private rooms: Room[] = [];
  private crates: { mesh: THREE.Object3D; taken: boolean; gives: Pickup; y: number }[] = [];
  /** OJASSS T-shirts collected this match */
  private tshirts = 0;
  private tracers: { mesh: THREE.Mesh; from: THREE.Vector3; dir: THREE.Vector3; len: number; d: number }[] = [];
  private bits: { mesh: THREE.Mesh; v: THREE.Vector3; t: number; life: number }[] = [];
  private holes: THREE.Mesh[] = [];
  private bulletGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.4, 4).translate(0, -0.7, 0);
  private bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff8a6a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private bitGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  private fxMats = {
    blood: new THREE.MeshBasicMaterial({ color: 0x6e0b0b, transparent: true }),
    dust: new THREE.MeshBasicMaterial({ color: 0x8a7d68, transparent: true }),
    spark: new THREE.MeshBasicMaterial({ color: 0xffc96b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  private holeGeo = new THREE.CircleGeometry(0.06, 10);
  private holeMat = new THREE.MeshBasicMaterial({ color: 0x141210, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  private sparks: { mesh: THREE.Mesh; t: number }[] = [];
  private rings: { mesh: THREE.Mesh; r: number; hit: boolean }[] = [];
  private rocks: { mark: THREE.Mesh; rock: THREE.Mesh; t: number }[] = [];
  private ray = new THREE.Raycaster();
  private phase: Phase = 'intro';
  private introT = 0;
  private cameraTarget = new THREE.Vector3(0, 40, 0);
  private landingBlend = 1;
  private running = false;
  private readonly lowPower = window.matchMedia('(pointer: coarse)').matches;
  private hp = 100;
  // ---------------- battle coins (virtual)
  private eco: MatchEconomy = { starting_coins: 16, coins_per_hit: 2, start_hp: 100, match_minutes: 20, coin_elimination: true, win_rule: 'objective' };
  private coins = 16;
  private hitsLanded = 0;
  private livePlayers: number | null = null;
  private coinFx: { delta: number; id: number } | null = null;
  private coinFxT = 0;
  private coinFxId = 0;
  private selfTag: THREE.Sprite | null = null;
  private playerName = 'YOU';
  private playerAvatar: HTMLImageElement | null = null;
  /** Real OJASSS name + profile photo for the overhead tag (sent by the host page). */
  setPlayer(name: string, avatar: string | null) {
    this.playerName = name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 18) || 'YOU';
    if (!avatar) { this.playerAvatar = null; this.drawSelfTag(); return; }
    const img = new Image(); img.onload = () => { this.playerAvatar = img; this.drawSelfTag(); }; img.src = avatar;
    this.drawSelfTag();
  }
  /** Apply the match settings snapshot (before start). Health stays on a 100 scale; start_hp scales damage. */
  setEconomy(e: Partial<MatchEconomy>) {
    this.eco = { ...this.eco, ...e };
    this.coins = Math.max(1, Math.round(this.eco.starting_coins));
    this.total = this.timeLeft = Math.max(180, Math.min(3600, Math.round(this.eco.match_minutes * 60)));
  }
  setLivePlayers(n: number) { this.livePlayers = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; }
  private bumpCoins(delta: number) {
    if (!delta) return;
    this.coins = Math.max(0, this.coins + delta);
    this.coinFx = { delta, id: ++this.coinFxId }; this.coinFxT = 0.9;
    this.drawSelfTag();
    if (this.coins <= 0 && this.eco.coin_elimination) this.finish(false, 'Out of battle coins');
  }
  /** A bot's valid hit moves coins from the player to that bot (never more than the player holds). */
  private coinHit(e: Ent) {
    const n = Math.min(this.coins, Math.max(1, this.eco.coins_per_hit));
    if (n <= 0 || this.phase !== 'play') return;
    e.coins = (e.coins ?? 0) + n;
    const tag = e.group.children.find((c) => c.userData.nameplate) as THREE.Sprite | undefined;
    if (tag) { tag.userData.coins = e.coins; drawNameplate(tag, Math.max(0, e.hp) / e.maxHp); }
    this.bumpCoins(-n);
  }
  /** Overhead tag on the player: name, health bar and battle coins. */
  private drawSelfTag() {
    if (!this.selfTag) {
      const cv = document.createElement('canvas'); cv.width = 384; cv.height = 80;
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      this.selfTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
      this.selfTag.scale.set(1.5, 0.3125, 1); this.selfTag.raycast = () => {}; this.selfTag.renderOrder = 5;
      this.scene.add(this.selfTag);
    }
    const t = this.selfTag.material.map as THREE.CanvasTexture, c = (t.image as HTMLCanvasElement).getContext('2d')!;
    // slim pill: avatar ring · name over a thin HP line · coins
    c.clearRect(0, 0, 384, 80);
    const W = 376, H = 56, x0 = 4, y0 = 12;
    c.fillStyle = 'rgba(12,8,22,.72)'; c.beginPath(); c.roundRect(x0, y0, W, H, 28); c.fill();
    const ring = c.createLinearGradient(x0, 0, x0 + W, 0); ring.addColorStop(0, '#FF7A18'); ring.addColorStop(0.5, '#FF3366'); ring.addColorStop(1, '#A855F7');
    c.strokeStyle = ring; c.lineWidth = 2.5; c.beginPath(); c.roundRect(x0 + 1.25, y0 + 1.25, W - 2.5, H - 2.5, 27); c.stroke();
    const ax = x0 + 28, ay = y0 + 28, ar = 22;
    c.fillStyle = ring; c.beginPath(); c.arc(ax, ay, ar + 3, 0, 6.3); c.fill();
    c.save(); c.beginPath(); c.arc(ax, ay, ar, 0, 6.3); c.clip();
    if (this.playerAvatar) c.drawImage(this.playerAvatar, ax - ar, ay - ar, ar * 2, ar * 2);
    else { c.fillStyle = '#2a1840'; c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2); c.fillStyle = '#fff'; c.font = '800 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(this.playerName.slice(0, 1).toUpperCase(), ax, ay + 1); }
    c.restore();
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    let name = this.playerName; c.font = '800 21px sans-serif';
    while (c.measureText(name).width > 190 && name.length > 3) name = name.slice(0, -2);
    if (name !== this.playerName) name += '…';
    c.fillStyle = '#fff'; c.fillText(name, ax + 32, y0 + 26);
    const hp = Math.max(0, this.hp) / 100, bx = ax + 32, bw = 190;
    c.fillStyle = '#ffffff26'; c.beginPath(); c.roundRect(bx, y0 + 35, bw, 7, 4); c.fill();
    c.fillStyle = hp > 0.5 ? '#22c55e' : hp > 0.25 ? '#eab308' : '#ef4444'; c.beginPath(); c.roundRect(bx, y0 + 35, Math.max(4, bw * hp), 7, 4); c.fill();
    const cx = x0 + W - 66;
    c.fillStyle = '#facc15'; c.beginPath(); c.arc(cx, ay, 10, 0, 6.3); c.fill();
    c.strokeStyle = '#a16207'; c.lineWidth = 2; c.beginPath(); c.arc(cx, ay, 6, 0, 6.3); c.stroke();
    c.font = '800 21px sans-serif'; c.fillStyle = '#fde68a'; c.fillText(String(this.coins), cx + 15, ay + 8);
    t.needsUpdate = true;
  }
  private lastTagHp = -1;
  private updateSelfTag() {
    if (this.phase !== 'play') { if (this.selfTag) this.selfTag.visible = false; return; }
    if (Math.ceil(this.hp) !== this.lastTagHp) { this.lastTagHp = Math.ceil(this.hp); this.drawSelfTag(); }
    const p = this.player.group.position;
    this.selfTag!.position.set(p.x, p.y + 2.35, p.z); this.selfTag!.visible = true;
  }
  private weapons: Weapon[] = [
    { name: 'AK-47', mag: 30, ammo: 30, reserve: 90, rate: 0.1, dmg: 24, pellets: 1, spread: 0.004, owned: true, kind: 'rifle' },
    { name: 'Pistol', mag: 12, ammo: 12, reserve: 48, rate: 0.28, dmg: 18, pellets: 1, spread: 0.002, owned: true, kind: 'pistol' },
    { name: 'Shotgun', mag: 6, ammo: 6, reserve: 24, rate: 0.85, dmg: 11, pellets: 8, spread: 0.05, owned: false, kind: 'shotgun' },
    { name: 'SMG', mag: 32, ammo: 32, reserve: 96, rate: 0.065, dmg: 14, pellets: 1, spread: 0.009, owned: false, kind: 'smg' },
    { name: 'Sniper', mag: 5, ammo: 5, reserve: 20, rate: 1.2, dmg: 95, pellets: 1, spread: 0.0004, owned: true, kind: 'sniper' },
    { name: 'Katana', mag: 0, ammo: 0, reserve: 0, rate: 0.5, dmg: 85, pellets: 0, spread: 0, owned: true, kind: 'melee' },
  ];
  private slot = 0;
  private reloadT = 0;
  private fireT = 0;
  private kills = 0;
  private timeLeft: number;
  private total: number;
  private bossAtk = 6;
  private bossPhase = 1;
  private message = '';
  private msgT = 0;
  private hudT = 0;
  private ended = false;
  private firing = false;
  private action = '';

  constructor(
    private el: HTMLElement,
    matchSeconds: number,
    private onHud: (h: Hud) => void,
    private onEnd: (r: MatchResult) => void,
    private onElimination: () => void,
  ) {
    this.total = this.timeLeft = matchSeconds;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    queueMicrotask(() => { try { const q = localStorage.getItem('hod-quality-v2'); if (q === 'low' || q === 'medium' || q === 'high' || q === 'ultra') this.setQuality(q); } catch { /* storage unavailable */ } });
    el.appendChild(this.renderer.domElement);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.fog = this.fog;

    // Natural daytime sky (Three.js atmospheric Sky shader); darkens once the Titan is awake.
    this.sky.scale.setScalar(4500);
    this.sky.material.uniforms.mieDirectionalG.value = 0.8;
    this.scene.add(this.sky, this.hemi, this.stormDome);
    if (!this.lowPower) {
      const envScene = new THREE.Scene(), pm = new THREE.PMREMGenerator(this.renderer);
      this.applyMood(0);
      envScene.add(this.sky);
      this.scene.environment = pm.fromScene(envScene, 0, 1, 2000).texture;
      this.scene.environmentIntensity = 0.45;
      this.scene.add(this.sky);
      pm.dispose();
    } else {
      // Phones skip the sky environment map, which left the ground and hills dark: add a soft sky fill instead.
      this.scene.add(new THREE.AmbientLight(0xe6efff, 1.5));
    }
    const sun = this.sun;
    this.addClouds();
    this.applyMood(0);
    sun.position.set(120, 160, 60); sun.castShadow = true;
    sun.shadow.camera.left = -90; sun.shadow.camera.right = 90; sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
    sun.shadow.camera.far = 500; sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun, sun.target);
    { const m = THREE.DefaultLoadingManager, prev = m.onLoad; m.onLoad = () => { prev?.(); void this.prewarm(); }; }

    this.buildWorld();
    this.player = humanoid(0xe8306b, 0xe0b48c, 0x2b2f38); // OJASSS pink shirt
    // OJASSS patch: large on the back (what the third-person camera sees), small on the chest.
    const patchMat = new THREE.MeshStandardMaterial({ map: tex('ojasss-patch'), roughness: 0.85, transparent: true, alphaTest: 0.4 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), patchMat);
    back.position.set(0, 1.4, -0.206); back.rotation.y = Math.PI;
    const chest = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), patchMat);
    chest.position.set(-0.17, 1.6, 0.206);
    this.player.group.add(back, chest);
    const ak = makeAK();
    this.gun = ak.gun; this.muzzle = ak.muzzle; this.magMesh = ak.mag;
    this.flashMesh.visible = false;
    this.muzzle.add(this.flash, this.flashMesh);
    this.player.group.add(this.flash, this.flashMesh); // follows the visible gun's muzzle (see holdGun)
    this.player.parts.armR.add(this.gun);
    this.player.parts.armL.rotation.z = -0.5;
    back.removeFromParent(); chest.removeFromParent(); // the soldier image already wears the OJASSS patch
    const retirePlayer = retirePreview(this.player.group, [this.flashMesh]);
    // Realistic soldier (CC BY 4.0, see public/game/models/soldier-real/LICENSE.txt).
    const soldier = attachRig(this.player.group, MILITARY_SOLDIER, 1.8);
    this.soldierReady = soldier.then(rig => {
      retirePlayer();
      const rifle = makeAK().gun;
      this.player.group.add(rifle);
      this.guns.set('AK-47', rifle);
      this.holdGun(this.player.group, rig, rifle, this.pitch * 0.7);
      try { this.wearOjShirt(); } catch (err) { console.error('[game] shirt', err); } // OJASSS colours from the first frame
    });
    void soldier.then(async (rig) => {
      await addMixamoClips(rig, SOLDIER_CLIPS);
      play(rig, 'Idle');
      const pack = makeBackpack();
      const spine = [...rig.meshes.values()].find((o) => /mixamorig:?Spine2(_\d+)?$/.test(o.name));
      if (spine) { this.backpack = pack; this.packBone = spine; this.scene.add(pack); } else this.player.group.add(pack);
      this.player.group.add(shoulderPatch());
      for (const [weapon, file, len] of [['AK-47', 'ph/bolt_action_rifle_7_62/bolt_action_rifle_7_62.gltf', 1.05], ['Pistol', 'ph/service_pistol/service_pistol.gltf', 0.24], ['Shotgun', 'shotgun', 1.0], ['SMG', 'smg', 0.7], ['Sniper', 'ph/bolt_action_rifle_7_62/bolt_action_rifle_7_62.gltf', 1.2]] as const) {
        void rig;
        const gun = await makeGun(file, len, GUN_FLIP[file] ?? false);
        this.guns.get(weapon)?.removeFromParent();
        this.player.group.add(gun); this.guns.set(weapon, gun);
        this.icons = { ...this.icons, [weapon]: gunIcon(gun) };
      }
    }).catch(() => { /* keep the fallback character when the rig cannot load */ });
    this.chute = makeChute();
    this.chute.position.y = 4.6;
    this.player.group.add(this.chute);
    addHitbox(this.player.group, 1.8, 0.32);
    this.player.group.position.set(105, 115, 105);
    this.scene.add(this.player.group);

    this.bossEyes = new THREE.MeshStandardMaterial({ color: 0xff8a1e, emissive: 0xff6a00, emissiveIntensity: 2.5 });
    this.spawnBoss();
    this.opponents = Math.max(5, Math.min(20, Number(new URLSearchParams(location.search).get('bots')) || 12));
    this.spawnBots(this.opponents);
    this.mapImg = renderMap(this.boxes);
    for (const o of this.scene.children) if (o.userData.building) { o.userData.farR = 230; this.farItems.push(o); }
    if (this.lowPower) {
      // Phones have no sky reflection light, which left walls and roofs dark: lift building colours once.
      const seen = new Set<THREE.Material>();
      for (const o of this.scene.children) if (o.userData.building) o.traverse((m) => { const mats = (m as THREE.Mesh).material; for (const mat of Array.isArray(mats) ? mats : mats ? [mats] : []) { const c = (mat as THREE.MeshStandardMaterial).color; if (c && !seen.has(mat)) { seen.add(mat); c.multiplyScalar(1.55); } } });
    }
    this.addFlags();

    this.resize();
    const c = this.renderer.domElement;
    c.style.touchAction = 'none';
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.releaseInputs);
    document.addEventListener('visibilitychange', this.onVis);
    document.addEventListener('mousemove', this.mouseMove);
    c.addEventListener('mousedown', this.mouseDown);
    window.addEventListener('mouseup', this.mouseUp);
    // Camera look on phones uses raw touch events: Android WebViews cancel pointer events mid-drag
    // when a second thumb is on the joystick, which froze the camera.
    c.addEventListener('touchstart', this.lookStart, { passive: false });
    window.addEventListener('touchmove', this.lookMove, { passive: false });
    window.addEventListener('touchend', this.lookEnd, true);
    window.addEventListener('touchcancel', this.lookEnd, true);
    if (this.lowPower) this.renderer.shadowMap.enabled = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  // ------------------------------------------------------------------ world

  private buildWorld() {
    const terrainSegments = this.lowPower ? 112 : 200;
    const geo = new THREE.PlaneGeometry(460, 460, terrainSegments, terrainSegments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z);
      pos.setY(i, y);
      if (y < 1) c.set(0xb9a67a); else if (y < 22) c.set(0x3f5f34); else if (y < 48) c.set(0x5b5347); else c.set(0x3a3536);
      c.offsetHSL(0, 0, (Math.sin(x * 0.7) * Math.cos(z * 0.9)) * 0.025);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // Ground: blend sand (shore), grass (land) and rock (steep slopes and the peak) in world space.
    const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const tGrass = tex('pbr/sparse_grass_Diffuse'), tSand = tex('pbr/coast_sand_01_Diffuse'), tRock = tex('pbr/rocky_terrain_02_Diffuse');
    groundMat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: tGrass }; sh.uniforms.tSand = { value: tSand }; sh.uniforms.tRock = { value: tRock };
      sh.uniforms.uSea = this.seaU; sh.uniforms.uTime = this.flagTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass;\nuniform sampler2D tSand;\nuniform sampler2D tRock;\nuniform float uSea;\nuniform float uTime;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
        .replace('#include <map_fragment>', `
          vec2 uvW = vWPos.xz / 5.0;
          vec3 grass = mix(texture2D(tGrass, uvW).rgb, texture2D(tGrass, uvW * 0.23).rgb, 0.35);
          vec3 sand = texture2D(tSand, uvW * 1.4).rgb;
          vec3 rock = mix(texture2D(tRock, uvW * 0.55).rgb, texture2D(tRock, uvW * 0.13).rgb, 0.3);
          float slope = 1.0 - clamp(vWNorm.y, 0.0, 1.0);
          float wSand = 1.0 - smoothstep(0.6, 2.6, vWPos.y);
          float wRock = max(smoothstep(0.22, 0.42, slope), smoothstep(26.0, 44.0, vWPos.y));
          vec3 ground = mix(mix(grass, sand, wSand), rock, wRock);
          ground *= mix(0.45, 1.0, smoothstep(uSea - 1.2, uSea + 0.5, vWPos.y)); // wet, darker sand at the waterline (no bright edge)
          diffuseColor.rgb *= ground * ${this.lowPower ? '1.7' : '1.2'}; // lift the dark ground textures (more on phones, which have no sky reflection light)`);
    };
    const ground = new THREE.Mesh(geo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const waves = tex('pbr/waternormals', 60, 60);
    const waterSegments = this.lowPower ? 56 : 128;
    const water = this.water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, waterSegments, waterSegments), new THREE.MeshStandardMaterial({ color: 0x1b5f74, roughness: 0.2, metalness: 0.1, normalMap: waves, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 0.85, side: THREE.DoubleSide }));
    this.waves = waves;
    water.rotation.x = -Math.PI / 2; water.position.y = WATER;
    this.scene.add(water);

    // Buildings: ten kinds of walk-in structures in village clusters, fishing houses on the shore,
    // and ancient ruins around the summit arena (see buildings.ts).
    {
      const parts: THREE.BufferGeometry[] = [];
      let seed = 1.37;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      const place = (x: number, z: number, size: number) => {
        const y = heightAt(x, z);
        if (y < WATER + 0.3) return;
        const b = boulderGeo(size, rnd() * 20);
        b.rotateY(rnd() * Math.PI * 2);
        b.translate(x, y + size * 0.12, z); // sits partly buried in the ground
        parts.push(b);
      };
      for (let i = 0; i < 260 && parts.length < 70; i++) {
        const a = rnd() * Math.PI * 2, d = 26 + rnd() * 150, x = Math.cos(a) * d, z = Math.sin(a) * d;
        const sl = Math.abs(heightAt(x + 1, z) - heightAt(x - 1, z)) + Math.abs(heightAt(x, z + 1) - heightAt(x, z - 1));
        if (sl > 0.9 || heightAt(x, z) > 28) place(x, z, 0.5 + rnd() * 1.8);
      }
      for (let i = 0; i < 18; i++) { const a = rnd() * Math.PI * 2, d = 12 + rnd() * 16; place(Math.cos(a) * d, Math.sin(a) * d, 0.35 + rnd() * 0.9); }
      if (parts.length) {
        const rocks = new THREE.Mesh(mergeGeometries(parts), rockMat());
        rocks.castShadow = true; rocks.receiveShadow = true;
        this.scene.add(rocks);
        for (const p of parts) p.dispose();
      }
    }
    const keepOut = buildVillages({
      scene: this.scene, boxes: this.boxes, decks: this.decks, rooms: this.rooms, doors: this.doors, solids: this.solids,
      tex: (name) => tex(name), heightAt,
      crate: (x, y, z, loot) => {
        const m = makePickup(loot);
        m.position.set(x, y, z);
        this.scene.add(m);
        this.crates.push({ mesh: m, taken: false, gives: loot, y });
      },
    });

    // Trees: real 3D tree models (CC0, Quaternius), instanced per kind: palms on the shore,
    // broadleaf trees across the hills, pines and a few dead trees toward the summit.
    const kinds: Record<string, { h: number; max: number; list: THREE.Matrix4[] }> = {
      palm: { h: 9, max: 40, list: [] }, tree: { h: 9, max: 34, list: [] }, tree2: { h: 8, max: 34, list: [] },
      pine: { h: 11, max: 140, list: [] }, deadtree: { h: 8, max: 12, list: [] },
    };
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 3000; i++) {
      const x = (Math.random() - 0.5) * 320, z = (Math.random() - 0.5) * 320, y = heightAt(x, z);
      if (y < 0.8 || y > 38 || keepOut.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) continue;
      let k: string;
      if (y < 3) { if (Math.random() > 0.35) continue; k = 'palm'; }
      else if (y > 24) k = Math.random() < 0.85 ? 'pine' : 'deadtree';
      else k = ['tree', 'tree2', 'pine', 'tree', 'tree2', 'deadtree', 'pine', 'tree'][Math.floor(Math.random() * 8)];
      const kind = kinds[k];
      if (kind.list.length >= kind.max) continue;
      const s = 0.75 + Math.random() * 0.6;
      q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
      kind.list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.2, z), q, new THREE.Vector3(s, s, s)));
    }
    for (const [name, k] of Object.entries(kinds)) void instanceModel(this.scene, name, k.h, k.list, false).then((made) => { for (const m of made) { m.userData.farR = 190; this.farItems.push(m); } });
  }

  /** Push a circle out of every wall and closed door (no walking through walls). */
  private collide(p: THREE.Vector3, r: number) {
    for (const b of this.boxes) {
      if (b.door?.open) continue;
      if (b.maxY !== undefined && (p.y >= b.maxY - (b.step ? 0.8 : 0.35) || p.y + 1.7 <= (b.minY ?? -Infinity))) continue;
      const nx = Math.max(b.minX, Math.min(p.x, b.maxX)), nz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r; }
      else {
        const l = p.x - b.minX, rr = b.maxX - p.x, f = p.z - b.minZ, k = b.maxZ - p.z, mn = Math.min(l, rr, f, k);
        if (mn === l) p.x = b.minX - r; else if (mn === rr) p.x = b.maxX + r; else if (mn === f) p.z = b.minZ - r; else p.z = b.maxZ + r;
      }
    }
  }

  private spawnBoss() {
    const h = humanoid(0x3b3436, 0x2a2527, 0x2f2a2c, tex('titan-skin'));
    h.group.scale.setScalar(TITAN_SCALE);
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const e1 = new THREE.Mesh(eyeGeo, this.bossEyes); e1.position.set(-0.09, 2.08, 0.21);
    const e2 = new THREE.Mesh(eyeGeo, this.bossEyes); e2.position.set(0.09, 2.08, 0.21);
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.42), this.bossEyes); crack.position.set(0.1, 1.35, 0);
    h.group.add(e1, e2, crack);
    const retireTitan = retirePreview(h.group);
    // Realistic Volcanic Titan: the Mixamo Mutant (detailed skin, recorded animations), darkened to
    // scorched hide with a faint lava glow.
    void attachFBXRig(h.group, 'mutant/mutant.fbx', 2.1, (m) => {
      m.color.setRGB(0.82, 0.6, 0.52, THREE.SRGBColorSpace);
      m.emissive = new THREE.Color(0xff3a0a); m.emissiveMap = m.map; m.emissiveIntensity = 0.12;
      m.roughness = 0.68;
    }).then(async (rig) => {
      retireTitan();
      await addMixamoClips(rig, TITAN_CLIPS);
      play(rig, 'Idle');
      const head = [...rig.meshes.values()].find((o) => /mixamorig:?Head$/.test(o.name));
      if (head) {
        const ember = new THREE.PointLight(0xff5a1a, 26, 38, 1.4); ember.position.set(0, 0, 40); head.add(ember);
      }
    }).catch(() => { /* Keep the 3D fallback if this device cannot load the Titan rig. */ });
    h.group.position.set(0, heightAt(0, 0), 0);
    h.group.position.y = this.titanGround(h.group);
    this.scene.add(h.group);
    this.boss = { kind: 'boss', group: h.group, parts: h.parts, hp: 900, maxHp: 900, alive: true, walk: 0, target: new THREE.Vector3(), shootAt: 0, deadT: 0, flinch: 0 };
    addHitbox(h.group, 2.1, 0.42);
    h.group.traverse((o) => { o.userData.ent = this.boss; });
    this.ents.push(this.boss);
  }

  private spawnBots(n: number) {
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0;
      for (let k = 0; k < 20; k++) { const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 95; x = Math.cos(a) * r; z = Math.sin(a) * r; if (heightAt(x, z) > 1) break; }
      const h = humanoid(0x8a2f2a, 0xcfa07a, 0x33302c);
      h.group.position.set(x, heightAt(x, z), z);
      h.parts.armR.add(makeAK().gun); h.parts.armR.rotation.x = -Math.PI / 2;
      const retireBot = retirePreview(h.group);
      const kit = OUTFITS[i % OUTFITS.length];
      void attachRig(h.group, MILITARY_SOLDIER, 1.8, [], (m) => {
        // Recolour the camo uniform per outfit (the texture keeps its detail under the tint).
        const tint = new THREE.Color(kit[0]).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(1.6);
        if (m.name === 'Topmat' || m.name === 'Bottommat') m.color.copy(tint);
        else if (m.name === 'Hatmat') m.color.set(kit[1]).lerp(new THREE.Color(0xffffff), 0.3);
      })
        .then(async (rig) => {
          retireBot();
          await addMixamoClips(rig, SOLDIER_CLIPS);
          play(rig, 'Idle');
          const gun = await makeGun('ph/bolt_action_rifle_7_62/bolt_action_rifle_7_62.gltf', 1.05, GUN_FLIP['ph/bolt_action_rifle_7_62/bolt_action_rifle_7_62.gltf'] ?? false);
          h.group.add(gun); h.group.userData.gun = gun;
        }).catch(() => { /* Keep the 3D fallback if this device cannot load the soldier rig. */ });
      this.scene.add(h.group);
      addHitbox(h.group, 1.8, 0.32);
      h.group.add(shoulderPatch());
      const tag = makeNameplate(`BOT ${i + 1}`, 0); h.group.add(tag);
      const e: Ent = { kind: 'bot', group: h.group, parts: h.parts, hp: 60, maxHp: 60, alive: true, walk: 0, target: new THREE.Vector3(x, 0, z), shootAt: 2 + Math.random() * 2, deadT: 0, flinch: 0 };
      h.group.traverse((o) => { o.userData.ent = e; });
      this.ents.push(e);
    }
  }

  // ------------------------------------------------------------------ input

  private resize = () => {
    const w = this.el.clientWidth || 800, h = this.el.clientHeight || 500;
    const dpr = window.devicePixelRatio || 1;
    const maxDimension = this.renderer.capabilities.maxTextureSize;
    const fullHd = Math.min(1920 / Math.max(w, h), 1080 / Math.min(w, h));
    const renderScale = { low: Math.min(dpr, 0.8), medium: Math.min(dpr, 1.25, fullHd),
      auto: Math.max(Math.min(dpr, 1), fullHd) * this.autoResolution, high: fullHd, ultra: fullHd * 2 }[this.quality];
    this.renderer.setDrawingBufferSize(w, h, Math.min(renderScale, maxDimension / Math.max(w, h)));
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  };
  private keyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (this.phase === 'intro') this.phase = 'drop';
    if (e.code === 'KeyR') this.reload();
    if (e.code === 'KeyE') this.pressAction();
    if (e.code === 'KeyH') this.useMedkit();
    if (e.code === 'KeyQ') this.toggleAim();
    if (e.code === 'KeyG') this.throwGrenade();
    if (e.code === 'KeyC') this.pressCrouch();
    if (e.code === 'Digit1') this.switchWeapon(0);
    if (e.code === 'Digit2') this.switchWeapon(1);
    if (e.code === 'Digit3') this.switchWeapon(2);
    if (e.code === 'Digit4') this.switchWeapon(3);
    if (e.code === 'Digit5') this.switchWeapon(4);
    if (e.code === 'Digit6') this.switchWeapon(5);
    if (e.code === 'Space') e.preventDefault();
  };
  private keyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private mouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement && !this.freeLook) return;
    this.look(e.movementX * 0.48, e.movementY * 0.5);
  };
  private mouseDown = (e: MouseEvent) => {
    if ((e as unknown as PointerEvent).pointerType === 'touch') return;
    if (this.phase === 'intro') { this.phase = 'drop'; return; }
    if (document.pointerLockElement !== this.renderer.domElement && !this.freeLook) {
      try {
        const p = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => { this.freeLook = true; });
      } catch { this.freeLook = true; }
      return;
    }
    this.firing = true;
  };
  private mouseUp = () => { this.firing = false; };
  // Touch: drag anywhere on the scene to look around.
  private touchMove = (e: PointerEvent) => {
    if (e.pointerId !== this.touchId) return;
    this.look(e.clientX - this.touchLast.x, e.clientY - this.touchLast.y);
    this.touchLast.set(e.clientX, e.clientY);
  };
  private touchEnd = (e: PointerEvent) => { if (e.pointerId === this.touchId) this.touchId = null; };
  private lookStart = (e: TouchEvent) => {
    e.preventDefault();
    if (this.phase === 'intro') { this.phase = 'drop'; return; }
    const t = e.changedTouches[0]; if (!t) return;
    this.touchId = t.identifier; this.touchLast.set(t.clientX, t.clientY); // newest finger on the scene takes over
  };
  private lookMove = (e: TouchEvent) => {
    if (this.touchId === null) return;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i]; if (t.identifier !== this.touchId) continue;
      e.preventDefault();
      const dx = t.clientX - this.touchLast.x, dy = t.clientY - this.touchLast.y;
      if (Math.abs(dx) < 200 && Math.abs(dy) < 200) this.look(dx, dy); // ignore jumps from a re-used id
      this.touchLast.set(t.clientX, t.clientY);
      return;
    }
  };
  private lookEnd = (e: TouchEvent) => {
    if (this.touchId === null) return;
    let still = false; for (let i = 0; i < e.touches.length; i++) if (e.touches[i].identifier === this.touchId) still = true;
    if (!still) this.touchId = null;
  };

  // On-screen controls
  setMove(x: number, y: number) { this.stick.set(x, y); }
  /** Drop every held input — called when the window loses focus so movement/firing never stays stuck. */
  private releaseInputs = () => { this.keys.clear(); this.firing = false; this.stick.set(0, 0); this.touchId = null; this.sprintOn = false; this.clock.getDelta(); };
  private onVis = () => { this.releaseInputs(); };
  setSprint(on: boolean) { this.sprintOn = on; }
  setFiring(on: boolean) {
    if (on && !this.firing) {
      this.firing = true;
      this.shoot();
      return;
    }
    this.firing = on;
  }
  pressReload() { this.reload(); }
  pressJump() { if (this.swimming) return; if (this.grounded && this.phase === 'play') { this.vy = 7.5; this.grounded = false; this.crouching = false; } }
  pressCrouch() { if (this.phase === 'play' && !this.swimming) this.crouching = !this.crouching; }
  look(dx: number, dy: number) { const k = this.aiming ? (this.w.kind === 'sniper' ? 0.18 : 0.6) : 1; /* finer aim when zoomed */ this.yaw -= dx * 0.005 * k; this.pitch = Math.max(-0.6, Math.min(0.9, this.pitch + dy * 0.004 * k)); }
  skipIntro() { if (this.phase === 'intro') this.phase = 'drop'; }
  /** Locked gun: unlock it mid-match for 10 battle coins. */
  private unlockPending = new Set<number>();
  /** Tap on a locked gun: inside OJASSS pay ₹10 from the wallet; otherwise (or if that fails) use battle coins. */
  requestUnlock(i: number) {
    const w = this.weapons[i]; if (!w || w.owned || this.phase !== 'play' || this.unlockPending.has(i)) return;
    if (window.parent !== window) { this.unlockPending.add(i); this.say('Paying ₹10 from wallet…', 2); window.parent.postMessage({ type: 'ojasss-monster-unlock', weapon: i }, '*'); return; }
    this.unlockWeapon(i);
  }
  unlockResult(i: number, ok: boolean, msg: string) {
    this.unlockPending.delete(i);
    if (ok) { this.unlockWeapon(i, true); return; }
    if (this.coins >= 10) { this.say((msg || 'Wallet payment failed') + ' · used 10 battle coins', 2); this.unlockWeapon(i); }
    else { this.say(msg || 'Not enough coins', 2); this.click(0, 300, 0.08); }
  }
  unlockWeapon(i: number, paid = false) {
    const w = this.weapons[i]; if (!w || w.owned || this.phase !== 'play') return;
    if (!paid && this.coins < 10) { this.say('Need 10 coins to unlock ' + w.name, 1.6); this.click(0, 300, 0.08); return; }
    if (!paid) { this.coins -= 10; this.coinFx = { delta: -10, id: ++this.coinFxId }; this.coinFxT = 0.9; this.drawSelfTag(); }
    w.owned = true; w.ammo = w.mag; w.reserve = Math.max(w.reserve, w.mag * 2);
    this.slot = i; this.fireT = 0.35; this.pickupSound('gun'); this.say(w.name + (paid ? ' unlocked · ₹10 paid from wallet' : ' unlocked'), 1.8);
  }
  switchWeapon(i: number) {
    const next = i < 0 ? (this.slot + 1) % this.weapons.length : i;
    let k = next;
    for (let n = 0; n < this.weapons.length && !this.weapons[k].owned; n++) k = (k + 1) % this.weapons.length;
    if (k === this.slot || this.reloadT > 0) return;
    this.slot = k; this.fireT = 0.35; this.click(0, 800, 0.1);
    this.say(this.weapons[k].name, 1.2);
  }
  pressAction() {
    if (this.phase !== 'play') return;
    const p = this.player.group.position;
    for (const c of this.crates) {
      if (c.taken || c.mesh.position.distanceTo(p) > 2.6) continue;
      this.collect(c);
      return;
    }
    for (const d of this.doors) {
      if (Math.hypot(d.x - p.x, d.z - p.z) > 3) continue;
      d.open = !d.open;
      this.creak();
      return;
    }
  }

  /** Pick up a medkit, ammo or a gun (walk over it, or press E / LOOT). */
  private collect(c: { mesh: THREE.Object3D; taken: boolean; gives: Pickup }) {
    c.taken = true; c.mesh.visible = false;
    const gun: Record<string, number> = { shotgun: 2, smg: 3, sniper: 4 };
    if (c.gives === 'deathbox') {
      this.grenades = Math.min(4, this.grenades + 1);
      this.medkits = Math.min(5, this.medkits + 1);
      this.hp = Math.min(100, this.hp + 25);
      for (const w of this.weapons) if (w.owned) w.reserve += w.mag * 2;
      const k = [2, 3, 4][Math.floor(Math.random() * 3)], w = this.weapons[k], fresh = !w.owned;
      w.owned = true; w.reserve += w.mag;
      this.say(`OJASSS box: medkit, ammo${fresh ? ', ' + w.name : ''} +25 HP`, 2.6); this.pickupSound('gun'); setTimeout(() => this.pickupSound('heal'), 250);
      return;
    }
    if (c.gives === 'tshirt') {
      this.tshirts++;
      const first = this.wearOjShirt();
      this.say(first ? 'You are wearing the OJ T-shirt' : `OJ T-shirt collected (${this.tshirts})`, 2.2); this.pickupSound('heal');
      return;
    }
    if (c.gives === 'medkit') {
      this.medkits = Math.min(5, this.medkits + 1);
      this.say(`Medkit picked up (${this.medkits}) — tap the medkit to heal`, 2.2); this.pickupSound('ammo');
    } else if (c.gives === 'supplies') {
      for (const w of this.weapons) if (w.owned) w.reserve += w.mag * 2;
      this.hp = Math.min(100, this.hp + 15);
      this.say('Ammo crate: ammo for every gun', 2.2); this.pickupSound('ammo');
    } else {
      const k = gun[c.gives], w = this.weapons[k];
      const fresh = !w.owned; w.owned = true; w.reserve += w.mag * 2;
      this.say(fresh ? `Picked up: ${w.name}` : `${w.name} ammo`, 2.2); this.pickupSound('gun');
      if (fresh && this.reloadT <= 0) { this.slot = k; this.fireT = 0.4; }
    }
  }

  private ojShirtOn = false;
  /** Swap the soldier's camo top for a black OJASSS T-shirt with the red OJ print on the chest. */
  private wearOjShirt(): boolean {
    if (this.ojShirtOn) return false;
    let chest: THREE.Object3D | null = null;
    this.player.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = ([] as THREE.Material[]).concat(mesh.material);
        const next = mats.map((m) => {
          if (m.name !== 'Topmat') return m;
          const shirt = (m as THREE.MeshStandardMaterial).clone();
          shirt.color.setHex(0xff2f6d); // OJASSS hot pink fabric, the folds of the original texture still show
          shirt.emissive = new THREE.Color(0x5b1a8f); shirt.emissiveIntensity = 0.28; // purple glow like the logo flame
          shirt.roughness = 0.95;
          return shirt;
        });
        mesh.material = Array.isArray(mesh.material) ? next : next[0];
      }
      if ((o as THREE.Bone).isBone && o.name === 'mixamorigSpine2_04') chest = o;
    });
    void chest; // the backpack itself carries the OJASSS patch
    this.ojShirtOn = true;
    return true;
  }

  /** Pickup sounds: rising chime for health, metal clack and rack for guns, rattle for ammo. */
  private pickupSound(kind: 'heal' | 'gun' | 'ammo') {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime;
    const tone = (at: number, f: number, len: number, vol: number, type: OscillatorType = 'sine') => {
      const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t + at);
      const g = a.createGain(); g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      o.connect(g).connect(this.master(a)); o.start(t + at); o.stop(t + at + len + 0.02);
    };
    if (kind === 'heal') { tone(0, 523, 0.25, 0.18); tone(0.08, 659, 0.25, 0.18); tone(0.16, 784, 0.3, 0.18); tone(0.24, 1046, 0.45, 0.14); tone(0.24, 2093, 0.4, 0.03, 'triangle'); }
    else if (kind === 'gun') { this.burst(0.06, 3200, 3, 0.35); tone(0, 180, 0.08, 0.2, 'square'); setTimeout(() => { this.burst(0.05, 2400, 4, 0.3); this.click(0, 1400, 0.1); }, 180); setTimeout(() => this.burst(0.07, 1800, 3, 0.3), 320); }
    else { for (let i = 0; i < 4; i++) setTimeout(() => this.burst(0.04, 2600 + Math.random() * 1200, 5, 0.2), i * 55); tone(0.25, 880, 0.12, 0.08); }
  }

  private say(text: string, seconds = 3) { this.message = text; this.msgT = seconds; }
  private get w(): Weapon { return this.weapons[this.slot]; }

  private reload() {
    const w = this.w;
    if (this.reloadT > 0 || w.ammo === w.mag || w.reserve <= 0 || this.phase !== 'play' || this.swimming) return;
    this.reloadT = 1.6;
    this.click(0, 900); this.click(0.55, 600); this.click(1.25, 1200);
  }

  // ------------------------------------------------------------------ audio (synthesised, event-driven, positional)

  private masterGain: GainNode | null = null;
  /** All game audio passes through this node: overall level ~45% plus a gentle limiter. */
  private master(a: AudioContext): AudioNode {
    if (!this.masterGain) {
      const comp = a.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      this.masterGain = a.createGain(); this.masterGain.gain.value = 0.45;
      this.masterGain.connect(comp).connect(a.destination);
    }
    return this.masterGain;
  }
  private ctx(): AudioContext | null {
    try {
      if (!this.audio) this.audio = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.audio.state === 'suspended') void this.audio.resume();
      return this.audio;
    } catch { return null; }
  }
  /** Output node with distance attenuation and left/right panning for a world position. */
  private out(a: AudioContext, at?: THREE.Vector3): { node: AudioNode; gain: number } {
    if (!at) return { node: this.master(a), gain: 1 };
    const p = this.player.group.position;
    const dx = at.x - p.x, dz = at.z - p.z, dist = Math.hypot(dx, dz);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pan = a.createStereoPanner();
    pan.pan.value = dist < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * right.x + dz * right.z) / dist));
    pan.connect(this.master(a));
    return { node: pan, gain: 1 / (1 + dist / 18) };
  }
  private noise(a: AudioContext, seconds: number, curve: number): AudioBufferSourceNode {
    const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * seconds)), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, curve);
    const s = a.createBufferSource(); s.buffer = buf; return s;
  }
  private gunshot(kind: Weapon['kind'], volume: number, at?: THREE.Vector3) {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime, o = this.out(a, at), v = volume * o.gain;
    const cfg = kind === 'shotgun' ? { len: 0.42, lp: 2600, thump: 105 } : kind === 'pistol' ? { len: 0.16, lp: 7200, thump: 230 } : kind === 'smg' ? { len: 0.17, lp: 6400, thump: 210 } : kind === 'sniper' ? { len: 0.7, lp: 3600, thump: 80 } : { len: 0.25, lp: 5200, thump: 170 };
    const indoor = this.indoors(at ?? this.player.group.position);
    const n = this.noise(a, cfg.len + (indoor ? 0.2 : 0), 2.2);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(indoor ? cfg.lp * 0.55 : cfg.lp, t); lp.frequency.exponentialRampToValueAtTime(420, t + cfg.len);
    const g = a.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + cfg.len + (indoor ? 0.2 : 0));
    n.connect(lp).connect(g).connect(o.node); n.start(t);
    const osc = a.createOscillator(); osc.type = 'triangle'; osc.frequency.setValueAtTime(cfg.thump, t); osc.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    const og = a.createGain(); og.gain.setValueAtTime(v * 0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(og).connect(o.node); osc.start(t); osc.stop(t + 0.16);
  }
  private click(delay: number, freq: number, vol = 0.12) {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(freq, t);
    const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(this.master(a)); o.start(t); o.stop(t + 0.06);
  }
  private burst(seconds: number, freq: number, q: number, vol: number, at?: THREE.Vector3) {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime, o = this.out(a, at);
    const n = this.noise(a, seconds, 1.6);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = a.createGain(); g.gain.setValueAtTime(vol * o.gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    n.connect(bp).connect(g).connect(o.node); n.start(t);
  }
  private splash(big: boolean) { this.burst(big ? 0.55 : 0.28, big ? 900 : 1400, 0.7, big ? 0.5 : 0.16); }
  private footstep() { this.burst(0.07, 320, 1.2, this.crouching ? 0.04 : 0.1); }
  private impact(at: THREE.Vector3) { this.burst(0.08, 2600, 2, 0.25, at); }
  private creak() {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(90, t + 0.35);
    const g = a.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(this.master(a)); o.start(t); o.stop(t + 0.42);
  }
  /** A ring of dust puffs on the ground (Titan footsteps and smashes). */
  private dust(at: THREE.Vector3, size: number) {
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(this.dustMat.clone());
      const a = (i / 10) * Math.PI * 2;
      s.position.set(at.x + Math.cos(a) * size * 0.8, at.y + 0.4, at.z + Math.sin(a) * size * 0.8);
      s.scale.setScalar(size * 1.4); s.material.rotation = Math.random() * 6.28;
      this.scene.add(s);
      const v = new THREE.Vector3(Math.cos(a) * size * 1.6, 0.6 + Math.random() * 0.6, Math.sin(a) * size * 1.6);
      let t = 0;
      this.fx.push((dt) => { t += dt; v.multiplyScalar(1 - dt * 1.8); s.position.addScaledVector(v, dt); s.scale.setScalar(size * (1.4 + t * 1.6)); s.material.opacity = 0.5 * Math.max(0, 1 - t / 1.4); if (t < 1.4) return true; this.scene.remove(s); return false; });
    }
  }
  private dustMat = new THREE.SpriteMaterial({ map: puffTex(false), color: 0xa08d6c, depthWrite: false, transparent: true });

  /** Smoke rising off the Titan's shoulders. */
  private titanSmoke(dt: number) {
    if (!this.boss.alive) return;
    this.smokeT -= dt;
    if (this.smokeT > 0) return;
    this.smokeT = 0.18;
    const g = this.boss.group, side = Math.random() < 0.5 ? -1 : 1;
    const at = new THREE.Vector3(side * 0.55, 1.85, 0).multiplyScalar(TITAN_SCALE).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    const s = new THREE.Sprite(this.smokeMat);
    s.position.copy(at); s.scale.setScalar(2 + Math.random() * 1.5);
    this.scene.add(s);
    this.smoke.push({ s, t: 2.2 });
  }
  private smokeT = 0;
  private smoke: { s: THREE.Sprite; t: number }[] = [];
  private smokeMat = new THREE.SpriteMaterial({ color: 0x3a3430, transparent: true, opacity: 0.45, depthWrite: false });

  private thud(vol: number, at?: THREE.Vector3) {
    if (at && at === this.boss.group.position) this.dust(at, 1.6);
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime, out = this.out(a, at);
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const g = a.createGain(); g.gain.setValueAtTime(vol * Math.max(0.25, out.gain), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(out.node); o.start(t); o.stop(t + 0.62);
  }
  private roar() {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime, out = this.out(a, this.boss.group.position);
    const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(55, t + 1.4);
    const lfo = a.createOscillator(); lfo.frequency.value = 23; const lg = a.createGain(); lg.gain.value = 22; lfo.connect(lg).connect(o.frequency);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = a.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.6 * Math.max(0.3, out.gain), t + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    o.connect(lp).connect(g).connect(out.node); o.start(t); lfo.start(t); o.stop(t + 1.55); lfo.stop(t + 1.55);
  }
  private indoors(p: THREE.Vector3): boolean {
    return this.rooms.some((r) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ && p.y > r.minY && p.y < r.maxY);
  }

  // ------------------------------------------------------------------ combat

  /** A bullet: a thin glowing streak that actually travels (~420 m/s) from the muzzle to the hit. */
  private tracer(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const dir = to.clone().sub(from), len = dir.length();
    if (len < 0.5) return;
    dir.normalize();
    const m = new THREE.Mesh(this.bulletGeo, color === 0xffd27a ? this.bulletMat : this.enemyBulletMat);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    m.position.copy(from);
    this.scene.add(m);
    this.tracers.push({ mesh: m, from: from.clone(), dir, len, d: 0 });
  }
  /** Impact burst: blood on bodies, dust plus sparks on everything else. */
  private spark(at: THREE.Vector3, color: number) {
    const body = color === 0xff4a3a;
    const kinds: (keyof typeof this.fxMats)[] = body ? ['blood', 'blood', 'blood', 'blood', 'blood', 'blood'] : ['dust', 'dust', 'dust', 'dust', 'spark', 'spark', 'spark'];
    for (const k of kinds) {
      const m = new THREE.Mesh(this.bitGeo, this.fxMats[k]);
      m.position.copy(at);
      const sp = k === 'spark' ? 7 : 2.5;
      const v = new THREE.Vector3((Math.random() - 0.5) * sp, Math.random() * sp * 0.8 + 0.5, (Math.random() - 0.5) * sp);
      m.scale.setScalar(k === 'dust' ? 1.6 + Math.random() * 1.5 : 0.6 + Math.random() * 0.6);
      this.scene.add(m);
      const life = k === 'spark' ? 0.18 : 0.45;
      this.bits.push({ mesh: m, v, t: life, life });
    }
  }
  /** A bullet hole on walls, rocks and the ground (the oldest disappear first). */
  private hole(hit: THREE.Intersection) {
    if (!hit.face) return;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const m = new THREE.Mesh(this.holeGeo, this.holeMat);
    m.position.copy(hit.point).addScaledVector(n, 0.01);
    m.lookAt(hit.point.clone().add(n));
    this.scene.add(m); this.holes.push(m);
    if (this.holes.length > 80) this.scene.remove(this.holes.shift()!);
  }
  private hitTick(head: boolean) {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime, o = a.createOscillator(); o.type = head ? 'triangle' : 'square';
    o.frequency.setValueAtTime(head ? 1900 : 1100, t); if (head) o.frequency.setValueAtTime(2600, t + 0.05);
    const g = a.createGain(); g.gain.setValueAtTime(head ? 0.16 : 0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + (head ? 0.16 : 0.05));
    o.connect(g).connect(this.master(a)); o.start(t); o.stop(t + 0.18);
  }

  private shoot() {
    const w = this.w;
    if (this.fireT > 0 || this.reloadT > 0 || this.phase !== 'play' || this.swimming) return;
    if (w.kind === 'melee') { this.slash(); return; }
    if (w.ammo <= 0) { this.click(0, 1500); this.fireT = 0.3; this.reload(); return; }
    w.ammo--; this.fireT = w.rate; this.recoil = w.kind === 'shotgun' || w.kind === 'sniper' ? 0.22 : w.kind === 'smg' ? 0.08 : 0.12;
    this.gunshot(w.kind, w.kind === 'shotgun' ? 0.7 : 0.5);
    this.flash.intensity = 6; this.flashMesh.visible = true; this.flashT = 0.08;
    this.pitch = Math.max(-0.6, this.pitch - (w.kind === 'shotgun' || w.kind === 'sniper' ? 0.035 : 0.008)); this.yaw += (Math.random() - 0.5) * 0.006;
    const muzzle = this.flashMesh.getWorldPosition(new THREE.Vector3());
    if (w.kind !== 'shotgun' || Math.random() < 0.6) { const g = this.guns.get(w.name); if (g) this.ejectShell(g.getWorldPosition(new THREE.Vector3())); }
    const targets: THREE.Object3D[] = [...this.ents.filter((e) => e.alive).map((e) => e.group), ...this.solids];
    for (let i = 0; i < w.pellets; i++) {
      const sp = w.spread * (this.aiming ? 0.45 : 1);
      this.ray.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp * 2), this.camera);
      const hit = this.ray.intersectObjects(targets, true).find((h) => {
        if (h.object.userData.hitbox) return h.object.parent !== this.player.group;
        for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) return false;
        const m = (h.object as THREE.Mesh).material as THREE.Material | THREE.Material[];
        return Array.isArray(m) ? m.some((x) => x.visible) : m.visible;
      });
      let assisted: THREE.Intersection | undefined;
      if (!hit || !hit.object.userData.hitbox) assisted = this.aimAssist(this.ray.ray, hit?.distance ?? 450);
      const final = assisted ?? hit;
      const end = final ? final.point : this.ray.ray.at(420, new THREE.Vector3());
      this.tracer(muzzle, end, 0xffd27a);
      if (!final) continue;
      let ent: Ent | undefined;
      for (let o: THREE.Object3D | null = final.object; o && !ent; o = o.parent) ent = o.userData.ent as Ent | undefined;
      if (ent && ent.alive) {
        // Headshot: the top ~16% of the body takes far more damage.
        const head = !!final.object.userData.head; // any body hit counts; the head box does extra damage
        if (i === 0) { this.hitMark = head ? 2 : 1; this.hitMarkT = head ? 0.35 : 0.18; }
        this.spark(final.point, 0xff4a3a);
        if (i === 0) this.hitTick(head);
        if (head && i === 0 && ent.kind === 'boss') this.say('HEADSHOT — Titan staggered', 1.1);
        this.lastHead = head;
        this.hurt(ent, w.dmg * (head ? (ent.kind === 'boss' ? 2 : 2.5) : 1));
      } else { this.spark(final.point, 0xffe2a0); this.hole(final); if (i === 0) this.impact(final.point); }
    }
  }

  private killBanner: { name: string; weapon: string; dist: number; head: boolean; left: number } | null = null;
  private killBannerT = 0;
  private lastHead = false;
  private hurt(ent: Ent, dmg: number) {
    if (!ent.alive) return;
    ent.hp -= dmg; ent.flinch = 0.25; this.hitsLanded++;
    const tag = ent.group.children.find((c) => c.userData.nameplate) as THREE.Sprite | undefined;
    if (tag) drawNameplate(tag, Math.max(0, ent.hp) / ent.maxHp);
    if (ent.kind === 'boss' && !this.bossAwake) this.wakeBoss();
    if (ent.hp > 0) return;
    ent.alive = false; ent.hp = 0;
    this.kills++;
    this.onElimination();
    if (ent.kind === 'bot') {
      if (ent.coins) { const won = ent.coins; ent.coins = 0; this.bumpCoins(won); }
      if (this.eco.win_rule === 'last_standing' && !this.ents.some((x) => x.kind === 'bot' && x.alive)) queueMicrotask(() => this.finish(true, 'Last player standing'));
      const tag = ent.group.children.find((c) => c.userData.nameplate);
      const dist = Math.round(ent.group.position.distanceTo(this.player.group.position));
      this.killBanner = { name: (tag?.userData.name as string) ?? 'Opponent', weapon: this.w.name, dist, head: this.lastHead, left: this.ents.filter((x) => x.kind === 'bot' && x.alive).length };
      this.killBannerT = 3;
    }
    else { this.roar(); this.say('DOOM TITAN DEFEATED', 4); this.finish(true, 'You defeated the Doom Titan'); }
  }

  private damagePlayer(n: number, why: string, from?: THREE.Vector3) {
    if (this.phase !== 'play') return;
    if (from && n >= 3) { this.hurtFrom.push({ x: from.x, z: from.z, t: 1.6 }); if (this.hurtFrom.length > 6) this.hurtFrom.shift(); this.hurtFlash = 1; }
    this.hp = Math.max(0, this.hp - n * (100 / Math.max(10, this.eco.start_hp)));
    if (n >= 5) this.hurtT = 0.35;
    if (this.hp <= 0) this.finish(false, why);
  }

  private finish(victory: boolean, reason: string) {
    if (this.ended) return;
    this.ended = true; this.phase = 'ended';
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.selfTag) this.selfTag.visible = false;
    this.onEnd({ battleCoins: this.coins, hitsLanded: this.hitsLanded, kills: this.kills, bossDefeated: !this.boss.alive, victory, reason, survivedSeconds: Math.round(this.total - this.timeLeft) });
  }

  // ------------------------------------------------------------------ animation

  private animate(p: Parts, speed: number, dt: number, walk: number, armed: boolean): number {
    const w = walk + speed * dt * 2.2;
    const amp = Math.min(1, speed / 5) * 0.8;
    p.legL.rotation.x = Math.sin(w) * amp; p.legR.rotation.x = -Math.sin(w) * amp;
    if (!armed) { p.armL.rotation.x = -Math.sin(w) * amp; p.armR.rotation.x = Math.sin(w) * amp; }
    p.torso.position.y = 1.35 + Math.abs(Math.sin(w)) * 0.04 * amp + Math.sin(performance.now() / 600) * 0.01;
    return w;
  }

  private updatePlayer(dt: number, dropSeconds = dt) {
    const g = this.player.group, p = g.position, parts = this.player.parts;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const mv = new THREE.Vector3();
    if (this.keys.has('KeyW')) mv.add(f); if (this.keys.has('KeyS')) mv.sub(f);
    if (this.keys.has('KeyD')) mv.add(r); if (this.keys.has('KeyA')) mv.sub(r);
    mv.addScaledVector(f, -this.stick.y).addScaledVector(r, this.stick.x);
    const sprint = this.keys.has('ShiftLeft') || this.sprintOn;
    const floor = surfaceAt(this.decks, heightAt(p.x, p.z), p.x, p.z, p.y);
    const depth = WATER - floor;

    // Water volume check drives the swim state.
    const wasSwimming = this.swimming;
    this.swimming = this.phase === 'play' && depth > 1.3 && p.y < WATER + 0.3;
    if (this.swimming && !wasSwimming) { this.splash(true); this.crouching = false; this.firing = false; this.say('Swimming', 1.2); }
    if (!this.swimming && wasSwimming) { this.splash(true); this.diving = false; }
    this.diving = this.swimming && (this.keys.has('KeyC') || this.diveHeld);

    let speed = 0;
    if (mv.lengthSq() > 0.0004) {
      const analog = Math.min(1, mv.length());
      speed = this.phase === 'drop' ? 14 : this.swimming ? (sprint ? 5 : 3.2) : this.crouching ? 2.5 : sprint ? 9.5 : 5.5;
      speed *= analog;
      mv.normalize().multiplyScalar(speed * dt);
      p.x += mv.x; p.z += mv.z;
      const d = Math.hypot(p.x, p.z);
      if (d > ISLAND) { p.x *= ISLAND / d; p.z *= ISLAND / d; }
      if (this.phase === 'play') this.collide(p, 0.45);
    }
    // Anti-stuck: pushing to move but not moving for 1 s (wedged in a wall, rock or after landing) → step out to open ground.
    if (this.phase === 'play' && !this.swimming && speed > 0.5) {
      const moved = Math.hypot(p.x - this.unstickX, p.z - this.unstickZ);
      if (moved > 0.15) { this.unstickX = p.x; this.unstickZ = p.z; this.unstickT = 0; }
      else if ((this.unstickT += dt) > 1) {
        this.unstickT = 0;
        for (let i = 0; i < 16; i++) {
          const a = (i / 8) * Math.PI, rad = i < 8 ? 1.2 : 2.6, tx = p.x + Math.sin(a) * rad, tz = p.z + Math.cos(a) * rad;
          const probe = new THREE.Vector3(tx, p.y, tz); this.collide(probe, 0.45);
          if (Math.hypot(probe.x - tx, probe.z - tz) < 0.05) { p.x = tx; p.z = tz; p.y = Math.max(surfaceAt(this.decks, heightAt(tx, tz), tx, tz, p.y + 1), WATER - 1.3); this.vy = 0; this.grounded = true; break; }
        }
        this.unstickX = p.x; this.unstickZ = p.z;
      }
    } else { this.unstickT = 0; this.unstickX = p.x; this.unstickZ = p.z; }
    g.rotation.y = this.yaw + Math.PI;
    const ground = surfaceAt(this.decks, heightAt(p.x, p.z), p.x, p.z, p.y);

    if (this.phase === 'drop') {
      // over the sea the canopy holds 7 m above the water while it glides in, then descends onto the shore
      const land = heightAt(p.x, p.z) < WATER + 0.6 ? WATER + 7 : Math.max(ground, WATER - 1.1);
      const altitude = Math.max(0, p.y - land);
      // over the sea, the canopy glides toward the island so the player touches down on dry land
      if (heightAt(p.x, p.z) < WATER + 0.6) { const d = Math.hypot(p.x, p.z) || 1, k = Math.min(1, 12 * dropSeconds / d); p.x -= p.x * k; p.z -= p.z * k; }
      p.y -= Math.min(altitude + 0.001, THREE.MathUtils.lerp(1.8, 19, THREE.MathUtils.smoothstep(altitude, 0, 32)) * dropSeconds); // soft flare, never overshoots the ground
      this.chute.visible = true;
      // safety: a drop that hovers (roof/deck edge or stuck over the shore) still lands within 2.5 s of reaching the ground
      this.dropStuckT = altitude < 0.15 ? this.dropStuckT + dropSeconds : 0;
      if (this.dropStuckT > 2.5 && heightAt(p.x, p.z) < WATER + 0.6) { const d = Math.hypot(p.x, p.z) || 1; p.x -= (p.x / d) * 3; p.z -= (p.z / d) * 3; }
      if ((p.y <= land && heightAt(p.x, p.z) >= WATER + 0.6) || (this.dropStuckT > 2.5 && heightAt(p.x, p.z) >= WATER + 0.6)) { this.dropStuckT = 0; p.y = Math.max(land, surfaceAt(this.decks, heightAt(p.x, p.z), p.x, p.z, p.y + 5)); this.vy = 0; this.collide(p, 0.45); this.phase = 'play'; this.landT = 0.45; this.grounded = true; this.say('Reach the summit. Defeat the beast. Survive the doom.', 5); }
    } else if (this.swimming) {
      // Buoyancy: float at the surface, or sink toward the bed while diving.
      const target = this.diving ? Math.max(ground + 0.5, WATER - 4.5) : WATER - 1.15;
      p.y += (target - p.y) * Math.min(1, dt * 3);
      this.vy = 0; this.grounded = false;
      const under = p.y < WATER - 2;
      this.oxygen = Math.max(0, Math.min(100, this.oxygen + (under ? -5 : 22) * dt));
      if (this.oxygen <= 0) this.damagePlayer(12 * dt, 'You drowned');
      this.stride += dt * (speed > 0.2 ? (sprint ? 2.6 : 1.7) : 0);
      if (this.stride > 1) { this.stride = 0; this.splash(false); }
    } else {
      this.oxygen = Math.min(100, this.oxygen + 30 * dt);
      if (this.grounded && this.keys.has('Space')) { this.vy = 7.5; this.grounded = false; this.crouching = false; }
      this.vy -= 20 * dt; p.y += this.vy * dt;
      const stand = Math.max(ground, WATER - 1.3);
      // Small height changes (porches, stairs, deck edges) glide instead of snapping, and stepping off
      // a ledge keeps the player grounded, so the run never flickers into the jump pose near buildings.
      const gap = p.y - stand;
      if (this.grounded && this.vy <= 0 && gap > -0.8 && gap < 0.8) {
        // ordinary slopes (tiny per-frame changes) follow the ground exactly; only real steps glide
        // a slope rises at most ~1.3 m per metre walked, so a height change within that (plus a small
        // margin) is terrain and is followed exactly whatever the frame time; only bigger steps glide
        const slopeReach = Math.hypot(mv.x, mv.z) * 1.3 + 0.06;
        if (Math.abs(gap) <= slopeReach) p.y = stand;
        else p.y = gap < 0 ? p.y + Math.min(-gap, (-gap) * Math.min(1, dt * 18) + dt * 2) : Math.max(stand, p.y - dt * 9);
        if (gap < 0 && p.y > stand) p.y = stand;
        this.vy = 0;
      } else if (p.y <= stand) { if (!this.grounded && this.vy < -6) this.footstep(); p.y = stand; this.vy = 0; this.grounded = true; }
      else if (gap >= 0.8) this.grounded = false;
      if (this.grounded && speed > 0.5) {
        this.stride += dt * speed * 0.42;
        if (this.stride > 1) { this.stride = 0; if (depth > 0.2) this.splash(false); else this.footstep(); }
      }
    }

    // Pose: swim strokes, crouch, or armed walk/run.
    const swimT = performance.now() / (sprint ? 170 : 260);
    const tilt = this.swimming ? 1.25 : 0;
    g.rotation.x += (tilt - g.rotation.x) * Math.min(1, dt * 6);
    g.scale.y += ((this.crouching ? 0.68 : 1) - g.scale.y) * Math.min(1, dt * 10);
    this.gun.visible = !this.swimming;
    if (this.swimming) {
      const k = speed > 0.2 ? 1 : 0.25;
      parts.armL.rotation.x = -Math.PI / 2 + Math.sin(swimT) * 1.5 * k; parts.armR.rotation.x = -Math.PI / 2 + Math.sin(swimT + Math.PI) * 1.5 * k;
      parts.legL.rotation.x = Math.sin(swimT * 2) * 0.45; parts.legR.rotation.x = -Math.sin(swimT * 2) * 0.45;
    } else {
      this.walk = this.animate(parts, this.grounded ? speed : 0, dt, this.walk, true);
      if (!this.grounded && this.phase === 'play') { parts.legL.rotation.x = 0.5; parts.legR.rotation.x = -0.3; }
      this.recoil = Math.max(0, this.recoil - dt);
      parts.armR.rotation.x = -Math.PI / 2 - this.recoil * 2 + this.pitch * 0.6;
      this.gun.position.z = 0.08 - this.recoil * 0.5;
      const rl = this.reloadT > 0 ? Math.sin((1 - this.reloadT / 1.6) * Math.PI) : 0;
      parts.armL.rotation.x = -Math.PI / 2.4 + rl * 0.9;
      this.magMesh.position.y = -0.17 - rl * 0.18; this.magMesh.rotation.x = 0.4 + rl * 0.6;
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.intensity = 0; this.flashMesh.visible = false; } }

    // Doors swing toward their target angle.
    for (const d of this.doors) d.pivot.rotation.y += ((d.open ? -1.75 : 0) - d.pivot.rotation.y) * Math.min(1, dt * 7);
    if (this.phase === 'play') for (const d of this.doors) {
      if (!d.open && Math.hypot(d.x - this.player.group.position.x, d.z - this.player.group.position.z) < 2.1 && Math.abs((d.y ?? 0) - this.player.group.position.y) < 1.2) { d.open = true; this.creak(); }
    }
    for (const c of this.crates) {
      if (c.taken) continue;
      if (!c.mesh.userData.still) {
        c.mesh.rotation.y += dt * 0.8;
        c.mesh.position.y = c.y + 0.15 + Math.sin(performance.now() / 450 + c.y) * 0.06;
      }
      if (this.phase === 'play' && c.mesh.position.distanceTo(this.player.group.position.clone().setY(this.player.group.position.y + 0.5)) < 1.5) this.collect(c);
    }

    // Contextual action
    this.action = '';
    if (this.phase === 'play') {
      if (this.crates.some((c) => !c.taken && c.mesh.position.distanceTo(p) < 2.6)) this.action = 'LOOT';
      else { const d = this.doors.find((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2.4 && Math.abs((q.y ?? p.y) - p.y) < 1.5); if (d) this.action = d.open ? 'CLOSE' : 'OPEN'; }
    }

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { const w = this.w, need = Math.min(w.mag - w.ammo, w.reserve); w.ammo += need; w.reserve -= need; }
    }
    this.fireT = Math.max(0, this.fireT - dt);
    if (this.firing) this.shoot();

    // Third-person over-the-shoulder camera
    const drop = this.phase === 'drop';
    this.landingBlend = drop ? 1 : Math.max(0, this.landingBlend - dt * 0.9);
    const aerial = THREE.MathUtils.smoothstep(this.landingBlend, 0, 1);
    const inside = !drop && this.indoors(p);
    const ads = this.aiming && !drop;
    // Sniper scope: first-person view through the optic, 8x zoom
    const scoped = ads && this.w.kind === 'sniper' && this.reloadT <= 0 && !this.swimming;
    this.player.group.visible = !scoped;
    const back = f.clone().multiplyScalar(THREE.MathUtils.lerp(ads ? -2.2 : inside ? -2.6 : -5.2, -24, aerial))
      .addScaledVector(r, THREE.MathUtils.lerp(ads ? 0.85 : inside ? 0.8 : 1.45, 5, aerial)); // wider shoulder offset so the held gun clears the body and backpack
    const cam = p.clone().add(back);
    cam.y = p.y + THREE.MathUtils.lerp(ads ? 1.95 + this.pitch * 2 : 2.25 + this.pitch * 4, 9, aerial);
    cam.y = Math.max(cam.y, heightAt(cam.x, cam.z) + 0.6, this.diving ? -50 : WATER + 0.5);
    if (inside && aerial === 0) cam.y = Math.min(cam.y, p.y + 2.3);
    // Pull the camera in front of any wall, roof or rock between it and the player.
    const head = p.clone(); head.y += 1.6;
    const toCam = cam.clone().sub(head), camDist = toCam.length(); toCam.normalize();
    this.camRay.set(head, toCam); this.camRay.far = camDist;
    // Buildings between the camera and the player turn see-through; only rock and terrain pull the camera in.
    const hits = aerial > 0 || scoped ? [] : this.camRay.intersectObjects(this.solids, false);
    const faded = new Set<THREE.Mesh>();
    for (const h of hits) if (h.object.userData.building) faded.add(h.object as THREE.Mesh);
    this.fadeBuildings(faded);
    const block = hits.find((h) => !h.object.userData.building);
    if (scoped) { this.camera.position.copy(head).addScaledVector(f, 0.35); this.camOffOn = false; }
    else if (block) { cam.copy(head).addScaledVector(toCam, Math.max(0.35, block.distance - 0.3)); this.camera.position.lerp(cam, 1 - Math.exp(-dt * 22)); this.camOffOn = false; }
    // only the drop itself eases the world position; after touchdown the rigid follow below takes over at once
    else if (drop) { this.camera.position.lerp(cam, 1 - Math.exp(-dt * 3.6)); this.camOffOn = false; }
    else {
      // Follow rigidly and smooth only the offset: with uneven phone frame times, easing the world
      // position made the player appear to slide forward and back while running.
      if (!this.camOffOn) { this.camOff.copy(this.camera.position).sub(p); this.camOffOn = true; }
      this.camOff.lerp(cam.clone().sub(p), 1 - Math.exp(-dt * 8));
      this.camera.position.copy(p).add(this.camOff);
    }
    const fov = THREE.MathUtils.lerp(scoped ? 9 : this.aiming ? 42 : 65, 73, aerial);
    if (Math.abs(this.camera.fov - fov) > 0.1) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12); this.camera.updateProjectionMatrix(); }
    // Flood shot: when the final minute starts, pull up high for a few seconds to show the sea rising.
    if (this.floodCamT > 0) {
      this.floodCamT -= dt;
      const k = Math.min(1, (4 - this.floodCamT) / 1.2) * Math.min(1, this.floodCamT / 0.8);
      const high = new THREE.Vector3(p.x * 0.45, 95, p.z * 0.45 + 120);
      this.camera.position.lerp(high, k);
      const look = new THREE.Vector3(p.x + f.x * 12, p.y + 1.9, p.z + f.z * 12).lerp(new THREE.Vector3(0, 8, 0), k);
      this.camera.lookAt(look);
      return;
    }
    const look = new THREE.Vector3(p.x + f.x * 12, p.y + 1.9 - this.pitch * 9, p.z + f.z * 12);
    look.lerp(new THREE.Vector3(p.x + f.x * 21, Math.max(ground + 4, p.y - 20), p.z + f.z * 21), aerial);
    this.cameraTarget.lerp(look, 1 - Math.exp(-dt * (aerial > 0 ? 4.5 : 16)));
    this.camera.lookAt(this.cameraTarget);
  }

  private diveHeld = false;
  holdDive(on: boolean) { this.diveHeld = on; }

  private updateBots(dt: number) {
    const pp = this.player.group.position;
    for (const e of this.ents) {
      const g = e.group;
      if (!e.alive) {
        if (e.deadT < 1) { e.deadT += dt * 1.6; if (!g.userData.rig) g.rotation.x = -Math.min(1, e.deadT) * Math.PI / 2; if (e.kind === 'boss') g.position.y -= dt * 3; }
        if (e.kind === 'bot' && g.visible) { e.boxT = (e.boxT ?? 0) + dt; if (e.boxT > 1.8) { g.visible = false; this.spawnDeathBox(g.position.clone()); this.burst(0.25, 900, 1.5, 0.3, g.position); } }
        continue;
      }
      if (e.flinch > 0) { e.flinch -= dt; e.parts.torso.rotation.x = -e.flinch * 1.2; } else e.parts.torso.rotation.x = 0;
      if (e.kind !== 'bot') continue;
      const dist = g.position.distanceTo(pp);
      let speed = 0;
      const to = new THREE.Vector3();
      if (dist < 48 && this.phase === 'play') {
        to.subVectors(pp, g.position); to.y = 0;
        if (dist > 16) speed = 4.2;
        e.shootAt -= dt;
        if (e.shootAt <= 0) {
          e.shootAt = 1.1 + Math.random() * 1.2;
          const from = g.position.clone().setY(g.position.y + 1.6);
          const aim = pp.clone().setY(pp.y + 1.3).add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5), (Math.random() - 0.5) * 2));
          this.tracer(from, aim, 0xff5a4a);
          this.gunshot('rifle', 0.5, g.position);
          if (!this.diving && Math.random() < 0.38) { this.damagePlayer(7, 'Eliminated by a bot', g.position); this.coinHit(e); }
        }
      } else {
        to.subVectors(e.target, g.position); to.y = 0;
        if (to.length() < 2) { const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 100; e.target.set(Math.cos(a) * r, 0, Math.sin(a) * r); }
        speed = 2.2;
      }
      if (to.lengthSq() > 0.01) {
        to.normalize();
        g.rotation.y = Math.atan2(to.x, to.z);
        const nx = g.position.x + to.x * speed * dt, nz = g.position.z + to.z * speed * dt;
        if (heightAt(nx, nz) > WATER - 0.6) { g.position.x = nx; g.position.z = nz; } else e.target.set(0, 0, 0);
        this.collide(g.position, 0.45);
      }
      g.position.y = heightAt(g.position.x, g.position.z);
      e.walk = this.animate(e.parts, speed, dt, e.walk, true);
    }
  }

  private wakeBoss() { this.bossAwake = true; this.roar(); this.titanRoarT = 2.6; this.say('The Volcanic Titan has seen you', 3); }
  private titanRoarT = 0;
  private bossSmash = false;

  private updateBoss(dt: number) {
    const b = this.boss, g = b.group, pp = this.player.group.position;
    if (!b.alive || this.phase !== 'play') return;
    const dist = Math.hypot(pp.x - g.position.x, pp.z - g.position.z);
    const ratio = b.hp / b.maxHp;
    const phase = ratio <= 0.2 ? 3 : ratio <= 0.6 ? 2 : 1;
    if (phase !== this.bossPhase) {
      this.bossPhase = phase; this.roar();
      this.say(phase === 3 ? 'THE DOOM TITAN IS ENRAGED' : 'The Doom Titan grows stronger', 3);
      this.bossEyes.emissive.set(phase === 3 ? 0xff1a00 : 0xff4a00); this.bossEyes.emissiveIntensity = phase === 3 ? 5 : 3.5;
    }
    const t = performance.now() / 1000;
    if (!this.bossAwake) {
      // Idle: breathing and a slow search turn until a player comes into range.
      b.parts.torso.scale.y = 1 + Math.sin(t * 1.2) * 0.03; g.rotation.y += dt * 0.25;
      if (dist < 75) this.wakeBoss();
      return;
    }
    // Detect → turn toward target → walk in → attack.
    const want = Math.atan2(pp.x - g.position.x, pp.z - g.position.z);
    let diff = want - g.rotation.y; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    g.rotation.y += diff * Math.min(1, dt * 2.5);
    let speed = 0;
    if (dist > 14 && dist < 110) {
      speed = phase === 3 ? 5.5 : phase === 2 ? 4 : 3;
      const nx = g.position.x + Math.sin(g.rotation.y) * speed * dt, nz = g.position.z + Math.cos(g.rotation.y) * speed * dt;
      if (Math.hypot(nx, nz) < 78) { g.position.x = nx; g.position.z = nz; }
      g.position.y = this.titanGround(g) + this.titanLift;
      this.bossStep += dt * speed * 0.22;
      if (this.bossStep > 1) { this.bossStep = 0; this.thud(0.5, g.position); }
    }
    b.walk += speed * dt * 0.55;
    b.parts.legL.rotation.x = Math.sin(b.walk) * 0.6 * (speed > 0 ? 1 : 0); b.parts.legR.rotation.x = -Math.sin(b.walk) * 0.6 * (speed > 0 ? 1 : 0);
    const windup = this.bossAtk < 0.7 ? (0.7 - this.bossAtk) / 0.7 : 0;
    b.parts.armL.rotation.x = Math.sin(t * 1.4) * 0.4 - windup * 2.4; b.parts.armR.rotation.x = -Math.sin(t * 1.4) * 0.4 - windup * 2.4;
    if (dist > 80) return;
    this.bossAtk -= dt;
    if (this.bossAtk > 0) return;
    this.bossAtk = phase === 3 ? 2.2 : phase === 2 ? 3.4 : 5;
    this.bossSmash = Math.random() < 0.5;
    if (this.bossSmash) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.6, 48), new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(g.position).setY(g.position.y + 0.4);
      this.scene.add(ring); this.rings.push({ mesh: ring, r: 1, hit: false });
      this.thud(0.9, g.position);
      this.say('Ground smash — jump!', 1.5);
    } else {
      const mark = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.4, 32), new THREE.MeshBasicMaterial({ color: 0xff2a1a, side: THREE.DoubleSide }));
      mark.rotation.x = -Math.PI / 2; mark.position.set(pp.x, Math.max(pp.y, WATER) + 0.3, pp.z);
      const rock = new THREE.Mesh(boulderGeo(1.9, Math.random() * 10), rockMat()); rock.castShadow = true;
      rock.position.set(pp.x, pp.y + 60, pp.z);
      this.scene.add(mark, rock); this.rocks.push({ mark, rock, t: 1.5 });
      this.say('Incoming rock — move!', 1.5);
    }
  }

  private updateEffects(dt: number) {
    const pp = this.player.group.position;
    this.tracers = this.tracers.filter((t) => {
      t.d += 420 * dt;
      if (t.d >= t.len) { this.scene.remove(t.mesh); return false; }
      t.mesh.position.copy(t.from).addScaledVector(t.dir, t.d);
      return true;
    });
    this.bits = this.bits.filter((b) => {
      b.t -= dt; b.v.y -= 9.8 * dt; b.mesh.position.addScaledVector(b.v, dt);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, b.t / b.life);
      if (b.t <= 0) { this.scene.remove(b.mesh); return false; }
      return true;
    });
    this.sparks = this.sparks.filter((s) => { s.t -= dt; s.mesh.scale.multiplyScalar(1 + dt * 6); if (s.t <= 0) { this.scene.remove(s.mesh); return false; } return true; });
    this.rings = this.rings.filter((r) => {
      r.r += 20 * dt; r.mesh.scale.setScalar(r.r);
      const d = Math.hypot(pp.x - r.mesh.position.x, pp.z - r.mesh.position.z);
      if (!r.hit && Math.abs(d - r.r * 1.2) < 1.6 && this.grounded) { r.hit = true; this.damagePlayer(this.bossPhase === 3 ? 28 : 18, 'Crushed by the Doom Titan', this.boss.group.position); }
      if (r.r > 48) { this.scene.remove(r.mesh); return false; }
      return true;
    });
    this.rocks = this.rocks.filter((k) => {
      k.t -= dt; k.rock.position.y = k.mark.position.y + Math.max(0, k.t) * 40; k.rock.rotation.x += dt * 3;
      if (k.t <= 0) {
        this.thud(0.8, k.mark.position);
        if (Math.hypot(pp.x - k.mark.position.x, pp.z - k.mark.position.z) < 4.6) this.damagePlayer(30, 'Crushed by the Doom Titan', k.mark.position);
        this.scene.remove(k.mark, k.rock); return false;
      }
      return true;
    });
  }

  private loopErrors = 0;
  /** One bad frame must never freeze the match: log it, keep rendering. */
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    try { this.frame(); this.loopErrors = 0; }
    catch (err) { if (this.loopErrors++ < 5) console.error('[game] frame error', err); try { this.renderer.render(this.scene, this.camera); } catch { /* lost context */ } }
  };
  private frame = () => {
    const aerial = this.phase === 'intro' || this.phase === 'drop';
    const elapsed = this.clock.getDelta();
    const dt = Math.min(aerial ? 0.18 : 0.05, elapsed);
    if (this.phase === 'intro') {
      this.introT += dt;
      const a = 0.6 + this.introT * 0.16, r = 290 - Math.min(this.introT, 6) * 10;
      const blend = THREE.MathUtils.smoothstep(this.introT, 4, 6);
      const p = this.player.group.position;
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const dropCamera = p.clone().addScaledVector(forward, -24)
        .add(new THREE.Vector3(-forward.z * 5, 9, forward.x * 5));
      this.camera.position.set(Math.cos(a) * r, 125 - this.introT * 2, Math.sin(a) * r).lerp(dropCamera, blend);
      this.cameraTarget.set(0, 40, 0).lerp(p.clone().addScaledVector(forward, 21).add(new THREE.Vector3(0, -20, 0)), blend);
      this.camera.lookAt(this.cameraTarget);
      if (this.introT >= 6) this.phase = 'drop';
    } else if (this.phase !== 'ended') {
      this.updatePlayer(dt, Math.min(0.75, elapsed));
      if (this.phase === 'play') {
        this.timeLeft -= dt;
        this.riseSea(dt);
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.roar(); this.thud(1); if (this.eco.win_rule === 'most_coins' && this.hp > 0 && this.coins > 0) this.finish(true, `Survived with ${this.coins} battle coins`); else this.finish(false, 'The sea swallowed the island before the Titan fell'); }
      }
    }
    // fold the canopy away over a moment after touchdown instead of popping it
    if (this.landT > 0) { this.landT -= dt; const k = Math.max(0, this.landT / 0.45); this.chute.scale.setScalar(Math.max(0.01, k)); this.chute.position.y = 4.6 * k; if (this.landT <= 0) { this.chute.visible = false; this.chute.scale.setScalar(1); this.chute.position.y = 4.6; this.settleT = 3; } }
    if (this.settleT > 0) this.settleT -= dt;
    this.updateBots(dt); this.updateBoss(dt); this.updateEffects(dt);
    this.msgT -= dt; if (this.msgT <= 0) this.message = '';
    this.hitMarkT -= dt;
    this.fpsN++;
    this.fpsT += elapsed;
    if (this.fpsT >= 1) {
      this.fps = Math.round(this.fpsN / this.fpsT);
      this.fpsN = 0;
      this.fpsT = 0;
      if (this.quality === 'auto' && this.phase === 'play' && this.settleT <= 0 && this.landT <= 0) {
        this.belowTarget = this.fps < 26 ? this.belowTarget + 1 : 0;
        const next = this.belowTarget >= 2 ? Math.max(0.6, this.autoResolution - 0.1)
          : this.fps > 48 ? Math.min(1, this.autoResolution + 0.05) : this.autoResolution;
        if (next !== this.autoResolution) { this.autoResolution = next; this.resize(); }
        // still struggling at the lowest resolution: drop real-time shadows for the rest of the match
        else if (this.belowTarget >= 4 && this.autoResolution <= 0.6 && this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; }); }
      }
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      const p = this.player.group.position, w = this.w;
      let heading = Math.round((-this.yaw * 180) / Math.PI) % 360; if (heading < 0) heading += 360;
      this.onHud({
        phase: this.phase, hit: this.hitMarkT > 0 ? this.hitMark : 0, hp: Math.round(this.hp), ammo: w.ammo, reserve: w.reserve, weapon: w.name,
        dropAltitude: this.phase === 'drop' ? Math.max(0, Math.round(p.y - heightAt(p.x, p.z))) : 0,
        slots: this.weapons.map((x, i) => ({ name: x.name, owned: x.owned, active: i === this.slot, ammo: x.ammo, reserve: x.reserve })),
        flood: this.timeLeft <= 60 ? { sea: Math.round(this.sea * 10) / 10, top: Math.round(heightAt(0, 0) + 6) } : null,
        mapImg: this.mapImg, medkits: this.medkits, grenades: this.grenades, nadeAim: this.nadeAim, hurtFlash: this.hurtFlash,
        hurtDirs: this.hurtFrom.map((h) => { let a = ((Math.atan2(-(h.x - p.x), -(h.z - p.z)) - this.yaw) * 180) / Math.PI; a = ((a + 540) % 360) - 180; return { a: -a, o: Math.min(1, h.t / 1.2) }; }), aiming: this.aiming, fps: this.fps, quality: this.quality,
        renderSize: `${this.renderer.domElement.width} × ${this.renderer.domElement.height}`, icons: this.icons,
        threats: this.ents.filter((e) => e.alive && (e.kind === 'boss' ? this.bossAwake : true))
          .map((e) => { const dx = e.group.position.x - p.x, dz = e.group.position.z - p.z, d = Math.hypot(dx, dz);
            let a = ((Math.atan2(-dx, -dz) - this.yaw) * 180) / Math.PI; a = ((a + 540) % 360) - 180;
            return { a: -a, d: Math.round(d), boss: e.kind === 'boss' }; })
          .filter((t) => t.d < (t.boss ? 90 : 40)).sort((x, y) => x.d - y.d).slice(0, 5),
        bossDist: Math.round(this.boss.group.position.distanceTo(p)), atSummit: Math.hypot(p.x, p.z) < 32,
        kills: this.kills, botsLeft: this.ents.filter((e) => e.kind === 'bot' && e.alive).length, timeLeft: Math.ceil(this.timeLeft),
        bossHp: Math.max(0, Math.round(this.boss.hp)), bossMax: this.boss.maxHp, bossPhase: this.bossPhase,
        coins: this.coins, matchCoins: this.coins + this.ents.reduce((t, x) => t + (x.alive ? x.coins ?? 0 : 0), 0), livePlayers: this.livePlayers, coinFx: this.coinFx,
        bossNear: this.boss.group.position.distanceTo(p) < 85, message: this.message, kill: this.killBannerT > 0 ? this.killBanner : null, reloading: this.reloadT > 0,
        swimming: this.swimming, diving: this.diving, oxygen: Math.round(this.oxygen), crouching: this.crouching, sprinting: this.sprintOn,
        action: this.action, heading,
        map: {
          x: p.x, z: p.z, yaw: this.yaw,
          boss: this.boss.alive ? [this.boss.group.position.x, this.boss.group.position.z] : null,
          bots: this.ents.filter((e) => e.kind === 'bot' && e.alive).map((e) => [e.group.position.x, e.group.position.z] as [number, number]),
        },
      });
    }
    this.mood += (((this.bossAwake || this.timeLeft <= 60) && this.phase === 'play' ? 1 : 0) - this.mood) * 0.02;
    this.weather(dt);
    this.applyMood(this.mood);
    this.underwater(); // after the sky mood has set the fog
    this.updateRigs();
    this.flagTime.value += dt;
    this.updateShells(dt);
    this.fitBackpack();
    this.updateGrenades(dt);
    this.updateArc();
    this.updateFx(dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.slashT = Math.max(0, this.slashT - dt);
    this.killBannerT = Math.max(0, this.killBannerT - dt);
    this.coinFxT = Math.max(0, this.coinFxT - dt); if (this.coinFxT <= 0) this.coinFx = null;
    this.updateSelfTag();
    if (this.slashT <= 0) this.lastHead = false;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.hurtFrom = this.hurtFrom.filter((h) => (h.t -= dt) > 0);
    if (this.waves) { this.waves.offset.x += dt * 0.012; this.waves.offset.y += dt * 0.007; }
    this.titanSmoke(dt);
    this.smoke = this.smoke.filter((m) => { m.t -= dt; m.s.position.y += dt * 2.2; m.s.scale.multiplyScalar(1 + dt * 0.5); m.s.material.opacity = 0.45 * Math.max(0, m.t / 2.2); if (m.t <= 0) { this.scene.remove(m.s); return false; } return true; });
    this.updateTags();
    this.frameNo++;
    this.smooth(dt);
    this.renderer.render(this.scene, this.camera);
  };

  /** Read-only snapshot for automated checks in the running game. */
  debug() {
    const p = this.player.group.position;
    return { phase: this.phase, x: p.x, y: p.y, z: p.z, swimming: this.swimming, diving: this.diving, oxygen: this.oxygen, ammo: this.w.ammo, weapon: this.w.name, hp: this.hp, kills: this.kills, bossAwake: this.bossAwake, bossX: this.boss.group.position.x, bossZ: this.boss.group.position.z, timeLeft: this.timeLeft, audio: this.audio?.state ?? 'none', ground: heightAt(p.x, p.z) };
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    const c = this.renderer.domElement;
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.releaseInputs);
    document.removeEventListener('visibilitychange', this.onVis);
    document.removeEventListener('mousemove', this.mouseMove);
    window.removeEventListener('mouseup', this.mouseUp);
    c.removeEventListener('touchstart', this.lookStart); window.removeEventListener('touchmove', this.lookMove); window.removeEventListener('touchend', this.lookEnd, true); window.removeEventListener('touchcancel', this.lookEnd, true);
    c.removeEventListener('pointermove', this.touchMove);
    c.removeEventListener('pointerup', this.touchEnd);
    c.removeEventListener('pointercancel', this.touchEnd);
    if (document.pointerLockElement) document.exitPointerLock();
    void this.audio?.close();
    this.renderer.dispose();
    c.remove();
  }
}
