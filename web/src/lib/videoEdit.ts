export const editLooks = {
  Original: [100, 100, 100],
  Cinema: [93, 125, 83],
  Vivid: [105, 110, 145],
  Soft: [110, 88, 94],
  Mono: [100, 115, 0],
} as const;

export const textThemes = {
  Clean: { foreground: '#fff', background: '#151022e8', accent: '#151022e8' },
  Spotlight: { foreground: '#fff', background: '#5b16af', accent: '#b81e77' },
  Offer: { foreground: '#210d20', background: '#ffc450', accent: '#ff9063' },
  Slate: { foreground: '#fff', background: '#0f2949', accent: '#12606d' },
  Highlight: { foreground: '#210c09', background: '#ffe950', accent: '#ffa72c' },
  LowerThird: { foreground: '#200b16', background: '#fff', accent: '#ffc5da' },
  Quote: { foreground: '#fff', background: '#210d34', accent: '#63188c' },
  Gradient: { foreground: '#fff', background: '#d22a97', accent: '#3751f5' },
  Glass: { foreground: '#fff', background: '#1b3859ae', accent: '#87205ebd' },
  Neon: { foreground: '#fff', background: '#170a31', accent: '#43146a' },
} as const;

export type EditText = {
  id: string;
  text: string;
  start: number;
  end: number;
  theme: keyof typeof textThemes;
  position: 'top' | 'center' | 'bottom';
  motion: 'still' | 'typing' | 'fade' | 'pop' | 'slide' | 'bounce' | 'zoom';
  kind?: 'text' | 'caption' | 'sticker';
  template?: string;
};

export type VideoEdit = {
  start: number;
  end: number;
  framing: 'original' | 'portrait' | 'square' | 'landscape';
  rotation: number;
  flip: boolean;
  volume: number;
  brightness: number;
  contrast: number;
  saturation: number;
  background: string;
  fade: boolean;
  effect?: 'vignette' | 'sparkle';
  text: EditText[];
  cuts?: { start: number; end: number }[];
};

/** Seconds removed by middle cuts before source time t, or -1 when t falls inside a cut. */
export function cutShift(edit: VideoEdit, t: number) {
  let shift = 0;
  for (const c of edit.cuts ?? []) { if (t >= c.start && t < c.end) return -1; if (t >= c.end) shift += c.end - c.start; }
  return shift;
}
export const keptSeconds = (edit: VideoEdit) => edit.end - edit.start - (edit.cuts ?? []).reduce((s, c) => s + Math.max(0, Math.min(c.end, edit.end) - Math.max(c.start, edit.start)), 0);

export function initialVideoEdit(seconds: number): VideoEdit {
  return {
    start: 0, end: seconds, framing: 'original', rotation: 0, flip: false, volume: 1,
    brightness: 100, contrast: 100, saturation: 100, background: '#090611', fade: false, text: [],
  };
}

export function videoEditDimensions(width: number, height: number, edit: VideoEdit, maxEdge: number) {
  if (edit.rotation % 180 !== 0) [width, height] = [height, width];
  const ratios = { portrait: 9 / 16, square: 1, landscape: 16 / 9 };
  const ratio = edit.framing === 'original' ? width / height : ratios[edit.framing];
  const cropWidth = Math.min(width, height * ratio);
  const cropHeight = cropWidth / ratio;
  const scale = Math.min(1, maxEdge / Math.max(cropWidth, cropHeight));
  const outputWidth = cropWidth * scale;
  return {
    width: Math.max(2, Math.floor(outputWidth / 2) * 2),
    height: Math.max(2, Math.floor(outputWidth / ratio / 2) * 2),
  };
}

type FrameContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;

