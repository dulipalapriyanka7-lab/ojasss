import { Coins, Skull, Users, Waves } from 'lucide-react';
import { Settings } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { GraphicsQuality, HillOfDoom, Hud } from '@/game/HillOfDoom';
import { cn } from '@/lib/utils';

// OJASSS Monster Fight — in-match HUD: compass and objective on top, map and objectives on the
// right, weapon cards and health at the bottom, round icon controls under the thumbs.

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// ---------------------------------------------------------------- icons (24x24, currentColor)
// Slim line icons (24x24, 1.6px round strokes, currentColor) drawn with real human proportions.
const Clock = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4.2l2.6 1.6M9.5 2.5h5" /></svg>;
const Target = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /></svg>;
const Pin = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.2" /></svg>;
const L = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const I = {
  // Rifle cartridge.
  bullet: <svg viewBox="0 0 24 24" {...L}><path d="M9.5 21h5M9.5 19h5v2h-5zM9.8 19V11.5h4.4V19M10.4 11.5V9.8c0-2.6.7-5 1.6-6.8.9 1.8 1.6 4.2 1.6 6.8v1.7" /><path d="M9.8 14h4.4" opacity=".5" /></svg>,
  // Target an opponent: reticle over a head-and-shoulders silhouette.
  aim: <svg viewBox="0 0 24 24" {...L}><circle cx="12" cy="9.2" r="2.6" /><path d="M6.8 18.6c.6-3 2.7-4.8 5.2-4.8s4.6 1.8 5.2 4.8" /><path d="M12 1.8v3M12 19.4v2.8M1.8 12h3M19.2 12h3" /><circle cx="12" cy="12" r="9" opacity=".55" /></svg>,
  // Scope zoom: magnifier lens with a crosshair.
  scope: <svg viewBox="0 0 24 24" {...L}><circle cx="10.4" cy="10.4" r="6.6" /><path d="M10.4 6.6v7.6M6.6 10.4h7.6" opacity=".8" /><path d="m15.3 15.3 5.2 5.2" strokeWidth="2.4" /></svg>,
  // Jump: athlete leaping with an upward motion arrow.
  jump: <svg viewBox="0 0 24 24" {...L}><circle cx="13.6" cy="3.6" r="1.8" /><path d="M13.2 6.2 11.6 11M13 7.4l3.4 1.4 1.6-2.2M13 7.4 9.6 8 8.2 6M11.6 11l2.8 2.2-.8 3.6M11.6 11l-2.2 2.6-3.2-.4" /><path d="M4.5 21.5V17M2.8 18.7 4.5 17l1.7 1.7" opacity=".7" /><path d="M10 21.5h9" opacity=".5" /></svg>,
  // Crouch with rifle.
  crouch: <svg viewBox="0 0 24 24" {...L}><circle cx="12.5" cy="6.4" r="1.9" /><path d="M12 8.8 9.6 14.2h4.6l.4 5.3M9.6 14.2 7.2 19.4H5M11.6 10.4l4.2 1.6 3.2-.6" /><path d="M5 21.5h14" opacity=".55" /></svg>,
  reload: <svg viewBox="0 0 24 24" {...L}><path d="M19.2 10.2A7.4 7.4 0 0 0 6.4 7.3L4.8 9" /><path d="M4.6 4.8V9h4.2" /><path d="M4.8 13.8a7.4 7.4 0 0 0 12.8 2.9l1.6-1.7" /><path d="M19.4 19.2V15h-4.2" /></svg>,
  run: <svg viewBox="0 0 24 24" {...L}><circle cx="15" cy="3.8" r="1.9" /><path d="M14.1 6.6 11.4 12.6M13.6 7.8l3 2.4 2.6-.8M13.6 7.8 10 8.4l-2 2.6M11.4 12.6l3.3 2.4-.6 5.2M11.4 12.6 9 16.2 4.8 17" /></svg>,
  // Medical kit: case with handle, white body and a red cross.
  medkit: <svg viewBox="0 0 24 24"><path d="M9 6.6V5.2c0-.7.5-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2v1.4" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="3" y="6.6" width="18" height="13" rx="2.6" fill="rgba(255,255,255,.14)" stroke="currentColor" strokeWidth="1.6" /><path d="M10.7 9.6h2.6v2.4h2.4v2.6h-2.4V17h-2.6v-2.4H8.3V12h2.4z" fill="#ef4444" /></svg>,
  // Frag grenade.
  grenade: <svg viewBox="0 0 24 24" {...L}><ellipse cx="11" cy="14.6" rx="5.6" ry="6.4" /><path d="M5.6 14.6h10.8M11 8.2v12.8" opacity=".45" /><path d="M9.2 8.4V6.4h3.6v2" /><path d="M12.8 6.6c2-.2 3.6.4 4.6 1.8M15.6 3.2a2 2 0 1 1 1.6 3.2" /></svg>,
  hand: <svg viewBox="0 0 24 24" {...L}><path d="M12 3.5v10.5M8 10.2l4 4 4-4" /><path d="M4.5 14.5v4.2c0 .9.7 1.6 1.6 1.6h11.8c.9 0 1.6-.7 1.6-1.6v-4.2" /></svg>,
  swim: <svg viewBox="0 0 24 24" {...L}><circle cx="17.4" cy="6" r="1.8" /><path d="m5 13 4.6-3.4 3 1.8 2.6-2.4" /><path d="M2.5 17.2c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2" /></svg>,
};

