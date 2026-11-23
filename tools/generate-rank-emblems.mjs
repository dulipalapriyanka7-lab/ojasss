// Generates the five leaderboard rank emblems (original vector art) into web/public/assets/ranks.
// Run: node tools/generate-rank-emblems.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'assets', 'ranks');
mkdirSync(out, { recursive: true });
const f = (n) => Number(n.toFixed(2));

function star(cx, cy, R, r, rot = -90) {
  const p = [];
  for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; p.push(`${f(cx + q * Math.cos(a))},${f(cy + q * Math.sin(a))}`); }
  return p.join(' ');
}

/** One side of the wreath: leaves along an arc from the bottom to the top, plus the stem. */
function laurelSide(id) {
  const cx = 60, cy = 54, R = 41; let leaves = '';
  for (let i = 0; i < 8; i++) {
    const t = (248 - i * 19) * Math.PI / 180;           // bottom -> top on the left side
    const x = cx + R * Math.cos(t), y = cy - R * Math.sin(t);
    const tangent = 90 - (248 - i * 19);                 // leaf follows the arc
    const s = 1 - i * 0.045;
    leaves += `<ellipse cx="${f(x - 3.2)}" cy="${f(y)}" rx="${f(3.6 * s)}" ry="${f(8.6 * s)}" transform="rotate(${f(tangent - 28)} ${f(x)} ${f(y)})" fill="url(#${id}-m)"/>`;
    leaves += `<ellipse cx="${f(x + 3.4)}" cy="${f(y)}" rx="${f(2.9 * s)}" ry="${f(7.2 * s)}" transform="rotate(${f(tangent + 30)} ${f(x)} ${f(y)})" fill="url(#${id}-m)" opacity=".82"/>`;
  }
  const a0 = 250 * Math.PI / 180, a1 = 100 * Math.PI / 180;
  const stem = `<path d="M${f(cx + R * Math.cos(a0))} ${f(cy - R * Math.sin(a0))} A${R} ${R} 0 0 1 ${f(cx + R * Math.cos(a1))} ${f(cy - R * Math.sin(a1))}" fill="none" stroke="url(#${id}-m)" stroke-width="1.6" stroke-linecap="round"/>`;
  return stem + leaves;
}

const symbols = {
  crown: (id) => `
    <path d="M40 66 L36 42 L48 53 L60 34 L72 53 L84 42 L80 66 Z" fill="url(#${id}-m)" stroke="url(#${id}-d)" stroke-width="1.2" stroke-linejoin="round"/>
    <rect x="39" y="66" width="42" height="8" rx="2.5" fill="url(#${id}-m)" stroke="url(#${id}-d)" stroke-width="1"/>
    <path d="M44 62 L41.5 47 L49 54 Z M76 62 L78.5 47 L71 54 Z" fill="#fff" opacity=".28"/>
    <circle cx="36" cy="41" r="3" fill="url(#${id}-m)"/><circle cx="60" cy="33" r="3.6" fill="url(#${id}-m)"/><circle cx="84" cy="41" r="3" fill="url(#${id}-m)"/>
    <circle cx="60" cy="70" r="2.6" fill="#ef4444"/><circle cx="48" cy="70" r="2" fill="#38bdf8"/><circle cx="72" cy="70" r="2" fill="#38bdf8"/>
    <circle cx="60" cy="54" r="3" fill="#fff7c2"/>`,
  shieldStar: (id) => `
    <path d="M60 30 L82 38 V56 C82 68 72 76 60 81 C48 76 38 68 38 56 V38 Z" fill="url(#${id}-m)" stroke="url(#${id}-d)" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M60 35 L77 41 V56 C77 65 69.5 71.5 60 75.5 Z" fill="#000" opacity=".12"/>
    <path d="M60 35 L43 41 V56 C43 65 50.5 71.5 60 75.5 Z" fill="#fff" opacity=".2"/>
    <polygon points="${star(60, 55, 13, 5.4)}" fill="#fff" stroke="url(#${id}-d)" stroke-width=".9" stroke-linejoin="round"/>`,
  diamond: (id) => `
    <polygon points="44,40 76,40 88,53 60,84 32,53" fill="url(#${id}-m)" stroke="url(#${id}-d)" stroke-width="1.3" stroke-linejoin="round"/>
    <polygon points="44,40 52,53 32,53" fill="#fff" opacity=".45"/><polygon points="44,40 60,40 52,53" fill="#fff" opacity=".2"/>
    <polygon points="60,40 76,40 68,53" fill="#fff" opacity=".32"/><polygon points="76,40 88,53 68,53" fill="#000" opacity=".1"/>
    <polygon points="52,53 68,53 60,84" fill="#fff" opacity=".24"/><polygon points="32,53 52,53 60,84" fill="#000" opacity=".06"/>
    <polygon points="68,53 88,53 60,84" fill="#000" opacity=".2"/>
    <path d="M32 53 H88 M44 40 L52 53 L60 84 L68 53 L76 40 M60 40 L52 53 M60 40 L68 53" fill="none" stroke="#fff" stroke-width=".7" opacity=".7"/>`,
  emerald: (id) => `
    <polygon points="48,33 72,33 84,45 84,67 72,79 48,79 36,67 36,45" fill="url(#${id}-m)" stroke="url(#${id}-d)" stroke-width="1.3" stroke-linejoin="round"/>
    <polygon points="51,43 69,43 75,49 75,63 69,69 51,69 45,63 45,49" fill="#fff" opacity=".22" stroke="#fff" stroke-width=".7"/>
    <polygon points="48,33 72,33 69,43 51,43" fill="#fff" opacity=".4"/><polygon points="36,45 48,33 51,43 45,49" fill="#fff" opacity=".22"/>
    <polygon points="84,45 84,67 75,63 75,49" fill="#000" opacity=".16"/><polygon points="48,79 72,79 69,69 51,69" fill="#000" opacity=".22"/>
    <path d="M36 45 L45 49 M84 45 L75 49 M36 67 L45 63 M84 67 L75 63 M72 33 L69 43 M48 79 L51 69 M72 79 L69 69" stroke="#fff" stroke-width=".7" opacity=".6"/>
    <path d="M51 47 L58 47 L49 58 Z" fill="#fff" opacity=".55"/>`,
  roundShieldStar: (id) => `
    <path d="M39 34 H81 V58 C81 70 71 77 60 82 C49 77 39 70 39 58 Z" fill="url(#${id}-d)"/>
    <path d="M43 38 H77 V58 C77 67 69 73 60 77 C51 73 43 67 43 58 Z" fill="url(#${id}-m)" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>
    <path d="M43 38 H60 V77 C51 73 43 67 43 58 Z" fill="#fff" opacity=".16"/>
    <polygon points="${star(60, 56, 13.5, 5.6)}" fill="url(#${id}-d)"/>
    <polygon points="${star(60, 55, 12, 5)}" fill="url(#${id}-m)" stroke="#fff" stroke-opacity=".6" stroke-width=".7" stroke-linejoin="round"/>
    <circle cx="46" cy="41" r="1.3" fill="#fff" opacity=".7"/><circle cx="74" cy="41" r="1.3" fill="#fff" opacity=".7"/>`,
};

