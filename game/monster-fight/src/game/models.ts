import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// OJASSS — Hill of Doom: real 3D models (CC0, by Quaternius, see public/game/models/CREDITS.txt).
// Characters are rigged and animated with an AnimationMixer; trees are instanced static models.

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadGLB(name: string): Promise<GLTF> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(name.endsWith('.gltf') ? `/game/models/${name}` : `/game/models/${name}.glb`)
      .catch(error => { cache.delete(name); throw error; });
    cache.set(name, p);
  }
  return p;
}

export interface Rig {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string;
  meshes: Map<string, THREE.Object3D>;
}

/** Scale `obj` so its height is `height`, with its feet at y = 0 and centred on x/z. */
function fit(obj: THREE.Object3D, height: number) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const s = height / Math.max(1e-6, box.max.y - box.min.y);
  obj.scale.multiplyScalar(s);
  obj.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
}

/** Clone a rigged model into `group` (whose own +z is "forward"). `tint` recolours its materials. */
export async function attachRig(group: THREE.Group, name: string, height: number, hide: string[] = [], tint?: (m: THREE.MeshStandardMaterial) => void): Promise<Rig> {
  const gltf = await loadGLB(name);
  const holder = new THREE.Group();
  const model = cloneSkinned(gltf.scene);
  const meshes = new Map<string, THREE.Object3D>();
  model.traverse((o) => {
    meshes.set(o.name, o);
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; // skinned bounds are unreliable
      (o as THREE.Mesh).raycast = () => {}; // bullets hit the hit boxes, not the animated skin
      if (hide.includes(o.name)) o.visible = false;
      if (tint) { const mesh = o as THREE.Mesh; mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((x) => { const c = (x as THREE.MeshStandardMaterial).clone(); tint(c); return c; })[0]; }
    }
  });
  holder.add(model);
  fit(holder, height);
  group.add(holder);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of gltf.animations) actions.set(clip.name.split('|').pop()!, mixer.clipAction(clip));
  const rig: Rig = { root: holder, mixer, actions, current: '', meshes };
  group.userData.rig = rig;
  group.userData.h = height;
  return rig;
}

/** Cross-fade to a clip by its short name (e.g. "Run"). `once` clips hold their last frame. */
export function play(rig: Rig, name: string, once = false, fade = 0.2) {
  if (rig.current === name) return;
  const next = rig.actions.get(name);
  if (!next) return;
  const prev = rig.actions.get(rig.current);
  next.reset();
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  next.clampWhenFinished = once;
  next.play();
  if (prev) prev.crossFadeTo(next, fade, false);
  rig.current = name;
}

/** Put a static model (e.g. a rifle) on a bone of a rig. */
export async function attachToBone(rig: Rig, bone: string, name: string, length: number, pos: [number, number, number], rot: [number, number, number]): Promise<THREE.Object3D | null> {
  // the glTF loader strips dots from node names ("Wrist.R" becomes "WristR"), so match loosely
  const key = bone.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const b = [...rig.meshes.values()].find((o) => o.name.replace(/[^a-z0-9]/gi, '').toLowerCase() === key);
  if (!b) return null;
  const gltf = await loadGLB(name);
  const m = gltf.scene.clone(true);
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
  // the bone carries the rig's scale, so undo it to get `length` metres in world terms
  b.updateMatrixWorld(true);
  const ws = new THREE.Vector3(); b.getWorldScale(ws);
  const g = rig.root.parent; const gs = new THREE.Vector3(1, 1, 1); g?.getWorldScale(gs);
  m.scale.setScalar((length / Math.max(size.x, size.y, size.z)) * (gs.x / ws.x));
  m.position.set(...pos).multiplyScalar(gs.x / ws.x);
  m.rotation.set(...rot);
  m.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  b.add(m);
  return m;
}