// Gun silhouettes for the weapon cards (60x22).
const GUN: Record<string, ReactNode> = {
  Katana: <><path d='M3 13 L42 8 Q54 6 58 4 Q55 9 43 11 L3 15z' /><rect x='1' y='12' width='14' height='3.4' rx='1' opacity='.75' /><rect x='14.5' y='9.5' width='1.8' height='8' rx='.8' /></>,
  'AK-47': <path d="M2 9h30l2-2h14l1 2h9v3H48l-3 1h-6l-2 2 2 6h-5l-3-5h-5l-1 3h-4l1-4H14l-6 5H2l4-6-4-1z" />,
  Pistol: <path d="M14 6h30v5H30l-2 2h-5l-2 8h-6l2-9h-3z" />,
  Shotgun: <path d="M1 10h12l4-2h40v3H22l-4 2h-5l-5 6H2l4-5H1z" />,
  SMG: <path d="M8 7h34l2 2h8v3h-9l-3 2h-6l-1 7h-5l1-7h-4l-3 5h-5l3-6H8z" />,
  Sniper: <path d="M1 11h9l4-2h12V6h12v3h20v2H38l-4 2h-6l-2 2 2 5h-5l-3-5h-4l-6 6H6l5-6H1z" />,
};

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const touchId = useRef<number | null>(null); // finger on the stick (touch devices)
  const mouseId = useRef<number | null>(null); // mouse / pen (desktop)
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const moveRef = useRef(onMove); moveRef.current = onMove;
  useEffect(() => {
    const el = base.current!;
    const apply = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      let x = (cx - (r.left + r.width / 2)) / (r.width / 2), y = (cy - (r.top + r.height / 2)) / (r.height / 2);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      setKnob({ x, y }); moveRef.current(x, y);
    };
    const stop = () => { touchId.current = null; mouseId.current = null; setKnob({ x: 0, y: 0 }); moveRef.current(0, 0); };
    // Touch: raw touch events are never cancelled by the browser mid-drag the way pointer events
    // are on Android WebViews, so the stick keeps working while the other thumb aims or fires.
    const find = (list: TouchList) => { for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId.current) return list[i]; return null; };
    const tStart = (e: TouchEvent) => { e.preventDefault(); const t = e.changedTouches[0]; if (!t) return; touchId.current = t.identifier; apply(t.clientX, t.clientY); };
    const tMove = (e: TouchEvent) => { if (touchId.current === null) return; const t = find(e.touches); if (t) { e.preventDefault(); apply(t.clientX, t.clientY); } };
    const tEnd = (e: TouchEvent) => { if (touchId.current === null) return; if (find(e.changedTouches) || !find(e.touches)) stop(); };
    el.addEventListener('touchstart', tStart, { passive: false });
    window.addEventListener('touchmove', tMove, { passive: false });
    window.addEventListener('touchend', tEnd, true); window.addEventListener('touchcancel', tEnd, true);
    // Mouse / pen on desktop.
    const pDown = (e: globalThis.PointerEvent) => { if (e.pointerType === 'touch' || e.button !== 0) return; e.preventDefault(); mouseId.current = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } apply(e.clientX, e.clientY); };
    const pMove = (e: globalThis.PointerEvent) => { if (e.pointerId === mouseId.current) apply(e.clientX, e.clientY); };
    const pUp = (e: globalThis.PointerEvent) => { if (e.pointerId === mouseId.current) stop(); };
    el.addEventListener('pointerdown', pDown); window.addEventListener('pointermove', pMove); window.addEventListener('pointerup', pUp, true); window.addEventListener('pointercancel', pUp, true);
    const hidden = () => { if (document.visibilityState !== 'visible') stop(); };
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', hidden);
    return () => {
      el.removeEventListener('touchstart', tStart); window.removeEventListener('touchmove', tMove);
      window.removeEventListener('touchend', tEnd, true); window.removeEventListener('touchcancel', tEnd, true);
      el.removeEventListener('pointerdown', pDown); window.removeEventListener('pointermove', pMove); window.removeEventListener('pointerup', pUp, true); window.removeEventListener('pointercancel', pUp, true);
      window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', hidden);
      moveRef.current(0, 0); // never leave the player walking after unmount
    };
  }, []);
  return (
    <div ref={base} className="hx-stick" aria-label="Move">
      <span className="hx-stick-ring" />
      <i style={{ transform: `translate(${knob.x * 38}px, ${knob.y * 38}px)` }} />
    </div>
  );
}

