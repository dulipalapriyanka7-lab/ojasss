import { useEffect, useRef, useState } from 'react';
import { Coins, X } from 'lucide-react';
import { GameHud } from '@/game/GameHud';
import { HillOfDoom, assetsStillLoading, type Hud, type MatchEconomy, type MatchResult } from '@/game/HillOfDoom';
import * as THREE from 'three';

// OJASSS Monster Fight — standalone game page (no login or coin backend).
// Change MATCH_MINUTES to set the match length.
const MATCH_MINUTES = 20;
/** Match settings snapshot handed over by OJASSS in the launch hash (#e=...). */
function launchEconomy(): Partial<MatchEconomy> | null {
  try {
    const raw = new URLSearchParams(location.hash.slice(1)).get('e');
    if (!raw) return null;
    const e = JSON.parse(raw) as Record<string, unknown>;
    const n = (k: string, lo: number, hi: number) => (typeof e[k] === 'number' && (e[k] as number) >= lo && (e[k] as number) <= hi ? (e[k] as number) : undefined);
    const win = e.win_rule === 'last_standing' || e.win_rule === 'most_coins' || e.win_rule === 'objective' ? e.win_rule : undefined;
    const out: Partial<MatchEconomy> = { starting_coins: n('starting_coins', 1, 10000), coins_per_hit: n('coins_per_hit', 1, 1000), start_hp: n('start_hp', 10, 1000), match_minutes: n('match_minutes', 3, 60), coin_elimination: typeof e.coin_elimination === 'boolean' ? e.coin_elimination : undefined, win_rule: win };
    for (const k of Object.keys(out) as (keyof MatchEconomy)[]) if (out[k] === undefined) delete out[k];
    return out;
  } catch { return null; }
}
const nativePlayer = (window as Window & {
  NativeMonster?: { report: (coins: number) => void; close: (restart: boolean) => void };
}).NativeMonster;

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const TIPS = ['Switch to the Sniper and tap Aim for 8× zoom', 'Land near buildings to find loot crates', 'Opponents drop out when their coins run out', 'The sea rises in the final minute — climb'];
/** Full-screen loading: emblem, real asset progress, current stage and a rotating tip. */
function LoadingScreen({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const [pct, setPct] = useState(4);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const m = THREE.DefaultLoadingManager, prev = m.onProgress;
    m.onProgress = (url, done, total) => { prev?.(url, done, total); setPct((p) => Math.max(p, Math.min(99, Math.round((done / Math.max(1, total)) * 100)))); };
    const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 2600);
    return () => { m.onProgress = prev; clearInterval(t); };
  }, []);
  const stage = pct < 35 ? 'Loading terrain' : pct < 70 ? 'Loading soldiers and weapons' : 'Deploying to Doom Valley';
  return (
    <div className="monster-loading" role="status">
      <div className="ml-wrap">
        <div className="ml-emblem"><img src="/game/ojasss-patch.webp" alt="OJASSS" /><span aria-hidden /></div>
        <h1>MONSTER FIGHT</h1>
        <p className="ml-sub">DOOM VALLEY</p>
        {failed ? <><p className="ml-stage">The 3D game didn’t load</p><button type="button" onClick={onRetry}>Retry</button></> : <>
          <div className="ml-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pct + '%' }} /></div>
          <div className="ml-row"><span className="ml-stage">{stage}</span><b>{pct}%</b></div>
          <p className="ml-tip" key={tip}>TIP · {TIPS[tip]}</p>
        </>}
      </div>
    </div>
  );
}

