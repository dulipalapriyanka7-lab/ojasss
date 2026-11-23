import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/apply-brand.mjs <logo file>');
const web = join(root, 'web/public');
async function image(path, size, flame = false, padding = 0) {
  mkdirSync(dirname(path), { recursive: true });
  let input = sharp(source);
  // The supplied image has the flame above the wordmark; use the flame at small sizes.
  if (flame) input = input.extract({ left: 278, top: 20, width: 686, height: 826 });
  const inner = size - padding * 2;
  let result = input.resize(inner, inner, { fit: 'contain', background: '#ffffff' });
  if (padding) result = result.extend({ top: padding, bottom: padding, left: padding, right: padding, background: '#ffffff' });
  await result.png().toFile(path);
}
await image(join(web, 'brand/logo.png'), 768);
await image(join(web, 'brand/mark.png'), 192, true);
for (const size of [192, 512]) await image(join(web, `icons/icon-${size}.png`), size, true);
await image(join(web, 'icons/icon-maskable-512.png'), 512, true, 80);
await image(join(web, 'icons/apple-touch-icon.png'), 180, true, 16);
await image(join(web, 'og-default.png'), 1200);
for (const app of ['android/app/src/main/res', 'flutter/android/app/src/main/res']) {
  const res = join(root, app);
  for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    for (const name of ['ic_launcher', 'ic_launcher_round']) await image(join(res, `mipmap-${density}/${name}.png`), size, true, Math.round(size * 0.1));
  }
  await image(join(res, 'drawable-nodpi/brand_launcher.png'), 432, true, 110);
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    writeFileSync(join(res, `mipmap-anydpi-v26/${name}.xml`), '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@android:color/white"/><foreground android:drawable="@drawable/brand_launcher"/></adaptive-icon>\n');
  }
}
await image(join(root, 'android/store/play-icon-512.png'), 512, true, 48);
const miscPath = join(root, 'web/src/components/ui/Misc.tsx');
let misc = readFileSync(miscPath, 'utf8');
const start = misc.indexOf('  const gid = useId();', misc.indexOf('export function Logo('));
const end = misc.indexOf('\nexport interface TabItem', start);
if (start >= 0 && end >= 0) {
  misc = misc.slice(0, start) + `  return (\n    <span className={cn('inline-flex items-center gap-2', className)}>\n      {compact ? <img src="/brand/mark.png" width="36" height="36" alt="OJASSS" className="shrink-0 rounded-lg" />\n        : <img src="/brand/logo.png" width="112" height="112" alt="OJASSS — The Indian Mass Power App" className={cn('h-20 w-20 shrink-0 rounded-lg object-contain', textClassName)} />}\n    </span>\n  );\n}\n` + misc.slice(end);
  writeFileSync(miscPath, misc);
}
const htmlPath = join(root, 'web/index.html');
writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />', '<link rel="icon" href="/brand/mark.png" type="image/png" />'));
console.log('Applied supplied brand assets.');