/** Scrolling compass strip centred on the current heading. */
function Compass({ heading }: { heading: number }) {
  const ticks: ReactNode[] = [];
  const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = -75; d <= 75; d += 15) {
    const a = (((Math.round(heading / 15) * 15 + d) % 360) + 360) % 360;
    const x = 50 + ((a - heading + 540) % 360 - 180) * (50 / 80);
    if (x < 2 || x > 98) continue;
    ticks.push(<span key={d} className={cn(names[a] && 'is-card')} style={{ left: `${x}%` }}>{names[a] ?? a}</span>);
  }
  return <div className="hx-compass"><b />{ticks}</div>;
}

/** Premium round minimap: heading-up (the map turns so where you face is always up), the real
 *  island picture inside a dark glass bezel with degree ticks and N/E/S/W markers that turn with it. */
function Minimap({ map, dist, img }: { map: Hud['map']; dist: number; img?: string }) {
  const S = 150, cx = S / 2, cy = S / 2, R = 60, span = 150; // metres across the inner disc
  const k = (R * 2) / span;
  const rot = (map.yaw * 180) / Math.PI; // turn the world so the player's facing points up
  const to = (x: number, z: number) => [cx + (x - map.x) * k, cy + (z - map.z) * k] as const;
  const inDisc = ([x, y]: readonly [number, number]) => Math.hypot(x - cx, y - cy) < R - 3;
  const boss = map.boss ? to(map.boss[0], map.boss[1]) : null;
  // the Titan marker rides the rim when it is off the map
  let bossPt: [number, number] | null = null;
  if (boss) {
    const r = (rot * Math.PI) / 180, dx = boss[0] - cx, dy = boss[1] - cy;
    let x = dx * Math.cos(r) - dy * Math.sin(r), y = dx * Math.sin(r) + dy * Math.cos(r);
    const m = Math.hypot(x, y); if (m > R - 7) { x *= (R - 7) / m; y *= (R - 7) / m; }
    bossPt = [cx + x, cy + y];
  }
  const ticks = [];
  for (let d = 0; d < 360; d += 10) {
    const r = ((d + rot) * Math.PI) / 180, major = d % 90 === 0, mid = d % 30 === 0;
    const r1 = R + 3, r2 = R + (major ? 9 : mid ? 7 : 5);
    ticks.push(<line key={d} x1={cx + Math.sin(r) * r1} y1={cy - Math.cos(r) * r1} x2={cx + Math.sin(r) * r2} y2={cy - Math.cos(r) * r2}
      stroke={d === 0 ? '#fbbf24' : 'rgba(255,255,255,.55)'} strokeWidth={major ? 1.4 : 0.8} />);
  }
  const card = ([['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const).map(([t, d]) => {
    const r = ((d + rot) * Math.PI) / 180, rr = R + 15;
    return <text key={t} x={cx + Math.sin(r) * rr} y={cy - Math.cos(r) * rr + 3.4} textAnchor="middle" fontSize="9.5" fontWeight="900"
      fill={t === 'N' ? '#fbbf24' : 'rgba(255,255,255,.85)'}>{t}</text>;
  });
  return (
    <div className="hx-map">
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-label="Minimap">
        <defs>
          <clipPath id="hxmDisc"><circle cx={cx} cy={cy} r={R} /></clipPath>
          <radialGradient id="hxmBezel" cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#2a2f3a" stopOpacity=".55" /><stop offset="1" stopColor="#07090d" stopOpacity=".78" /></radialGradient>
          <radialGradient id="hxmVig"><stop offset="55%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity=".55" /></radialGradient>
          <linearGradient id="hxmRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset=".5" stopColor="#b45309" /><stop offset="1" stopColor="#fbbf24" /></linearGradient>
          <linearGradient id="hxmCone" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#7dd3fc" stopOpacity=".5" /><stop offset="1" stopColor="#7dd3fc" stopOpacity="0" /></linearGradient>
          <filter id="hxmGlow"><feGaussianBlur stdDeviation="1.4" /></filter>
        </defs>
        {/* bezel */}
        <circle cx={cx} cy={cy} r={S / 2 - 1} fill="url(#hxmBezel)" stroke="rgba(255,255,255,.12)" />
        {ticks}{card}
        {/* map disc (rotates with your heading) */}
        <g clipPath="url(#hxmDisc)">
          <circle cx={cx} cy={cy} r={R} fill="#123a4a" />
          <g transform={`rotate(${rot} ${cx} ${cy})`}>
            {img && <image href={img} x={cx - (map.x + 200) * k} y={cy - (map.z + 200) * k} width={400 * k} height={400 * k} preserveAspectRatio="none" />}
            {map.bots.map(([x, z], i) => { const q = to(x, z); return inDisc(q) && <g key={i}><circle cx={q[0]} cy={q[1]} r="3.6" fill="#ef4444" opacity=".5" filter="url(#hxmGlow)" /><circle cx={q[0]} cy={q[1]} r="2" fill="#f87171" stroke="#1b0a0a" strokeWidth=".6" /></g>; })}
          </g>
          {[R * 0.36, R * 0.7].map((r) => <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeDasharray="2 3" />)}
          <circle cx={cx} cy={cy} r={R} fill="url(#hxmVig)" />
          {/* view cone + player arrow, always pointing up */}
          <path d={`M${cx} ${cy} L${cx - 20} ${cy - 40} A44 44 0 0 1 ${cx + 20} ${cy - 40} Z`} fill="url(#hxmCone)" />
        </g>
        <circle cx={cx} cy={cy} r={R + 0.6} fill="none" stroke="url(#hxmRing)" strokeWidth="1.6" />
        {bossPt && (
          <g transform={`translate(${bossPt[0]} ${bossPt[1]})`}>
            <circle r="8.5" fill="#dc2626" opacity=".4" filter="url(#hxmGlow)" />
            <circle r="6.2" fill="#991b1b" stroke="#fecaca" strokeWidth="1.1" />
            <path d="M-3.2-.6c0-2 1.4-3.2 3.2-3.2s3.2 1.2 3.2 3.2c0 1.2-.6 1.8-1.2 2.2v1.3h-4V1.6c-.6-.4-1.2-1-1.2-2.2z" fill="#fff" />
            <circle cx="-1.2" cy="-.6" r=".75" fill="#991b1b" /><circle cx="1.2" cy="-.6" r=".75" fill="#991b1b" />
          </g>
        )}
        <circle cx={cx} cy={cy} r="7" fill="#0ea5e9" opacity=".22" />
        <path d={`M${cx} ${cy - 7} L${cx + 5} ${cy + 5} L${cx} ${cy + 2.6} L${cx - 5} ${cy + 5} Z`} fill="#fff" stroke="#0c4a6e" strokeWidth=".9" strokeLinejoin="round" />
        <path d={`M${cx - 4} 3 L${cx} 8 L${cx + 4} 3 Z`} fill="#fbbf24" />
      </svg>
      <span className="hx-map-dist"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3 3 21l9-5 9 5z" /></svg>{dist.toLocaleString()} m</span>
    </div>
  );
}

function Btn({ className, children, label, ...rest }: { className?: string; children: ReactNode; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" aria-label={label} className={cn('hx-btn', className)} {...rest}>{children}</button>;
}

const graphicsOptions: [GraphicsQuality, string][] = [
  ['auto', 'Auto'], ['low', 'Performance'], ['medium', 'Balanced'], ['high', 'Full HD'], ['ultra', '4K'],
];

function FireControl({ engine, disabled }: { engine: HillOfDoom | null; disabled: boolean }) {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [held, setHeld] = useState(false);
  const stop = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    setHeld(false);
    engine?.setFiring(false);
  };
  useEffect(() => {
    if (disabled && pointer.current) {
      pointer.current = null;
      setHeld(false);
      engine?.setFiring(false);
    }
  }, [engine, disabled]);
  // Backup release: a lost pointerup must never leave the fire button held or blocked.
  useEffect(() => {
    const release = () => { if (!pointer.current) return; pointer.current = null; setHeld(false); engine?.setFiring(false); };
    const touchEnd = (ev: TouchEvent) => { if (ev.touches.length === 0) release(); };
    const vis = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release); window.addEventListener('touchend', touchEnd); window.addEventListener('touchcancel', touchEnd);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('blur', release); window.removeEventListener('touchend', touchEnd); window.removeEventListener('touchcancel', touchEnd); document.removeEventListener('visibilitychange', vis); };
  }, [engine]);

  return (
    <Btn label="Fire" className={cn('hx-fire', held && 'is-firing')} disabled={disabled}
      onPointerDown={(event) => {
        if (pointer.current || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        setHeld(true);
        engine?.setFiring(true);
      }}
      onPointerMove={(event) => {
        const active = pointer.current;
        if (!active || active.id !== event.pointerId) return;
        if (event.pointerType !== 'mouse') engine?.look(event.clientX - active.x, event.clientY - active.y);
        active.x = event.clientX;
        active.y = event.clientY;
      }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onClick={(event) => {
        if (event.detail !== 0) return;
        engine?.setFiring(true);
        engine?.setFiring(false);
      }}
    >{I.bullet}</Btn>
  );
}

export function GameHud({ hud, e, sprint, onSprint, coins, pops }: {
  hud: Hud; e: HillOfDoom | null; sprint: boolean; onSprint: (on: boolean) => void; coins: number; pops: { id: number; text: string }[];
}) {
  const hold = (fn: (on: boolean) => void) => ({
    onPointerDown: () => fn(true), onPointerUp: () => fn(false), onPointerLeave: () => fn(false), onPointerCancel: () => fn(false),
  });
  const [menu, setMenu] = useState(false);
  const drop = hud.phase === 'drop';
  // One joystick for the whole round: it stays mounted through touchdown, so a thumb held on it
  // while parachuting keeps steering after landing (a remounted stick ignored the held touch).
  const leftThumb = (
    <div key="left-thumb" className={cn('hx-left', drop && 'monster-drop-stick')}>
      {!drop && <Btn label="Sprint" className={cn('hx-sprint', sprint && 'is-on')} onClick={() => onSprint(!sprint)}>{hud.swimming ? I.swim : I.run}</Btn>}
      <Joystick onMove={(x, y) => e?.setMove(x, y)} />
      {!drop && <Btn label="Use medkit" className="hx-med" disabled={hud.medkits <= 0} onClick={() => e?.useMedkit()}>{I.medkit}<small>{hud.medkits}</small></Btn>}
    </div>
  );
  if (drop) {
    return <>
      {leftThumb}
      <div className="hx-hint monster-drop-hint">Parachuting <span>· {hud.dropAltitude} m ·</span> Use the stick or WASD to steer</div>
    </>;
  }
  return (
    <>
      {leftThumb}
      {/* ---------------- battle coins: live counters (virtual coins) */}
      <div className="hx-eco" role="status" aria-label="Match stats">
        <span title="Real players connected"><small>LIVE</small><b>{hud.livePlayers ?? '—'}</b></span>
        <span title="Battle coins held by everyone in the match"><small>IN MATCH</small><b className="is-gold">{hud.matchCoins}</b></span>
        <span title="Your battle coins" className="is-you"><small>YOUR COINS</small><b className="is-gold"><i aria-hidden />{hud.coins}</b>
          {hud.coinFx && <em key={hud.coinFx.id} className={hud.coinFx.delta > 0 ? 'is-up' : 'is-down'}>{hud.coinFx.delta > 0 ? '+' : ''}{hud.coinFx.delta}</em>}
        </span>
      </div>
      {/* ---------------- top */}
      <div className="hx-top">
        <Compass heading={hud.heading} />
        <div className="hx-top-row">
          <div className="hx-objective"><i>{Target}</i><span>{hud.atSummit ? 'Defeat the Titan' : 'Reach the summit'}</span></div>
          <div className={cn('hx-timer', hud.timeLeft <= 60 && 'is-danger')}><i>{Clock}</i>{clock(hud.timeLeft)}</div>
        </div>
        {hud.bossNear && hud.bossHp > 0 && (
          <div className="hx-boss">
            <p><Skull size={12} /><b>VOLCANIC TITAN</b><em>LV {7 + hud.bossPhase}</em><span>{Math.round((hud.bossHp / hud.bossMax) * 100)}%</span></p>
            <div><i style={{ width: `${(hud.bossHp / hud.bossMax) * 100}%` }} /></div>
          </div>
        )}
      </div>
      <div className="hx-right">
        <div className="hx-chips">
          <span title="Players and bots alive"><Users size={15} /> {hud.botsLeft + 1}</span>
          <span className="monster-hud-coins" aria-label={`${coins} match coins`}><Coins size={14} /> {coins}</span>
          <button type="button" className="hx-gear" aria-label="Settings" onClick={() => setMenu(!menu)}><Settings size={16} /></button>
        </div>
        {menu && (
          <div className="hx-menu">
            <p>Graphics</p>
            <div>{graphicsOptions.map(([quality, label]) => <button key={quality} type="button" aria-pressed={hud.quality === quality} className={cn(hud.quality === quality && 'is-on')} onClick={() => e?.setQuality(quality)}>{label}</button>)}</div>
            <small>{hud.renderSize} · {hud.fps} FPS</small>
          </div>
        )}
        <Minimap map={hud.map} dist={hud.bossDist} img={hud.mapImg} />
      </div>

      {/* ---------------- centre */}
      {hud.aiming && hud.weapon === 'Sniper' && !hud.reloading && !hud.swimming && <div className="hx-scope" aria-hidden><i /><b /></div>}
      <div className={cn('hx-cross', hud.aiming && 'is-aim', hud.hit === 1 && 'is-hit', hud.hit === 2 && 'is-head')}>
        <i /><i /><i /><i /><b />
        {hud.hit === 2 && <em>HEADSHOT</em>}
      </div>
      <div className="hx-threats" aria-hidden="true">
        {hud.threats.map((t, i) => <i key={i} className={cn(t.boss && 'is-boss')} style={{ transform: `rotate(${t.a}deg) translateY(-118px)`, opacity: Math.max(0.35, 1 - t.d / (t.boss ? 90 : 40)) }} />)}
      </div>
      {hud.threats.length > 0 && (
        <div className={cn('hx-alert', hud.threats[0].boss && 'is-boss')}>
          <i>{Pin}</i><b>{hud.threats[0].boss ? 'TITAN NEARBY' : hud.threats.length > 1 ? `${hud.threats.length} ENEMIES NEARBY` : 'ENEMY NEARBY'}</b><span>{hud.threats[0].d} m</span>
        </div>
      )}
      <div className="hx-hurtdirs" aria-hidden="true">
        {hud.hurtDirs.map((h, i) => <i key={i} style={{ transform: `rotate(${h.a}deg) translateY(-150px)`, opacity: h.o }} />)}
      </div>
      {hud.hurtFlash > 0 && <div className="hx-hitflash" style={{ opacity: hud.hurtFlash }} />}
      {hud.flood && (
        <div className="hx-flood">
          <b>SEA RISING</b>
          <div><i style={{ height: `${Math.min(100, (Math.max(0, hud.flood.sea) / hud.flood.top) * 100)}%` }} /></div>
          <em>+{hud.flood.sea.toFixed(1)} m</em>
        </div>
      )}
      {hud.nadeAim && <div className="hx-nadehint">Grenade ready — aim and tap the grenade again to throw</div>}
      {hud.hp < 35 && <div className="hodg-hurt" style={{ opacity: (35 - hud.hp) / 35 }} />}
      {hud.message && <div className="hx-message"><span>{hud.message}</span></div>}
      {hud.kill && <div className={cn('hx-kill', hud.kill.head && 'is-head')} role="status" key={hud.kill.name + hud.kill.left}>
        <i aria-hidden>{hud.kill.head ? '◎' : '✕'}</i>
        <div><b>{hud.kill.head ? 'HEADSHOT ELIMINATION' : 'ELIMINATED'}</b><span>{hud.kill.name} · {hud.kill.weapon}{hud.kill.weapon !== 'Katana' ? ` · ${hud.kill.dist} m` : ''}</span></div>
        <em>{hud.kill.left} left</em>
      </div>}
      <div className="hodg-pops">{pops.map((p) => <span key={p.id}><Coins size={13} /> {p.text}</span>)}</div>
      {hud.swimming && (
        <div className="hodg-oxygen"><Waves size={14} /><div><i style={{ width: `${hud.oxygen}%` }} /></div><b>{hud.diving ? 'Diving' : 'Swimming'}</b></div>
      )}

      {/* ---------------- bottom centre: weapons and health */}
      <div className="hx-loadout">
        <div className="hx-guns">
          {hud.slots.map((s, i) => (
            <button key={s.name} type="button" className={cn('hx-gun', s.active && 'is-active', !s.owned && 'is-locked')} onClick={() => (s.owned ? e?.switchWeapon(i) : e?.requestUnlock(i))} aria-label={s.owned ? s.name : 'Unlock ' + s.name + ' for 10 coins'}>
              {hud.icons?.[s.name] ? <img className="hx-gun-img" src={hud.icons[s.name]} alt="" /> : <svg viewBox="0 0 60 22" fill="currentColor">{GUN[s.name]}</svg>}
              <span>{s.name === 'Katana' ? <b>OJ BLADE</b> : s.owned ? (s.active && hud.reloading ? 'RELOAD' : <><b>{s.ammo}</b>/{s.reserve}</>) : <em className="hx-unlock">₹10</em>}</span>
              <small>{i + 1}</small>
            </button>
          ))}
        </div>
        <div className="hx-hp">
          <span>HP {hud.hp}/100</span>
          <div><i style={{ width: `${hud.hp}%` }} className={cn(hud.hp < 35 && 'is-low')} /></div>
        </div>
      </div>

      {/* ---------------- left thumb */}

      {/* ---------------- right thumb */}
      <div className="hx-actions">
        {hud.action && <Btn label={hud.action} className="hx-use" onClick={() => e?.pressAction()}>{I.hand}<small>{hud.action}</small></Btn>}
        <Btn label="Aim and zoom" className={cn('hx-aim', hud.aiming && 'is-on', hud.weapon === 'Sniper' && 'is-sniper')} onClick={() => e?.toggleAim()}>{hud.aiming ? I.scope : I.aim}<small className="hx-zoom-tag">{hud.weapon === 'Sniper' ? '8×' : 'ZOOM'}</small></Btn>
        <Btn label="Sniper: scope, then fire" className={cn('hx-snipe', hud.weapon === 'Sniper' && 'is-on', hud.weapon === 'Sniper' && hud.aiming && 'is-ready')} onClick={() => e?.sniperShot()}>{I.scope}<small>{hud.weapon === 'Sniper' && hud.aiming ? 'FIRE' : 'SNIPER'}</small></Btn>
        <Btn label="OJ Blade strike" className={cn('hx-blade', hud.weapon === 'Katana' && 'is-on')} onClick={() => e?.bladeStrike()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 3c-4 3-9 8-12.5 12.5" strokeWidth="2.6"/><path d="M5 13.5l5 5M4.5 19.5l3-3"/></svg><small>BLADE</small></Btn>
        <Btn label="Throw grenade" className={cn('hx-nade', hud.nadeAim && 'is-on')} disabled={hud.grenades <= 0} onClick={() => e?.throwGrenade()}>{I.grenade}<small>{hud.grenades}</small></Btn>
        <Btn label="Reload" className="hx-reload" onClick={() => e?.pressReload()}>{I.reload}</Btn>
        {hud.swimming
          ? <Btn label="Dive" className="hx-jump" {...hold((on) => e?.holdDive(on))}>{I.swim}</Btn>
          : <Btn label="Jump" className="hx-jump" onClick={() => e?.pressJump()}>{I.jump}</Btn>}
        <Btn label="Crouch" className={cn('hx-crouch', hud.crouching && 'is-on')} onClick={() => e?.pressCrouch()}>{I.crouch}</Btn>
        <FireControl engine={e} disabled={hud.swimming} />
      </div>
      <div className="hodg-keys">WASD move · Shift sprint · Space jump · C crouch · Q aim · H medkit · E use · 1–5 guns · R reload · Bots are AI</div>
    </>
  );
}