/** Lobby spinner shown before the drop while the match fills with opponents. */
function Matchmaking({ total }: { total: number }) {
  const [found, setFound] = useState(0);
  useEffect(() => { const t = setInterval(() => setFound((n) => Math.min(total, n + 1 + Math.floor(Math.random() * 2))), 320); return () => clearInterval(t); }, [total]);
  return <div className="monster-match" role="status"><i className="monster-match-bar" aria-hidden><i style={{ width: (found / Math.max(1, total)) * 100 + '%' }} /></i><span className="monster-match-spin" aria-hidden />{found < total ? <>Finding opponents… <b>{found}/{total}</b></> : <>Match ready · <b>{total} opponents</b></>}</div>;
}

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<HillOfDoom | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [round, setRound] = useState(0);
  const [sprint, setSprint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [coins, setCoins] = useState(0);
  const [pop, setPop] = useState<number | null>(null);
  const popSequence = useRef(0);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    setResult(null); setHud(null); setSprint(false); setCoins(0); setPop(null); setLoading(true); setFailed(false);
    let g: HillOfDoom | null = null;
    let disposed = false;
    let failedToLoad = false;
    let liveOff = () => {};
    let lastCoins = -1;
    let firstFrame = true;
    const loadStart = performance.now();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const showFailure = () => {
      if (disposed) return;
      failedToLoad = true;
      setFailed(true);
      setLoading(false);
    };
    try {
      g = new HillOfDoom(host.current, MATCH_MINUTES * 60, (nextHud) => {
        // keep the loading screen until every texture and model has arrived (max 25 s), so the
        // island never appears black or half-drawn when the intro is skipped
        if (firstFrame && ((assetsStillLoading() === 0 && g?.warm) || performance.now() - loadStart > 25000)) {
          firstFrame = false;
          setLoading(false);
        }
        setHud(nextHud);
        if (nextHud.coins !== lastCoins && window.parent !== window) { lastCoins = nextHud.coins; window.parent.postMessage({ type: 'ojasss-monster-coins', coins: nextHud.coins }, '*'); }
      }, (match) => {
        setResult(match);
        nativePlayer?.report(match.kills);
        if (window.parent !== window) window.parent.postMessage({ type: 'ojasss-monster-result', coins: match.kills }, '*');
      }, () => {
        setCoins((total) => total + 1);
        setPop(++popSequence.current);
        if (popTimer.current) clearTimeout(popTimer.current);
        popTimer.current = setTimeout(() => setPop(null), 1200);
      });
      engine.current = g;
      if (/(^|[#&])debug(&|$)/.test(location.hash.slice(1))) (window as unknown as { __hod?: HillOfDoom }).__hod = g;
      const eco = launchEconomy();
      if (eco) g.setEconomy(eco);
      const onLive = (ev: MessageEvent) => {
        if (ev.source !== window.parent) return;
        if (ev.data?.type === 'ojasss-monster-live' && typeof ev.data.players === 'number') g?.setLivePlayers(ev.data.players);
        if (ev.data?.type === 'ojasss-monster-unlock-result' && Number.isInteger(ev.data.weapon)) g?.unlockResult(ev.data.weapon, ev.data.ok === true, typeof ev.data.msg === 'string' ? ev.data.msg.slice(0, 60) : '');
        if (ev.data?.type === 'ojasss-monster-player' && typeof ev.data.name === 'string') g?.setPlayer(ev.data.name, typeof ev.data.avatar === 'string' && ev.data.avatar.startsWith('data:image/') ? ev.data.avatar : null);
      };
      window.addEventListener('message', onLive);
      liveOff = () => window.removeEventListener('message', onLive);
      deadline = setTimeout(showFailure, 25000);
      void g.soldierReady.then(() => {
        clearTimeout(deadline);
        if (!disposed && !failedToLoad) g?.start();
      }, (err) => { console.error('[game] soldier load failed', err); showFailure(); });
    } catch (err) {
      console.error('[game] start failed', err);
      showFailure();
    }
    return () => {
      liveOff();
      disposed = true;
      clearTimeout(deadline);
      if (popTimer.current) clearTimeout(popTimer.current);
      g?.dispose(); engine.current = null;
    };
  }, [round]);

  return (
    <div className="hodg-root">
      <div ref={host} className="hodg-canvas" />
      {nativePlayer && <button type="button" className="monster-native-exit" aria-label="Exit game" onClick={() => nativePlayer.close(false)}><X size={17} /></button>}

      {(loading || failed) && <LoadingScreen failed={failed} onRetry={() => setRound((n) => n + 1)} />}

      {!loading && hud?.phase === 'intro' && (
        <div className="hodg-intro">
          <div className="monster-intro-card is-premium"><div><p className="hodg-intro-kicker"><img src={"game" + "/ojasss-patch.webp"} alt="" width={18} height={18} />OJASSS · Doom Valley</p><h1>Reach the summit</h1><p className="monster-intro-tags"><span>Island Survival</span><span>Free entry</span><span>20 min</span></p><Matchmaking total={engine.current?.opponents ?? 12} /></div>
          <button type="button" onClick={() => engine.current?.skipIntro()}>Skip intro</button></div>
        </div>
      )}

      {!loading && hud && hud.phase !== 'intro' && !result && (
        <GameHud hud={hud} e={engine.current} sprint={sprint} onSprint={(n) => { setSprint(n); engine.current?.setSprint(n); }} coins={coins} pops={pop === null ? [] : [{ id: pop, text: '+1 coin' }]} />
      )}

      {result && (
        <div className={"hodg-result " + (result.victory ? "is-win" : "is-loss")}>
          <div className="hodg-result-card">
            <div className="hodg-crest" aria-hidden><span>{result.victory ? '👑' : '⚔'}</span></div>
            <p className="hodg-intro-kicker">{result.victory ? 'HILL CONQUERED' : 'YOU WERE ELIMINATED'}</p>
            <h2>{result.victory ? 'VICTORY' : 'DEFEAT'}</h2>
            <p className="hodg-reason">{result.reason}</p>
            <div className="hodg-stats">
              <span><b>{result.kills}</b>Eliminations</span>
              <span><b><Coins size={15} /> {result.battleCoins}</b>Final battle coins</span>
              <span><b>{result.hitsLanded}</b>Hits landed</span>
              <span><b>{clock(result.survivedSeconds)}</b>Survived</span>
            </div>
            <div className="hodg-actions">
              <button type="button" onClick={() => {
                if (nativePlayer) nativePlayer.close(true);
                else if (window.parent !== window) window.parent.postMessage({ type: 'ojasss-monster-restart' }, '*');
                else setRound((n) => n + 1);
              }}>Play again</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