export function paintEditFrame(
  ctx: FrameContext, sourceWidth: number, sourceHeight: number, edit: VideoEdit, time: number,
  draw: (x: number, y: number, width: number, height: number) => void,
) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = edit.background;
  ctx.fillRect(0, 0, width, height);
  const rotated = edit.rotation % 180 !== 0;
  const scale = Math.max((rotated ? height : width) / sourceWidth, (rotated ? width : height) / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(edit.flip ? -1 : 1, 1);
  ctx.rotate(edit.rotation * Math.PI / 180);
  if (edit.fade) ctx.globalAlpha = Math.max(0, Math.min(1, (time - edit.start) / .45, (edit.end - time) / .45));
  ctx.filter = `brightness(${edit.brightness}%) contrast(${edit.contrast}%) saturate(${edit.saturation}%)`;
  draw(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();

  if (edit.effect === 'vignette') {
    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .18, width / 2, height / 2, Math.hypot(width, height) * .48);
    vignette.addColorStop(0, '#0000');
    vignette.addColorStop(1, '#170526c4');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }
  if (edit.effect === 'sparkle') {
    ctx.save();
    ctx.fillStyle = '#ffe0f9';
    for (let i = 0; i < 9; i++) {
      const x = width * ((i * .371 + .13) % 1);
      const y = height * ((i * .217 + .11) % 1);
      const pulse = .5 + .5 * Math.sin(time * 3 + i * 1.6);
      const radius = Math.min(width, height) * (.008 + pulse * .017);
      ctx.globalAlpha = .2 + pulse * .75;
      paintStar(ctx, x, y, radius);
    }
    ctx.restore();
  }

  const lanes = { top: .18, center: .5, bottom: .8 };
  for (const layer of edit.text) {
    if (!layer.text.trim() || time < layer.start || time >= layer.end) continue;
    const elapsed = time - layer.start;
    const theme = textThemes[layer.theme];
    const pieces = layer.motion === 'typing'
      ? (graphemes ? Array.from(graphemes.segment(layer.text), item => item.segment) : Array.from(layer.text))
      : [];
    const message = layer.motion === 'typing' ? pieces.slice(0, Math.ceil(pieces.length * Math.min(1, elapsed / Math.min(1.4, (layer.end - layer.start) * .65)))).join('') : layer.text;
    if (!message) continue;
    const size = Math.max(8, Math.round(Math.min(width, height) * .063));
    const padding = size * .48;
    const maxWidth = width * .88;
    ctx.save();
    if (layer.motion === 'fade') ctx.globalAlpha = Math.min(1, elapsed / .28, (layer.end - time) / .22);
    ctx.translate(width / 2, height * lanes[layer.position]);
    if (layer.motion === 'slide') ctx.translate(-width * .24 * Math.max(0, 1 - elapsed / .35) ** 2, 0);
    if (layer.motion === 'bounce') ctx.translate(0, -height * .09 * Math.abs(Math.cos(elapsed * 16)) * Math.exp(-elapsed * 7));
    if (layer.motion === 'zoom') {
      const scale = .65 + .35 * Math.min(1, elapsed / .4);
      ctx.scale(scale, scale);
    }
    if (layer.motion === 'pop') {
      const pop = 1 - .2 * Math.exp(-elapsed * 9) * Math.cos(elapsed * 19);
      ctx.scale(pop, pop);
    }
    if (layer.kind === 'sticker') {
      ctx.font = `700 ${size * 2.3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.foreground;
      ctx.fillText(message, 0, 0, maxWidth);
      ctx.restore();
      continue;
    }
    ctx.font = `700 ${size}px Arial, "Noto Sans Telugu", "Nirmala UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rows: string[] = [];
    for (const line of message.split('\n')) {
      let row = '';
      for (const word of line.split(/\s+/)) {
        const next = row ? `${row} ${word}` : word;
        if (row && ctx.measureText(next).width > maxWidth - padding * 2) {
          rows.push(row);
          row = word;
        } else {
          row = next;
        }
      }
      rows.push(row);
    }
    const lineHeight = size * 1.3;
    const boxWidth = Math.min(maxWidth, Math.max(...rows.map(row => ctx.measureText(row).width)) + padding * 2);
    const boxHeight = rows.length * lineHeight + padding;
    const gradient = ctx.createLinearGradient(-boxWidth / 2, 0, boxWidth / 2, 0);
    gradient.addColorStop(0, theme.background);
    gradient.addColorStop(1, theme.accent);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, padding);
    ctx.fill();
    if (layer.theme === 'Neon' || layer.theme === 'Glass' || layer.theme === 'Quote') {
      ctx.strokeStyle = layer.theme === 'Glass' ? '#c8e7ff' : '#fa8cff';
      ctx.lineWidth = Math.max(1, size * .06);
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = size * .32;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = theme.foreground;
    rows.forEach((row, i) => ctx.fillText(row, 0, (i - (rows.length - 1) / 2) * lineHeight, boxWidth - padding * 2));
    ctx.restore();
  }
}

function paintStar(ctx: FrameContext, x: number, y: number, radius: number) {
  ctx.beginPath();
  for (let point = 0; point < 8; point++) {
    const angle = point * Math.PI / 4;
    const edge = point % 2 ? radius * .22 : radius;
    ctx.lineTo(x + Math.cos(angle) * edge, y + Math.sin(angle) * edge);
  }
  ctx.closePath();
  ctx.fill();
}

export function parseSubtitles(content: string, duration: number): EditText[] {
  const clock = (value: string) => {
    const parts = value.trim().replace(',', '.').split(':').map(Number);
    return parts.reduce((seconds, part) => seconds * 60 + part, 0);
  };
  return content.trim().split(/\r?\n\s*\r?\n/).flatMap((block, index): EditText[] => {
    const lines = block.split(/\r?\n/);
    const timing = lines.findIndex(line => line.includes('-->'));
    if (timing < 0) return [];
    const match = lines[timing].match(/((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})/);
    if (!match) return [];
    const start = clock(match[1]);
    const end = Math.min(duration, clock(match[2]));
    const text = lines.slice(timing + 1).join('\n').replace(/<[^>]*>/g, '').trim().slice(0, 240);
    if (!text || start >= end) return [];
    return [{ id: `sub-${index}`, text, start, end, theme: 'Clean', position: 'bottom', motion: 'still', kind: 'caption' }];
  });
}
