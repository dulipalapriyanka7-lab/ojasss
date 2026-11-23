import { ArrowLeft, ArrowRight, Captions, Check, Crop, Film, Flame, Layers, Maximize, Music2, Pause, Play, RotateCcw, Scissors, SlidersHorizontal, Smile, Sparkles, Type, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { exportVideoEdit, loadAudioPeaks } from '@/lib/exportVideoEdit';
import { editLooks, initialVideoEdit, keptSeconds, paintEditFrame, parseSubtitles, textThemes, videoEditDimensions, type EditText, type VideoEdit } from '@/lib/videoEdit';
import './video-edit-studio.css';

type StudioSource = { file: File; previewUrl: string; width: number; height: number; durationMs: number };
type Props = {
  source: StudioSource;
  edit: VideoEdit;
  update: (edit: VideoEdit) => void;
  sourceLabel: string;
  maxBytes: number;
  onBack: () => void;
  onSave?: () => Promise<void>;
  onNext: (file: File, quality: 'hd' | 'fast' | null) => Promise<void>;
};

const tools = [
  { id: 'templates', name: 'Templates', Icon: Layers }, { id: 'trim', name: 'Trim', Icon: Scissors }, { id: 'captions', name: 'Captions', Icon: Captions },
  { id: 'text', name: 'Text', Icon: Type }, { id: 'frame', name: 'Frame', Icon: Crop },
  { id: 'color', name: 'Color', Icon: SlidersHorizontal }, { id: 'effects', name: 'Effects', Icon: Sparkles },
  { id: 'stickers', name: 'Stickers', Icon: Smile }, { id: 'audio', name: 'Audio', Icon: Music2 },
  { id: 'themes', name: 'Themes', Icon: Layers },
] as const;

const templateGroups = ['All', 'Business', 'Promo', 'Reels', 'Quotes', 'News'] as const;
const templates = [
  { name: 'Typing Text', sample: 'Typing Text|', group: 'Reels', theme: 'Clean', motion: 'typing', position: 'center' },
  { name: 'Highlight Title', sample: 'Highlight Title', group: 'Reels', theme: 'Highlight', motion: 'bounce', position: 'center' },
  { name: 'Business Intro', sample: 'Business Intro', group: 'Business', theme: 'Spotlight', motion: 'slide', position: 'bottom' },
  { name: 'Lower Third', sample: 'Lower Third', group: 'News', theme: 'LowerThird', motion: 'slide', position: 'bottom' },
  { name: 'Quote Style', sample: '“ Your quote ”', group: 'Quotes', theme: 'Quote', motion: 'fade', position: 'center' },
  { name: 'Sale Offer', sample: 'SALE · 50% OFF', group: 'Promo', theme: 'Offer', motion: 'pop', position: 'center' },
  { name: 'Gradient Text', sample: 'Gradient Text', group: 'Reels', theme: 'Gradient', motion: 'zoom', position: 'center' },
  { name: 'Glass Overlay', sample: 'Glass Overlay', group: 'Business', theme: 'Glass', motion: 'fade', position: 'bottom' },
  { name: 'Neon Glow', sample: 'Neon Glow', group: 'Promo', theme: 'Neon', motion: 'pop', position: 'center' },
] as const satisfies readonly { name: string; sample: string; group: typeof templateGroups[number]; theme: EditText['theme']; motion: EditText['motion']; position: EditText['position'] }[];

const animations = [
  ['typing', 'Typing'], ['fade', 'Fade'], ['slide', 'Slide'], ['pop', 'Pop'], ['bounce', 'Bounce'], ['zoom', 'Zoom'], ['still', 'None'],
] as const;

function templateText(template: typeof templates[number]) {
  if (template.name === 'Business Intro') return 'మీ వ్యాపారాన్ని\nఆన్‌లైన్‌లో పెంచుకోండి!';
  return template.sample.replace(/\|$/, '');
}

function timeLabel(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function thumbnailsFor(url: string, seconds: number, onFrames: (frames: string[]) => void) {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 56;
  const context = canvas.getContext('2d');
  const frames: string[] = [];
  const count = 8;
  const seek = () => { video.currentTime = seconds * (frames.length + .5) / count; };
  const capture = () => {
    if (!context || !video.videoWidth) return;
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    frames.push(canvas.toDataURL('image/jpeg', .66));
    if (frames.length < count) seek();
    else onFrames(frames);
  };
  video.preload = 'auto';
  video.muted = true;
  video.onloadeddata = seek;
  video.onseeked = capture;
  video.src = url;
  return () => {
    video.onloadeddata = null;
    video.onseeked = null;
    video.removeAttribute('src');
    video.load();
  };
}

function Range({ label, value, min, max, step = 1, suffix = '', change }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; change: (value: number) => void;
}) {
  return <label className="edit-studio-range"><span>{label}<output>{Number(value.toFixed(2))}{suffix}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={event => change(event.currentTarget.valueAsNumber)} /></label>;
}

export default function VideoEditStudio({ source, edit, update, sourceLabel, maxBytes, onBack, onSave, onNext }: Props) {
  const seconds = source.durationMs / 1000;
  const [tool, setTool] = useState<typeof tools[number]['id']>('templates');
  const [group, setGroup] = useState<typeof templateGroups[number]>('All');
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [previewMuted, setPreviewMuted] = useState(false);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [time, setTime] = useState(edit.start);
  const [playing, setPlaying] = useState(false);
  const [edge, setEdge] = useState(1920);
  const [error, setError] = useState('');
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const exporting = progress !== null;
  const [layerId, setLayerId] = useState('');
  const [cutFrom, setCutFrom] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionsRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<AbortController | null>(null);
  const liveEdit = useRef(edit);
  liveEdit.current = edit;
  const changed = JSON.stringify(edit) !== JSON.stringify(initialVideoEdit(seconds));
  const size = videoEditDimensions(source.width, source.height, edit, 640);
  const visibleLayers = edit.text.filter(item => tool === 'captions' ? item.kind === 'caption' : tool === 'stickers' ? item.kind === 'sticker' : !item.kind || item.kind === 'text');
  const selected = visibleLayers.find(item => item.id === layerId) ?? visibleLayers[0];
  const patch = (value: Partial<VideoEdit>) => {
    setDraftStatus('idle');
    update({ ...edit, ...value });
  };
  const patchText = (value: Partial<EditText>) => {
    if (selected) patch({ text: edit.text.map(item => item.id === selected.id ? { ...item, ...value } : item) });
  };

  useEffect(() => {
    document.body.classList.add('video-edit-open');
    return () => {
      document.body.classList.remove('video-edit-open');
      exportRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    // Load a single contact sheet without competing with the first preview frame.
    let cleanup: (() => void) | undefined;
    const timer = window.setTimeout(() => { cleanup = thumbnailsFor(source.previewUrl, seconds, setFrames); }, 600);
    return () => { clearTimeout(timer); cleanup?.(); };
  }, [source.previewUrl, seconds]);

  useEffect(() => {
    if (exporting) return;
    let stop: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      try { stop = loadAudioPeaks(source.file, seconds, setPeaks); } catch { setPeaks(null); }
    }, 850);
    return () => { clearTimeout(timer); stop?.(); };
  }, [source.file, seconds, exporting]);

  function draw() {
    const video = videoRef.current;
    const context = canvasRef.current?.getContext('2d');
    if (!video || !context || video.readyState < 2) return;
    paintEditFrame(context, video.videoWidth, video.videoHeight, liveEdit.current, video.currentTime, (...args) => context.drawImage(video, ...args));
  }

  useEffect(() => {
    draw();
    const video = videoRef.current;
    if (video) {
      video.volume = edit.volume;
      video.muted = previewMuted || edit.volume === 0;
    }
  }, [edit, size.width, size.height, previewMuted]);

  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.currentTime >= liveEdit.current.end) {
        video.pause();
        return;
      }
      const cut = liveEdit.current.cuts?.find(c => video.currentTime >= c.start && video.currentTime < c.end);
      if (cut) video.currentTime = cut.end;
      setTime(video.currentTime);
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    setTime(seconds);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (video.currentTime < edit.start || video.currentTime >= edit.end - .04) seek(edit.start);
    try { await video.play(); } catch { setError('The preview could not play. Try selecting the video again.'); }
  }

  function setTrim(boundary: 'start' | 'end', value: number) {
    const gap = Math.min(.25, seconds);
    const adjusted = boundary === 'start' ? Math.max(0, Math.min(value, edit.end - gap)) : Math.min(seconds, Math.max(value, edit.start + gap));
    patch({ [boundary]: adjusted });
    videoRef.current?.pause();
    seek(boundary === 'start' ? adjusted : Math.max(edit.start, adjusted - .04));
  }

  function dragTrim(event: PointerEvent<HTMLButtonElement>, boundary: 'start' | 'end') {
    const track = filmstripRef.current?.getBoundingClientRect();
    if (!track?.width) return;
    setTrim(boundary, Math.round((event.clientX - track.left) / track.width * seconds * 100) / 100);
  }

  function addText(preset: Partial<EditText> = {}) {
    const start = Math.min(Math.max(edit.start, time), Math.max(edit.start, edit.end - .25));
    const layer: EditText = { id: crypto.randomUUID(), text: '', start, end: Math.min(edit.end, start + 4), theme: 'Spotlight', position: 'bottom', motion: 'fade', kind: tool === 'captions' ? 'caption' : 'text', ...preset };
    if (layer.end <= layer.start) return;
    patch({ text: [...edit.text, layer] });
    setLayerId(layer.id);
    seek(preset.template ? Math.min(layer.end - .01, start + .4) : start);
  }

  function applyTemplate(template: typeof templates[number]) {
    const value = { template: template.name, theme: template.theme, motion: template.motion, position: template.position };
    const text = templateText(template);
    if (selected?.template && time >= selected.start && time < selected.end) {
      const previous = templates.find(item => item.name === selected.template);
      patchText({ ...value, text: previous && selected.text === templateText(previous) ? text : selected.text });
      seek(Math.min(selected.end - .01, selected.start + .4));
    } else {
      addText({ ...value, text });
    }
  }

  async function importCaptions(file?: File) {
    if (!file) return;
    setError('');
    try {
      if (file.size > 256 * 1024) throw new Error('Choose a subtitle file under 256 KB.');
      const parsed = parseSubtitles(await file.text(), seconds);
      if (!parsed.length) throw new Error('No timed captions found. Choose an SRT or WebVTT file for this video.');
      const captions = parsed.map(layer => ({ ...layer, id: crypto.randomUUID() }));
      update({ ...liveEdit.current, text: [...liveEdit.current.text, ...captions] });
      setLayerId(captions[0].id);
      seek(captions[0].start);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read these captions.');
    }
  }

  async function next() {
    if (exportRef.current) return;
    videoRef.current?.pause();
    setError('');
    const controller = new AbortController();
    exportRef.current = controller;
    setProgress(0);
    try {
      const hasEdits = JSON.stringify({ ...edit, text: edit.text.filter(layer => layer.text.trim()) }) !== JSON.stringify(initialVideoEdit(seconds));
      const rendered = hasEdits || edge === 1280;
      const output = rendered ? await exportVideoEdit(source.file, edit, source.width, source.height, maxBytes, edge, controller.signal, value => setProgress(current => Math.max(current ?? 0, Math.min(.99, value)))) : source.file;
      if (!controller.signal.aborted) {
        setProgress(1);
        await onNext(output, rendered ? edge === 1280 ? 'fast' : 'hd' : null);
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not prepare this video.');
    } finally {
      exportRef.current = null;
      setProgress(null);
    }
  }

  return <section className="edit-studio" aria-label="OJASSS Edit Studio">
    <header className="edit-studio-header">
      <button type="button" className="edit-studio-button" onClick={onBack} disabled={progress !== null}><ArrowLeft size={17} /><span>Back</span></button>
      <h1><Film size={17} aria-hidden /> OJASSS Edit</h1>
      <button type="button" className="edit-studio-button edit-studio-primary" onClick={() => void next()} disabled={progress !== null}>Next <ArrowRight size={16} /></button>
    </header>
    <div className="edit-studio-body">
      <div className="edit-studio-workspace">
        <aside className="edit-studio-tools" aria-label="Editing tools">
          {tools.map(({ id, name, Icon }) => <button type="button" key={id} aria-pressed={tool === id} disabled={progress !== null} onClick={() => setTool(id)}><Icon size={17} aria-hidden />{name}</button>)}
        </aside>
        <div className="edit-studio-preview">
          <div className="edit-studio-stage" ref={stageRef}>
            <div className="edit-studio-preview-top"><span><Flame size={16} /> OJASSS</span><span>{sourceLabel} · {size.width > size.height ? 'Landscape' : size.width === size.height ? '1:1' : 'Portrait'}</span><button type="button" aria-label="Expand preview" onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void stageRef.current?.requestFullscreen?.().catch(() => setError('Fullscreen is unavailable on this device.'));
            }}><Maximize size={15} /></button></div>
            <video ref={videoRef} src={source.previewUrl} preload="auto" playsInline aria-hidden className="edit-studio-source"
              onLoadedData={() => { seek(edit.start); draw(); }} onSeeked={draw} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
              onError={() => setError('This video could not be decoded for editing.')} />
            <button type="button" className="edit-studio-canvas" onClick={() => void togglePlayback()} aria-label={playing ? 'Pause preview' : 'Play preview'} disabled={progress !== null}>
              <canvas ref={canvasRef} width={size.width} height={size.height} />
              {!playing && <span className="edit-studio-play-overlay"><Play size={19} fill="currentColor" /></span>}
            </button>
          </div>
          <div className="edit-studio-playback">
            <button type="button" className="edit-studio-button" onClick={() => void togglePlayback()} aria-label={playing ? 'Pause' : 'Play'} disabled={progress !== null}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <div className="edit-studio-position"><span>{timeLabel(time)} <span className="edit-studio-muted">/ {timeLabel(seconds)}</span></span><input type="range" aria-label="Preview position" min={0} max={seconds} step="any" value={time} onChange={event => seek(event.currentTarget.valueAsNumber)} disabled={progress !== null} /></div>
            <button type="button" className="edit-studio-button" aria-label={previewMuted ? 'Unmute preview' : 'Mute preview'} onClick={() => setPreviewMuted(value => !value)} disabled={progress !== null}>{previewMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
            <label className="edit-studio-quality"><span>Export</span><select aria-label="Export resolution" value={edge} disabled={progress !== null} onChange={event => setEdge(Number(event.currentTarget.value))}><option value={1920}>HD 1080p</option><option value={1280}>Fast 720p</option></select></label>
          </div>
        </div>
        <fieldset className="edit-studio-inspector" disabled={progress !== null}>
          <legend className="sr-only">Tool settings</legend>
          <div className="edit-studio-inspector-title"><h2>{tools.find(item => item.id === tool)?.name}</h2>{changed && <button type="button" className="edit-studio-button" onClick={() => { update(initialVideoEdit(seconds)); seek(0); }}><RotateCcw size={14} /> Reset all</button>}</div>
          {['templates', 'effects', 'color', 'themes'].includes(tool) && <div className="edit-studio-panel-tabs" aria-label="Design panels">
            {([['templates', 'Text Templates'], ['effects', 'Effects'], ['color', 'Filters'], ['themes', 'Themes']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={tool === value} onClick={() => setTool(value)}>{label}</button>)}
          </div>}
          {tool === 'templates' && <>
            <div className="edit-studio-groups" aria-label="Template categories">{templateGroups.map(name => <button type="button" key={name} aria-pressed={group === name} onClick={() => setGroup(name)}>{name}</button>)}</div>
            <div className="edit-studio-template-grid">{templates.filter(item => group === 'All' || item.group === group).map(template => <button type="button" key={template.name} data-style={template.theme} aria-label={template.name} aria-pressed={selected?.template === template.name} onClick={() => applyTemplate(template)}><strong>{template.sample}</strong><span><Play size={10} fill="currentColor" /></span></button>)}</div>
            {selected && <div className="edit-studio-animation"><h3>Text animation</h3><div>{animations.map(([value, label]) => <button type="button" key={value} aria-pressed={selected.motion === value} onClick={() => patchText({ motion: value })}><b aria-hidden="true">{value === 'typing' ? 'T|' : 'Aa'}</b>{label}</button>)}</div></div>}
            {selected && <div className="edit-studio-animation edit-studio-text-styles"><h3>Text style</h3><div>
              {(['Clean', 'Highlight', 'Gradient', 'Glass', 'Neon'] as const).map(theme => <button type="button" key={theme} aria-label={theme + ' text style'} aria-pressed={selected.theme === theme} style={{ color: textThemes[theme].foreground, background: `linear-gradient(120deg,${textThemes[theme].background},${textThemes[theme].accent})` }} onClick={() => patchText({ theme })}><b>Aa</b></button>)}
            </div></div>}
          </>}
          {tool === 'themes' && <div className="edit-studio-template-grid">
            {([
              { name: 'Night Cinema', look: editLooks.Cinema, effect: 'vignette', theme: 'Neon' },
              { name: 'Neon Reels', look: editLooks.Vivid, effect: 'sparkle', theme: 'Gradient' },
              { name: 'Soft Portrait', look: editLooks.Soft, effect: undefined, theme: 'Glass' },
            ] as const).map(({ name, look: [brightness, contrast, saturation], effect, theme }) => <button type="button" key={name} data-style={theme}
              aria-pressed={edit.effect === effect && edit.brightness === brightness && edit.contrast === contrast && edit.saturation === saturation}
              onClick={() => patch({ brightness, contrast, saturation, effect })}><strong>{name}</strong></button>)}
          </div>}
          {tool === 'effects' && <div className="edit-studio-options">
            <button type="button" aria-pressed={!edit.effect} onClick={() => { const { effect: _effect, ...base } = edit; update(base); }}>None</button>
            <button type="button" aria-pressed={edit.effect === 'sparkle'} onClick={() => patch({ effect: 'sparkle' })}><Sparkles size={15} /> Star Sparkle</button>
            <button type="button" aria-pressed={edit.effect === 'vignette'} onClick={() => patch({ effect: 'vignette' })}>Vignette</button>
            <button type="button" aria-pressed={edit.fade} onClick={() => patch({ fade: !edit.fade })}>Fade in and out</button>
          </div>}
          {tool === 'stickers' && <div className="edit-studio-options edit-studio-stickers">
            {([['✦', 'Star'], ['♥', 'Heart'], ['✓', 'Check'], ['✧', 'Sparkle'], ['↗', 'Arrow']] as const).map(([text, label]) => <button type="button" key={label} aria-label={label + ' sticker'} onClick={() => addText({ text, kind: 'sticker', theme: 'Highlight', motion: 'pop', position: 'top' })}>{text}</button>)}
          </div>}
          {tool === 'trim' && <>
            <Range label="Start" value={edit.start} min={0} max={Math.max(0, edit.end - Math.min(.25, seconds))} step={.01} suffix=" s" change={start => setTrim('start', start)} />
            <Range label="End" value={edit.end} min={Math.min(seconds, edit.start + Math.min(.25, seconds))} max={seconds} step={.01} suffix=" s" change={end => setTrim('end', end)} />
            <div className="edit-studio-options">
              <button type="button" onClick={() => setTrim('start', time)}>Set start here</button>
              <button type="button" onClick={() => setTrim('end', time)}>Set end here</button>
            </div>
            <h3 className="edit-studio-cut-title">Cut out a middle part</h3>
            <div className="edit-studio-options">
              {cutFrom === null ? <button type="button" onClick={() => setCutFrom(time)}><Scissors size={13} /> Cut from {timeLabel(time)}</button>
                : <><button type="button" aria-pressed="true" disabled={time - cutFrom < .1} onClick={() => { const c = { start: Math.min(cutFrom, time), end: Math.max(cutFrom, time) }; patch({ cuts: [...(edit.cuts ?? []), c].sort((a, b) => a.start - b.start) }); setCutFrom(null); seek(c.end); }}>Cut to {timeLabel(time)}</button><button type="button" onClick={() => setCutFrom(null)}>Cancel</button></>}
            </div>
            {cutFrom !== null && <p className="edit-studio-cut-hint">Move the timeline to where the cut should end, then tap “Cut to”.</p>}
            {!!edit.cuts?.length && <div className="edit-studio-options">{edit.cuts.map((c, i) => <button type="button" key={i} onClick={() => patch({ cuts: edit.cuts!.filter((_, j) => j !== i) })}>{timeLabel(c.start)}–{timeLabel(c.end)} <X size={12} /></button>)}</div>}
            <label className="edit-studio-toggle"><input type="checkbox" checked={edit.fade} onChange={event => patch({ fade: event.currentTarget.checked })} /> Fade in and out</label>
          </>}
          {tool === 'frame' && <>
            <div className="edit-studio-options">{(['original', 'portrait', 'square', 'landscape'] as const).map((framing, i) => <button type="button" key={framing} aria-pressed={edit.framing === framing} onClick={() => patch({ framing })}>{['Original', '9:16', '1:1', '16:9'][i]}</button>)}</div>
            <div className="edit-studio-options"><button type="button" onClick={() => patch({ rotation: (edit.rotation + 90) % 360 })}>Rotate 90°</button><button type="button" aria-pressed={edit.flip} onClick={() => patch({ flip: !edit.flip })}>Flip horizontally</button></div>
            <label className="edit-studio-toggle">Fade background <input type="color" value={edit.background} onChange={event => patch({ background: event.currentTarget.value })} /></label>
          </>}
          {tool === 'color' && <>
            <div className="edit-studio-options">{Object.entries(editLooks).map(([name, [brightness, contrast, saturation]]) => <button type="button" key={name} aria-pressed={edit.brightness === brightness && edit.contrast === contrast && edit.saturation === saturation} onClick={() => patch({ brightness, contrast, saturation })}>{name}</button>)}</div>
            {(['brightness', 'contrast', 'saturation'] as const).map(key => <Range key={key} label={key[0].toUpperCase() + key.slice(1)} value={edit[key]} min={key === 'saturation' ? 0 : 50} max={180} suffix="%" change={value => patch({ [key]: value })} />)}
          </>}
          {tool === 'audio' && <><Range label="Original sound" value={Math.round(edit.volume * 100)} min={0} max={100} suffix="%" change={volume => patch({ volume: volume / 100 })} /><div className="edit-studio-options"><button type="button" onClick={() => patch({ volume: edit.volume ? 0 : 1 })}>{edit.volume ? 'Mute audio' : 'Restore audio'}</button></div></>}
          {(tool === 'text' || tool === 'captions' || (tool === 'templates' && !!selected) || tool === 'stickers') && <>
            <div className="edit-studio-options">{(tool === 'text' || tool === 'captions') && <button type="button" onClick={() => addText()}>Add {tool === 'captions' ? 'caption' : 'text'}</button>}{tool === 'captions' && <button type="button" onClick={() => captionsRef.current?.click()}>Import SRT or VTT</button>}</div>
            <input ref={captionsRef} type="file" accept=".srt,.vtt" hidden onChange={event => { void importCaptions(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
            {selected && <>
              <label className="edit-studio-field">Text layer<select value={selected.id} onChange={event => {
                const layer = edit.text.find(item => item.id === event.currentTarget.value);
                if (layer) { setLayerId(layer.id); seek(layer.start); }
              }}>{visibleLayers.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.text.slice(0, 34) || 'Untitled text'}</option>)}</select></label>
              <label className="edit-studio-field">Text<textarea maxLength={240} rows={2} value={selected.text} onChange={event => patchText({ text: event.currentTarget.value })} /></label>
              <div className="edit-studio-fields">
                <label className="edit-studio-field">Start (s)<input type="number" step=".1" min={0} max={selected.end - .05} key={`${selected.id}-start`} defaultValue={selected.start.toFixed(2)} onBlur={event => {
                  const start = Math.min(Math.max(0, event.currentTarget.valueAsNumber || 0), selected.end - .05);
                  event.currentTarget.value = start.toFixed(2);
                  patchText({ start }); seek(start);
                }} /></label>
                <label className="edit-studio-field">End (s)<input type="number" step=".1" min={selected.start + .05} max={seconds} key={`${selected.id}-end`} defaultValue={selected.end.toFixed(2)} onBlur={event => {
                  const end = Math.min(seconds, Math.max(selected.start + .05, event.currentTarget.valueAsNumber || selected.end));
                  event.currentTarget.value = end.toFixed(2);
                  patchText({ end });
                }} /></label>
              </div>
              <label className="edit-studio-field">Template<select value={selected.theme} onChange={event => patchText({ theme: event.currentTarget.value as EditText['theme'] })}>{Object.keys(textThemes).map(theme => <option key={theme}>{theme}</option>)}</select></label>
              <div className="edit-studio-fields">
                <label className="edit-studio-field">Position<select value={selected.position} onChange={event => patchText({ position: event.currentTarget.value as EditText['position'] })}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
                <label className="edit-studio-field">Animation<select value={selected.motion} onChange={event => patchText({ motion: event.currentTarget.value as EditText['motion'] })}>{animations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <button type="button" className="edit-studio-button" onClick={() => patch({ text: edit.text.filter(item => item.id !== selected.id) })}><X size={14} /> Remove text</button>
            </>}
          </>}
        </fieldset>
      </div>
      <div className="edit-studio-timeline">
        <div className="edit-studio-timeline-title"><button type="button" className="edit-studio-button" onClick={() => setTool('trim')}><Scissors size={15} /> Trim clip</button><strong>{timeLabel(edit.start)} – {timeLabel(edit.end)}</strong><span>{keptSeconds(edit).toFixed(2)} s kept</span></div>
        <div className="edit-studio-ruler">{[0, .2, .4, .6, .8, 1].map(fraction => <span key={fraction}>{timeLabel(seconds * fraction)}</span>)}</div>
        <div className="edit-studio-filmstrip" ref={filmstripRef}>
          {frames.map((frame, index) => <img key={index} src={frame} alt="" draggable={false} />)}
          <div className="edit-studio-selection" style={{ left: `${edit.start / seconds * 100}%`, right: `${(1 - edit.end / seconds) * 100}%` }} />
          {edit.cuts?.map((c, i) => <div key={i} className="edit-studio-cut" style={{ left: `${c.start / seconds * 100}%`, width: `${(c.end - c.start) / seconds * 100}%` }} />)}
          {cutFrom !== null && <div className="edit-studio-cut is-pending" style={{ left: `${Math.min(cutFrom, time) / seconds * 100}%`, width: `${Math.abs(time - cutFrom) / seconds * 100}%` }} />}
          <div className="edit-studio-playhead" style={{ left: `${Math.min(99.7, time / seconds * 100)}%` }} />
          <input type="range" aria-label="Seek video" min={0} max={seconds} step="any" value={time} disabled={progress !== null} onChange={event => seek(event.currentTarget.valueAsNumber)} />
          {(['start', 'end'] as const).map(boundary => <button type="button" key={boundary} role="slider" aria-label={boundary === 'start' ? 'Trim start handle' : 'Trim end handle'} aria-valuemin={boundary === 'start' ? 0 : Math.min(seconds, edit.start + .25)} aria-valuemax={boundary === 'start' ? Math.max(0, edit.end - .25) : seconds} aria-valuenow={edit[boundary]} className="edit-studio-handle" data-boundary={boundary} disabled={progress !== null}
            style={{ left: `clamp(11px, ${edit[boundary] / seconds * 100}%, calc(100% - 11px))` }}
            onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) dragTrim(event, boundary); }}
            onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setTrim(boundary, Number((edit[boundary] + (event.key === 'ArrowLeft' ? -.1 : .1)).toFixed(2))); } }}><span /></button>)}
        </div>
        <div className="edit-studio-track"><button type="button" onClick={() => setTool('audio')}><Music2 size={16} /> Original audio</button><div className="edit-studio-track-lane">{peaks && <div className="edit-studio-waveform" aria-label="Original audio waveform" style={{ opacity: edit.volume ? 1 : .3 }}>{peaks.map((peak, index) => <i key={index} style={{ height: `${Math.max(7, peak * 100)}%` }} />)}</div>}</div><span>{Math.round(edit.volume * 100)}%</span></div>
        {([['caption', 'Captions', Captions], ['text', 'Text', Type], ['sticker', 'Stickers', Smile]] as const).map(([kind, label, Icon]) => {
          const items = edit.text.filter(layer => (layer.kind ?? 'text') === kind && layer.text.trim());
          if (!items.length) return null;
          return <div className="edit-studio-track" key={kind}><button type="button" onClick={() => setTool(kind === 'caption' ? 'captions' : kind === 'sticker' ? 'stickers' : 'text')}><Icon size={16} /> {label}</button>
            <div className="edit-studio-track-lane">{items.map(layer => <button type="button" title={layer.text} key={layer.id} onClick={() => { setTool(kind === 'caption' ? 'captions' : kind === 'sticker' ? 'stickers' : 'text'); setLayerId(layer.id); seek(layer.start); }} style={{ left: `${layer.start / seconds * 100}%`, width: `${(layer.end - layer.start) / seconds * 100}%` }}>{layer.text}</button>)}</div>
          </div>;
        })}
      </div>
      <nav className="edit-studio-dock" aria-label="Editor shortcuts">{tools.map(({ id, name, Icon }) => <button type="button" key={id} aria-pressed={tool === id} disabled={progress !== null} onClick={() => setTool(id)}><Icon size={19} />{name}</button>)}</nav>
      {error && <p role="alert" className="edit-studio-error">{error}</p>}
      <footer className="edit-studio-footer"><span>{changed ? <><Check size={14} /> Edits ready to export</> : <><Sparkles size={14} /> Video ready</>}</span>{onSave && <button type="button" className="edit-studio-button" disabled={draftStatus === 'saving' || progress !== null} onClick={async () => {
        setDraftStatus('saving');
        setError('');
        try {
          await onSave();
          setDraftStatus('saved');
        } catch {
          setDraftStatus('idle');
          setError('Could not save the draft on this device. Check available storage and try again.');
        }
      }}>{draftStatus === 'saved' ? 'Draft saved' : draftStatus === 'saving' ? 'Saving…' : 'Save draft'}</button>}</footer>
    </div>
    {progress !== null && <div className="edit-studio-export" role="dialog" aria-modal="true" aria-label="Video export"><div role="status"><div className="edit-studio-export-stars" aria-hidden="true"><i /><i /><i /><i /><i /></div><strong>{progress < 1 && (changed || edge === 1280) ? 'Exporting your video' : 'Preparing post details'}</strong><progress aria-label="Video export progress" max={1} value={progress} /><span>{Math.round(progress * 100)}%</span>{progress < 1 && <button className="edit-studio-button" onClick={() => exportRef.current?.abort()}>Cancel export</button>}</div></div>}
  </section>;
}


