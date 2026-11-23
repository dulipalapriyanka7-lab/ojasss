// Generates OJASSS brand assets for web (PWA, favicon, OG) and Android (launcher fallbacks,
// Play Store icon & feature graphic) from one vector source. Run: node tools/generate-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web', 'public');
const ANDROID_RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const STORE = join(ROOT, 'android', 'store');

const GRAD = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ff7a1a"/><stop offset="0.55" stop-color="#f04d4d"/><stop offset="1" stop-color="#e0337a"/>
</linearGradient>`;

/** The mark: an energy ring ("O") around a play symbol, with a spark in the gap. No text (legible at every size). */
const mark = (color = '#fff') => `
  <circle cx="32" cy="32" r="16" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="80 20.5" transform="rotate(-10 32 32)"/>
  <path d="M28.5 25.5 L39 32 L28.5 38.5 Z" fill="${color}" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="44.3" cy="19.7" r="3.6" fill="${color}"/>`;

/** Rounded-square app icon (favicon / PWA "any"). */
const roundedIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${GRAD}</defs>
  <rect width="64" height="64" rx="18" fill="url(#g)"/>${mark()}</svg>`;

/** Full-bleed square with the mark inside the maskable safe zone (80%). */
const maskableIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${GRAD}</defs>
  <rect width="64" height="64" fill="url(#g)"/><g transform="translate(6.4 6.4) scale(0.8)">${mark()}</g></svg>`;

const ogImage = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>${GRAD}
    <radialGradient id="a" cx="0.15" cy="0.1" r="0.6"><stop offset="0" stop-color="#ff7a1a" stop-opacity="0.45"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="0.95" cy="0.95" r="0.6"><stop offset="0" stop-color="#e0337a" stop-opacity="0.4"/><stop offset="1" stop-color="#e0337a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b0a10"/><rect width="1200" height="630" fill="url(#a)"/><rect width="1200" height="630" fill="url(#b)"/>
  <g transform="translate(96 120) scale(2.6)"><rect width="64" height="64" rx="18" fill="url(#g)"/>${mark()}</g>
  <text x="96" y="400" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="118" fill="#fff" letter-spacing="-4">OJASSS</text>
  <text x="100" y="470" font-family="Segoe UI, Arial, sans-serif" font-weight="500" font-size="40" fill="#ffffff" fill-opacity="0.75">Watch. Create. Go viral.</text>
  <text x="100" y="540" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="30" fill="#ff9a5c">ojasss.com</text>
</svg>`;

const featureGraphic = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>${GRAD}<radialGradient id="a" cx="0.1" cy="0.1" r="0.7"><stop offset="0" stop-color="#ff7a1a" stop-opacity="0.5"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient></defs>
  <rect width="1024" height="500" fill="#0b0a10"/><rect width="1024" height="500" fill="url(#a)"/>
  <g transform="translate(80 150) scale(3.1)"><rect width="64" height="64" rx="18" fill="url(#g)"/>${mark()}</g>
  <text x="320" y="245" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="104" fill="#fff" letter-spacing="-3">OJASSS</text>
  <text x="324" y="310" font-family="Segoe UI, Arial, sans-serif" font-weight="500" font-size="34" fill="#fff" fill-opacity="0.75">Short videos &amp; posters. Made in India.</text>
</svg>`;

async function png(svg, size, out, opts = {}) {
  mkdirSync(dirname(out), { recursive: true });
  let img = sharp(Buffer.from(svg), { density: 384 }).resize(size.w ?? size, size.h ?? size);
  if (opts.flatten) img = img.flatten({ background: opts.flatten });
  await img.png({ compressionLevel: 9 }).toFile(out);
}

mkdirSync(join(WEB, 'icons'), { recursive: true });
writeFileSync(join(WEB, 'favicon.svg'), roundedIcon);
await png(roundedIcon, 192, join(WEB, 'icons', 'icon-192.png'));
await png(roundedIcon, 512, join(WEB, 'icons', 'icon-512.png'));
await png(maskableIcon, 512, join(WEB, 'icons', 'icon-maskable-512.png'));
await png(maskableIcon, 180, join(WEB, 'icons', 'apple-touch-icon.png'));
await png(ogImage, { w: 1200, h: 630 }, join(WEB, 'og-default.png'));

// Android legacy launcher PNGs (API < 26 fallback; adaptive icons are vector XML).
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(densities)) {
  await png(roundedIcon, s, join(ANDROID_RES, `mipmap-${d}`, 'ic_launcher.png'));
  const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${GRAD}</defs><circle cx="32" cy="32" r="32" fill="url(#g)"/><g transform="translate(6.4 6.4) scale(0.8)">${mark()}</g></svg>`;
  await png(round, s, join(ANDROID_RES, `mipmap-${d}`, 'ic_launcher_round.png'));
}
// Play Store listing assets.
await png(maskableIcon, 512, join(STORE, 'play-icon-512.png'));
await png(featureGraphic, { w: 1024, h: 500 }, join(STORE, 'feature-graphic-1024x500.png'));

console.log('Assets generated.');