/** Instanced copies of a static model (all its meshes), one per matrix. */
/** Instanced copies of a static model, batched in 100 m grid blocks (each block is culled on its own). */
export async function instanceModel(scene: THREE.Scene, name: string, height: number, matrices: THREE.Matrix4[], shadows: boolean): Promise<THREE.InstancedMesh[]> {
  if (!matrices.length) return [];
  const made: THREE.InstancedMesh[] = [];
  const gltf = await loadGLB(name);
  const src = gltf.scene.clone(true);
  const holder = new THREE.Group(); holder.add(src);
  fit(holder, height);
  holder.updateMatrixWorld(true);
  const tmp = new THREE.Matrix4(), at = new THREE.Vector3();
  const cells = new Map<string, THREE.Matrix4[]>();
  for (const m of matrices) { at.setFromMatrixPosition(m); const k = Math.floor(at.x / 100) + ':' + Math.floor(at.z / 100); if (!cells.has(k)) cells.set(k, []); cells.get(k)!.push(m); }
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const list of cells.values()) {
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
      list.forEach((m, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(m, mesh.matrixWorld)));
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = shadows; inst.receiveShadow = true;
      inst.computeBoundingSphere();
      inst.userData.c = inst.boundingSphere!.center.clone();
      scene.add(inst); made.push(inst);
    }
  });
  return made;
}

/** A gun model normalised so its barrel lies along +z, centred, `length` metres long.
 *  `flip` turns it round if the source model's muzzle points the other way. */
export async function makeGun(name: string, length: number, flip = false): Promise<THREE.Group> {
  const gltf = await loadGLB(name);
  const model = gltf.scene.clone(true);
  const inner = new THREE.Group(); inner.add(model);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  model.position.sub(c);
  const long = Math.max(size.x, size.y, size.z);
  if (long === size.x) inner.rotation.y = Math.PI / 2; else if (long === size.y) inner.rotation.x = Math.PI / 2;
  if (flip) inner.rotation.y += Math.PI;
  const holder = new THREE.Group(); holder.add(inner);
  holder.scale.setScalar(length / long);
  holder.userData.len = length;
  holder.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; (o as THREE.Mesh).raycast = () => {}; } });
  return holder;
}

// ---------------------------------------------------------------- Mixamo motion-capture clips
const fbx = new FBXLoader();
const clipCache = new Map<string, Promise<THREE.AnimationClip>>();
function loadClip(file: string): Promise<THREE.AnimationClip> {
  let c = clipCache.get(file);
  if (!c) { c = fbx.loadAsync(file.includes('/') ? `/game/models/${file}.fbx` : `/game/models/anims/${file}.fbx`).then((g) => g.animations[0]); clipCache.set(file, c); }
  return c;
}

/** The standard Mixamo bones (all shared by the X Bot clips and any Mixamo-rigged character). */
const MIXAMO = /^mixamorig[:]?([A-Za-z]+[0-9]?)(_\d+)?$/;
const boneKey = (name: string) => { const k = MIXAMO.exec(name.replace(/[^A-Za-z0-9_:]/g, '')); return k ? k[1] : null; };

/** Add Mixamo FBX clips to a Mixamo-rigged character. Bone names are matched loosely (the source
 *  uses "mixamorigHips", Sketchfab exports "mixamorigHips_01"), only rotations are kept so the
 *  game, not the clip, moves the character. Clips play under the given keys. */