const ranks = [
  { file: 'gold', id: 'rk-gold', stops: ['#FFF4A8', '#FFD700', '#B87512'], glow: '#FFD700', symbol: 'crown' },
  { file: 'silver', id: 'rk-silver', stops: ['#FFFFFF', '#C5D0E4', '#7B89A7'], glow: '#E8EEFF', symbol: 'shieldStar' },
  { file: 'platinum', id: 'rk-platinum', stops: ['#C3F8FF', '#28D8FF', '#0879EA'], glow: '#28D8FF', symbol: 'diamond' },
  { file: 'emerald', id: 'rk-emerald', stops: ['#B9FFD0', '#32EA77', '#078B45'], glow: '#32EA77', symbol: 'emerald' },
  { file: 'bronze', id: 'rk-bronze', stops: ['#FFE3A2', '#E9953C', '#94501D'], glow: '#F59E42', symbol: 'roundShieldStar' },
];

for (const r of ranks) {
  const [a, b, c] = r.stops, id = r.id;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112" width="120" height="112" role="img" aria-label="${r.file} rank emblem">
  <defs>
    <linearGradient id="${id}-m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <linearGradient id="${id}-d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <radialGradient id="${id}-g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${r.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${r.glow}" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="60" cy="56" rx="34" ry="32" fill="url(#${id}-g)" opacity=".5"/>
  <ellipse cx="60" cy="101" rx="34" ry="7" fill="url(#${id}-g)"/>
  <g>${laurelSide(id)}</g>
  <g transform="translate(120 0) scale(-1 1)">${laurelSide(id)}</g>
  <g>${symbols[r.symbol](id)}</g>
  <path d="M38 93 L44 97 L38 101 H50 V93 Z M82 93 L76 97 L82 101 H70 V93 Z" fill="url(#${id}-d)" opacity=".85"/>
  <rect x="46" y="91" width="28" height="9" rx="2.2" fill="url(#${id}-m)" stroke="url(#${id}-d)" stroke-width=".8"/>
  <rect x="48" y="92.4" width="24" height="2" rx="1" fill="#fff" opacity=".4"/>
</svg>
`;
  writeFileSync(join(out, `${r.file}-rank.svg`), svg);
}
console.log('Wrote', ranks.length, 'emblems to', out);
