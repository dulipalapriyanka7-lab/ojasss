import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [, , scene, target] = process.argv;
if (!scene || !target) throw new Error('Provide the original soldier glTF and the output GLB path.');
const gltf = JSON.parse(readFileSync(scene, 'utf8'));
const dir = dirname(scene);
const source = readFileSync(resolve(dir, gltf.buffers[0].uri));
const chunks = [source];
let offset = source.length;
const images = new Map();
const materialTextures = [];
for (const material of gltf.materials) {
  for (const props of [material, material.pbrMetallicRoughness ?? {}]) {
    for (const [field, value] of Object.entries(props)) {
      if (field.endsWith('Texture') && Number.isInteger(value?.index)) materialTextures.push(value);
    }
  }
}
const textureIndices = [...new Set(materialTextures.map(texture => texture.index))];
gltf.textures = textureIndices.map(index => gltf.textures[index]);
for (const texture of materialTextures) texture.index = textureIndices.indexOf(texture.index);
const imageIndices = [...new Set(gltf.textures.map(texture => texture.source))];
gltf.images = imageIndices.map(index => gltf.images[index]);
for (const texture of gltf.textures) texture.source = imageIndices.indexOf(texture.source);

for (const image of gltf.images) {
  const uri = image.uri;
  if (!images.has(uri)) {
    // Preserve normal map values while reducing the size of diffuse textures.
    const normal = /normal/i.test(uri);
    const encoded = execFileSync('ffmpeg', [
      '-v', 'error', '-i', resolve(dir, decodeURIComponent(uri)), '-frames:v', '1',
      '-vf', "scale='min(iw,1024)':'min(ih,1024)':force_original_aspect_ratio=decrease",
      '-c:v', 'libwebp', '-lossless', normal ? '1' : '0', '-quality', '86', '-f', 'webp', '-',
    ], { maxBuffer: 8 * 1024 * 1024 });
    const padding = (4 - offset % 4) % 4;
    chunks.push(Buffer.alloc(padding), encoded);
    offset += padding;
    images.set(uri, gltf.bufferViews.length);
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: encoded.length });
    offset += encoded.length;
  }
  image.bufferView = images.get(uri);
  image.mimeType = 'image/webp';
  delete image.uri;
}
for (const texture of gltf.textures) {
  texture.extensions = { ...texture.extensions, EXT_texture_webp: { source: texture.source } };
  delete texture.source;
}
gltf.extensionsUsed = [...(gltf.extensionsUsed ?? []), 'EXT_texture_webp'];
gltf.extensionsRequired = [...(gltf.extensionsRequired ?? []), 'EXT_texture_webp'];
gltf.buffers = [{ byteLength: offset }];

const bin = Buffer.concat([...chunks, Buffer.alloc((4 - offset % 4) % 4)]);
const json = Buffer.from(JSON.stringify(gltf));
const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonChunk.length + bin.length, 8);
const chunkHeader = (length, type) => {
  const out = Buffer.alloc(8);
  out.writeUInt32LE(length);
  out.writeUInt32LE(type, 4);
  return out;
};
writeFileSync(target, Buffer.concat([header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHeader(bin.length, 0x004e4942), bin]));