export async function addMixamoClips(rig: Rig, clips: Record<string, string>) {
  const bones = new Map<string, string>();
  rig.meshes.forEach((o, n) => { const k = boneKey(n); if (k && (o as THREE.Bone).isBone) bones.set(k, n); });
  await Promise.allSettled(Object.entries(clips).map(async ([key, file]) => {
    const src = await loadClip(file);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const t of src.tracks) {
      const dot = t.name.lastIndexOf('.'), prop = t.name.slice(dot + 1);
      const k = boneKey(t.name.slice(0, dot));
      const target = k && bones.get(k);
      if (!target) continue;
      if (prop === 'quaternion') { const c = t.clone(); c.name = `${target}.quaternion`; tracks.push(c); continue; }
      // Keep the hips' height so falls, crouches and jumps reach the ground. Mixamo works in
      // centimetres; rescale to the character's own hips height and drop forward drift (the
      // game moves the character, not the clip).
      if (prop === 'position' && k === 'Hips') {
        const rest = rig.meshes.get(target)!.position, v = Float32Array.from(t.values);
        // FBX characters share the clips' centimetre units; converted rigs (bone names ending _NN) use metres.
        const s = /_\d+$/.test(target) ? rest.y / 104 : 1, x0 = v[0], z0 = v[2];
        // Remove the clip's own travel (a straight-line drift from first to last frame) so a looping run
        // never slides the body forward and snaps it back; only the small in-place sway is kept.
        const n = v.length / 3, dx = v[v.length - 3] - x0, dz = v[v.length - 1] - z0;
        for (let i = 0, j = 0; i < v.length; i += 3, j++) { const u = n > 1 ? j / (n - 1) : 0; v[i] = rest.x + (v[i] - x0 - dx * u) * s * 0.3; v[i + 1] *= s; v[i + 2] = rest.z + (v[i + 2] - z0 - dz * u) * s * 0.3; }
        tracks.push(new THREE.VectorKeyframeTrack(`${target}.position`, Array.from(t.times), Array.from(v)));
      }
    }
    rig.actions.set(key, rig.mixer.clipAction(new THREE.AnimationClip(key, src.duration, tracks)));
  }));
}

/** Clip set used by the soldiers. */
export const SOLDIER_CLIPS = { Idle: 'idle', Aim: 'aim', Crouch: 'crouch', Walk: 'walk', Run: 'run', RunFire: 'runfire', Fire: 'fire', Jump: 'jump', Reload: 'reload', Hit: 'hit', Death: 'death' };

/** Load a skinned Mixamo FBX character (with embedded textures) as a rig, like attachRig does for glTF.
 *  FBXLoader gives Phong materials; they are converted to physically based ones so the character is
 *  lit like the rest of the world. `style` can recolour them. */
const fbxModels = new Map<string, Promise<THREE.Group>>();
export async function attachFBXRig(group: THREE.Group, file: string, height: number, style?: (m: THREE.MeshStandardMaterial) => void): Promise<Rig> {
  let src = fbxModels.get(file);
  if (!src) { src = fbx.loadAsync(`/game/models/${file}`); fbxModels.set(file, src); }
  const model = cloneSkinned(await src) as THREE.Group;
  const meshes = new Map<string, THREE.Object3D>();
  model.traverse((o) => {
    meshes.set(o.name, o);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const conv = (x: THREE.Material) => {
      const ph = x as THREE.MeshPhongMaterial;
      const std = new THREE.MeshStandardMaterial({ map: ph.map ?? null, normalMap: ph.normalMap ?? null, color: 0xffffff, roughness: 0.72, metalness: 0.05 });
      if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
      style?.(std);
      return std;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.raycast = () => {};
  });
  const holder = new THREE.Group(); holder.add(model);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder), s = height / Math.max(1e-6, box.max.y - box.min.y);
  holder.scale.multiplyScalar(s);
  holder.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  group.add(holder);
  const mixer = new THREE.AnimationMixer(model);
  const rig: Rig = { root: holder, mixer, actions: new Map(), current: '', meshes };
  group.userData.rig = rig; group.userData.h = height;
  return rig;
}

/** The Volcanic Titan (Mixamo Mutant) clip set. */
export const TITAN_CLIPS = { Idle: 'mutant/idle', Walk: 'mutant/walk', Run: 'mutant/run', Attack: 'mutant/swipe', Smash: 'mutant/jumpattack', Roar: 'mutant/roar', Death: 'mutant/death' };
