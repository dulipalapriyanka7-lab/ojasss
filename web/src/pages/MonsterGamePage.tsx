import {GameRoomChat} from '@/components/GameRoomChat';
import {GameEntryPass} from '@/components/GameEntryPass';
import '@/components/game-entry.css';
import { Coins, Users, Gamepad2, LockKeyhole, Maximize, Minimize, Play, Settings, Trophy, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { gameCoins, monsterGame, useMonsterGameStatus, type GameLaunch } from '@/api/monsterGame';
import { Page } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { rupees } from '@/lib/format';
import { platform } from '@/lib/platform';
import { AVATAR_BUCKET } from '@/lib/env';
import { mediaUrl } from '@/lib/media';
import './monster-game.css';

const fmt = (n: number | undefined | null) => (typeof n === 'number' ? new Intl.NumberFormat('en-IN').format(n) : '—');

export default function MonsterGamePage() {
  const { session, isAdmin, me } = useAuth();
  const [ticket, setTicket] = useState<(GameLaunch & { viewer: string | null; run: number }) | null>(null);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const run = useRef(0);
  const stage = useRef<HTMLElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [full, setFull] = useState(false);
  const [nativeFull, setNativeFull] = useState<boolean | null>(null);
  const [frameLoading, setFrameLoading] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewStatus, setReviewStatus] = useState('');
  const access = useMonsterGameStatus(!!ticket);
  const toast = useToast();
  const viewer = session?.user.id ?? null;
  const basePath = access.data?.can_play && ticket?.viewer === viewer ? ticket.path : '';
  // the match settings snapshot travels in the hash so the sandboxed game can read it
  const path = basePath && ticket?.economy ? basePath + '#e=' + encodeURIComponent(JSON.stringify(ticket.economy)) : basePath;
  const livePlayers = access.data?.live_players;
  const playing = !!path;

  useEffect(() => {
    if (!playing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const unlisten = platform.on(event => {
      if (event.type === 'game_immersive') setNativeFull(event.enabled);
    });
    platform.send({ type: 'game_immersive', enabled: true });
    return () => {
      platform.send({ type: 'game_immersive', enabled: false });
      unlisten();
      document.body.style.overflow = previous;
    };
  }, [playing]);

  useEffect(() => {
    if (ticket && (!access.data?.can_play || ticket.viewer !== viewer)) setTicket(null);
  }, [access.data?.can_play, ticket, viewer]);

  const checkAccess = access.refetch;
  const play = useCallback(async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    try {
      const result = await monsterGame.play();
      if (!/^\/play-game\/[\w-]+\.[a-f0-9]{64}\/index\.html$/.test(result.path)) {
        throw new Error('Invalid game launch link.');
      }
      setTicket({ ...result, viewer, run: ++run.current });
      setFrameLoading(true);
      setResult(null);
      setReviewStatus('');
    } catch (error) {
      toast.error(error);
      void checkAccess();
    } finally {
      setOpening(false);
      openingRef.current = false;
    }
  }, [viewer, toast, checkAccess]);

  const ticketRef = useRef(ticket); ticketRef.current = ticket;
  const qcGame = useQueryClient();
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!iframe.current || event.source !== iframe.current.contentWindow || event.origin !== 'null') return;
      const message = event.data;
      if (message?.type === 'ojasss-monster-result' && Number.isInteger(message.coins) && message.coins >= 0 && message.coins <= 13) {
        setResult(previous => previous ?? message.coins);
        const mid = ticketRef.current?.match_id;
        if (mid) void monsterGame.claimCoins(mid, gameCoins.current ?? 0).then(r => { if (r.credited > 0) toast.success('+' + r.credited + ' game coins added to your wallet'); void qcGame.invalidateQueries({ queryKey: ['coins'] }); }).catch(() => { /* too short or already claimed */ });
      }
      if (message?.type === 'ojasss-monster-unlock' && Number.isInteger(message.weapon)) {
        const mid = ticketRef.current?.match_id; const w = message.weapon as number;
        const reply = (ok: boolean, msg = '') => iframe.current?.contentWindow?.postMessage({ type: 'ojasss-monster-unlock-result', weapon: w, ok, msg }, '*');
        if (!mid) reply(false, 'Sign in to use wallet coins');
        else void monsterGame.unlockPay(mid, w).then(() => { reply(true); void qcGame.invalidateQueries({ queryKey: ['coins'] }); }).catch(e => reply(false, e instanceof Error ? e.message : 'Payment failed'));
      }
      if (message?.type === 'ojasss-monster-restart') void play();
      if (message?.type === 'ojasss-monster-coins' && Number.isInteger(message.coins) && message.coins >= 0 && message.coins <= 100000) gameCoins.current = message.coins;
    };
    addEventListener('message', listener);
    return () => removeEventListener('message', listener);
  }, [play]);

  // Name + profile photo for the overhead tag inside the game (the sandboxed frame cannot load it itself).
  useEffect(() => {
    if (!playing || frameLoading || !me) return;
    let stop = false;
    const name = (me.display_name || me.username || 'Player').slice(0, 18);
    const send = (avatar: string | null) => { if (!stop) iframe.current?.contentWindow?.postMessage({ type: 'ojasss-monster-player', name, avatar }, '*'); };
    const url = mediaUrl(me.avatar_path, AVATAR_BUCKET);
    if (!url) { send(null); return () => { stop = true; }; }
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d')!; const s = Math.min(img.width, img.height); x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96); send(c.toDataURL('image/jpeg', 0.85)); } catch { send(null); } };
    img.onerror = () => send(null);
    img.src = url;
    return () => { stop = true; };
  }, [playing, frameLoading, me]);

  useEffect(() => {
    if (!playing || livePlayers === undefined) return;
    iframe.current?.contentWindow?.postMessage({ type: 'ojasss-monster-live', players: livePlayers }, '*');
  }, [playing, livePlayers, frameLoading]);

  useEffect(() => {
    const listener = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', listener);
    return () => document.removeEventListener('fullscreenchange', listener);
  }, []);

  async function toggleFullscreen() {
    if (nativeFull !== null) {
      platform.send({ type: 'game_immersive', enabled: !nativeFull });
      return;
    }
    try {
      if (document.fullscreenElement === stage.current) {
        await document.exitFullscreen();
      } else if (stage.current?.requestFullscreen) {
        await stage.current.requestFullscreen();
        const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
        await orientation?.lock?.('landscape').catch(() => undefined);
      } else {
        toast.info('Turn your phone sideways for landscape play.');
      }
    } catch {
      toast.info('Turn your phone sideways for landscape play.');
    }
  }

  async function submitReward() {
    if (!ticket?.round_id || !result || submitting || reviewStatus) return;
    setSubmitting(true);
    try {
      const response = await monsterGame.submitReward(ticket.round_id, result);
      setReviewStatus(response.status);
    } catch (error) {
      toast.error(error);
    } finally {
      setSubmitting(false);
    }
  }

  if (access.isPending) return <Page width="xl"><Skeleton className="h-64 rounded-2xl" /></Page>;
  if (access.isError) return <Page width="xl"><ErrorState error={access.error} onRetry={() => void access.refetch()} /></Page>;

  return (
    <Page width="xl" className={playing ? undefined : 'mg-page space-y-3'}>
      <section ref={stage} className={`monster-stage overflow-hidden ${playing ? 'is-playing rounded-2xl border border-line bg-surface' : 'mg-card'}`} aria-label={playing ? 'Monster Fight game' : undefined}>
        {!playing && <header className="mg-hero">
          <img className="mg-poster" src="/assets/games/island-poster.jpg" alt="" width={800} height={373} decoding="async" />
          <div className="mg-hero-body">
            <span className="mg-badge">{access.data.can_play ? <Gamepad2 aria-hidden size={13} /> : <LockKeyhole aria-hidden size={12} />}{access.data.mode === 'private' ? 'Private preview' : 'Monster Fight · Live'}</span>
            <h1>OJASSS Island Survival</h1>
            <p className="mg-sub">Play · Survive · Earn</p>
          </div>
        </header>}
        {!playing && <div className="mg-stats" role="status" aria-label="Live game stats">
          <span><small><i className="mg-live-dot" aria-hidden />Live players</small><b className="is-cyan"><Users size={16} aria-hidden />{fmt(livePlayers)}</b></span>
          <span><small><Coins size={11} aria-hidden />All active coins</small><b>{fmt(access.data.active_coins)}</b></span>
          <span><small><Coins size={11} aria-hidden />Your coins</small><b>{fmt(access.data.my_coins)}</b></span>
        </div>}
        {playing && <div className="monster-window-actions">
            <button type="button" aria-label={full || nativeFull ? 'Exit fullscreen' : 'Landscape fullscreen'} onClick={() => void toggleFullscreen()}>{full || nativeFull ? <Minimize size={17} /> : <Maximize size={17} />}</button>
            <button type="button" aria-label="Exit game" onClick={() => {
              if (document.fullscreenElement === stage.current) void document.exitFullscreen().catch(() => undefined);
              setTicket(null);
            }}><X size={17} /></button>
          </div>}
        {path ? (
          <>
          {result !== null && <div className="monster-reward-bar flex flex-wrap items-center justify-between gap-2 border-y border-line bg-surface px-4 py-2">
            <span className="flex items-center gap-2 text-sm font-semibold"><Coins size={16} /> {result} match coins</span>
            {ticket?.round_id && result > 0 && (reviewStatus
              ? <span role="status" className="text-sm text-fg-3">{reviewStatus === 'pending' ? 'Pending admin review' : reviewStatus === 'approved' ? 'Added to Earnings' : 'Claim declined'}</span>
              : <Button size="sm" loading={submitting} onClick={() => void submitReward()}>Request reward review · {rupees(result * ticket.rate_paise)}</Button>
            )}
          </div>}
          <div className="monster-frame">
            <iframe
              key={ticket?.run}
              ref={iframe}
              title="Play OJASSS Monster Fight"
              className="block h-full w-full border-0 bg-black"
              sandbox="allow-scripts allow-pointer-lock"
              referrerPolicy="no-referrer"
              src={path}
              onLoad={() => setFrameLoading(false)}
            />
            {!frameLoading && <GameRoomChat/>}
            {frameLoading && <div className="monster-frame-loading" role="status">
              <img src="/brand/mark.png" width={36} height={36} alt="" />
              <span>Opening Monster Fight</span>
            </div>}
          </div>
          </>
        ) : (
          <div className="mg-body">
            {access.data.can_play ? (
              <>
                <p className="mg-lede">Land, gear up and defeat the Volcanic Titan before the sea closes in. <b>{access.data.economy?.paid_entry?'Game pass active':'Free entry'} · {access.data.economy?.starting_coins ?? 16} battle coins</b></p>
                                <ul className="mg-feats" aria-label="Game features">
                  <li><i className="f1"><Gamepad2 size={20} aria-hidden /></i>Survive on island</li>
                  <li><i className="f2"><Coins size={20} aria-hidden /></i>Earn coins</li>
                  <li><i className="f3"><Trophy size={20} aria-hidden /></i>Top the board</li>
                </ul>
                <div className="mg-actions">
                  <Button className="mg-play" loading={opening} onClick={() => {
                    if (!platform.isAndroidApp() && matchMedia('(pointer: coarse)').matches) void toggleFullscreen();
                    void play();
                  }} leading={<Play size={17} />}>Play Monster Fight</Button>
                  {isAdmin && <Link to="/admin/games" className="mg-manage"><Settings size={16} aria-hidden />Manage game</Link>}
                </div>
              </>
            ) : (
              <>
                {(access.data as {entry_required?:boolean}).entry_required&&session?<GameEntryPass/>:<p className="mg-lede">{(access.data as {entry_required?:boolean}).entry_required?'Sign in and buy a game pass to play.':'The game is currently open to invited OJASSS members. Check back after launch.'}</p>}
                {!session && <Link className="btn btn-secondary" to="/login?next=%2Fgames">Sign in to check access</Link>}
              </>
            )}
          </div>
        )}
      </section>
      {access.data.can_play && (
        <p className="mg-credit">
          <a className="underline" href="https://sketchfab.com/3d-models/soldier-fully-rigged-character-d5ee1b51099741d2b5e4010f4f781263" target="_blank" rel="noreferrer">Soldier fully rigged character</a>
          {' '}by Bad boy for life, licensed under CC BY 4.0. Materials were converted for this game.
          {' '}<a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">License</a>
        </p>
      )}
    </Page>
  );
}
