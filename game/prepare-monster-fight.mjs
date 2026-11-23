import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [, , archive, output, editedBuild] = process.argv;
if (!archive || !output) throw new Error('Pass the Monster Fight ZIP and an empty output directory.');

const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/);
const gameEntries = entries.filter((entry) => entry.startsWith('dist/'));
if (!gameEntries.includes('dist/index.html') || gameEntries.some((entry) =>
  !/^dist\/[A-Za-z0-9_./-]+$/.test(entry) || entry.split('/').some((part) => part === '.' || part === '..'))) {
  throw new Error('Unexpected paths in the game archive.');
}
const fileTypes = execFileSync('tar', ['-tvf', archive, 'dist'], { encoding: 'utf8' }).trim().split(/\r?\n/);
if (fileTypes.some((entry) => !/^[d-]/.test(entry))) throw new Error('Game archive contains a link or special file.');

const destination = resolve(output);
mkdirSync(destination, { recursive: true });
if (readdirSync(destination).length) throw new Error('Game output directory must be empty.');
execFileSync('tar', ['-xf', archive, '-C', destination, 'dist']);
const build = join(destination, 'dist');
const html = join(build, 'index.html');
if (editedBuild) {
  const editedAssets = join(editedBuild, 'assets');
  const assets = readdirSync(editedAssets).filter((name) => /\.(js|css)$/.test(name));
  if (!assets.length) throw new Error('The edited game build has no scripts or styles.');
  copyFileSync(join(editedBuild, 'index.html'), html);
  for (const name of readdirSync(join(build, 'assets'))) unlinkSync(join(build, 'assets', name));
  for (const name of assets) copyFileSync(join(editedAssets, name), join(build, 'assets', name));
}
writeFileSync(html, readFileSync(html, 'utf8')
  .replaceAll('="/assets/', '="./assets/')
  .replaceAll('="/game/', '="./game/')
  .replace(/^\s*<link[^>]*https:\/\/fonts\.googleapis\.com[^>]*>\r?\n/gm, '\n'));

// OJASSS flag next to the Janasena flag (the owner asked for both on the island).
copyFileSync(join(build, 'game', 'ojasss-patch.webp'), join(build, 'game', 'flag-ojasss.webp'));
for (const entry of readdirSync(join(build, 'assets'))) {
  if (!/\.(js|css)$/.test(entry)) continue;
  const asset = join(build, 'assets', entry);
  const contents = readFileSync(asset, 'utf8');
  const isolated = contents.replaceAll('/game/', './game/');
  // These two images are painted onto canvases before Three.js uploads the textures.
  const corsSafe = isolated.replace(
    /([\w$]+)\.src\s*=\s*([`'"]\.\/game\/ojasss-patch\.webp[`'"])/g,
    '$1.crossOrigin="anonymous",$1.src=$2',
  );
  writeFileSync(asset, corsSafe);
}
console.log(build);
