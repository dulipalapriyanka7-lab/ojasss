import {tryVideoPlayback} from '@/lib/videoPlayback';
import {platform} from '@/lib/platform';
import { AlertTriangle, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { posts, type PostCard } from '@/api';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
import { Spinner } from '../ui/Feedback';

/** Blurred, enlarged copy of the artwork behind contained media — fills any aspect ratio without cropping. */
function BlurFill({ src, onError }: { src: string | null; onError?:()=>void }) {
  if (!src) return <div aria-hidden className="absolute inset-0 bg-[#0b0a10]" />;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#0b0a10]">
      <img src={src} alt="" onError={event=>{event.currentTarget.style.visibility='hidden';onError?.();}} className="size-full scale-125 object-cover opacity-55 blur-3xl saturate-150" loading="lazy" decoding="async" />
      <div className="absolute inset-0 bg-black/35" />
    </div>
  );
}

export const PosterView = memo(function PosterView({ post, className, priority }: { post: PostCard; className?: string; priority?: boolean }) {
  const src = mediaUrl(post.media_path);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(()=>{setLoaded(false);setFailed(false);},[src]);
  return (
    <div className={cn('relative size-full overflow-hidden', className)}>
      <BlurFill src={src} />
      {!loaded && !failed && <div className="skeleton absolute inset-0 opacity-40" />}
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
          <AlertTriangle aria-hidden size={28} />
          <p className="text-sm">This poster could not be loaded.</p>
        </div>
      ) : (
        <img
          src={src ?? undefined}
          alt={post.caption ? `Poster: ${post.caption.slice(0, 120)}` : `Poster by @${post.author_username}`}
          width={post.width ?? undefined}
          height={post.height ?? undefined}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('relative size-full object-contain transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </div>
  );
});

interface VideoProps {
  showPause?:boolean;showMute?:boolean;showProgress?:boolean;
  post: PostCard;
  /** Only the active item plays; everything else is paused. */
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  /** Buffer the active clip and, when allowed, one neighbour. */
  preload: 'auto' | 'metadata' | 'none';
  onPlaybackStarted?: (id:string)=>void;
  className?: string;
  /** Show inline controls row (post page). */
  controlsBar?: boolean;
  cleanView?: boolean;
  autoScroll?: boolean;
  onEnded?:()=>void;
}

export const VideoPlayer = memo(function VideoPlayer({ showPause=true,showMute=true,showProgress=true, post, active, muted, onToggleMute, preload, className, controlsBar, cleanView, autoScroll, onEnded, onPlaybackStarted }: VideoProps) {
  const [resumeTick,setResumeTick]=useState(0),[needsGesture,setNeedsGesture]=useState(false),[autoplayMuted,setAutoplayMuted]=useState(false);
  const [pageVisible,setPageVisible]=useState(()=>document.visibilityState!=='hidden');
  useEffect(()=>{const update=()=>setPageVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
  const video = useRef<HTMLVideoElement>(null);
  const effectiveMuted=muted||autoplayMuted;
  const bar = useRef<HTMLDivElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [showBuffering,setShowBuffering]=useState(false);
  // Keep visited clips attached while they remain in the bounded feed window.
  // Removing src when a clip pauses discards its decoded frame and restarts loading.
  const [sourceAttached,setSourceAttached]=useState(active||preload!=='none');
  useEffect(()=>{if(active||preload!=='none')setSourceAttached(true);},[active,preload]);
  const [failed, setFailed] = useState(false);
  const [thumbFailed,setThumbFailed]=useState(false);
  useEffect(()=>{if(!active||!buffering||failed){setShowBuffering(false);return;}const timer=window.setTimeout(()=>setShowBuffering(true),180);return()=>window.clearTimeout(timer);},[active,buffering,failed]);
  const retryCount=useRef(0);
  const resumePosition=useRef(0);
  const retryPlayback=useCallback(()=>{const v=video.current;setFailed(false);setBuffering(true);setNeedsGesture(false);if(v){resumePosition.current=v.currentTime||resumePosition.current;v.load();}setResumeTick(t=>t+1);},[]);
  useEffect(()=>{
    const resume=()=>{if(!active||document.visibilityState==='hidden')return;setPageVisible(true);if(video.current?.error){retryCount.current=0;retryPlayback();}else setResumeTick(t=>t+1);};
    window.addEventListener('pageshow',resume);window.addEventListener('online',resume);
    const off=platform.on(e=>{if(e.type==='resume')resume();});
    return()=>{window.removeEventListener('pageshow',resume);window.removeEventListener('online',resume);off();};
  },[active,retryPlayback]);
  useEffect(()=>{retryCount.current=0;viewed.current=false;setFailed(false);setThumbFailed(false);},[post.id]);
  useEffect(()=>{if(!active||!failed||!navigator.onLine||retryCount.current>=2||video.current?.error?.code!==2)return;const delay=++retryCount.current*1200;const timer=setTimeout(retryPlayback,delay);return()=>clearTimeout(timer);},[active,failed,retryPlayback]);
  useEffect(()=>{
    if(!active||!pageVisible||!buffering||failed||userPaused||needsGesture)return;
    const timer=window.setTimeout(()=>{
      if(!navigator.onLine||retryCount.current>=2){setBuffering(false);setFailed(true);return;}
      retryCount.current++;
      retryPlayback();
    },10000);
    return()=>clearTimeout(timer);
  },[active,pageVisible,buffering,failed,userPaused,needsGesture,resumeTick,retryPlayback]);
  const [flash, setFlash] = useState<'play' | 'pause' | null>(null);
  const viewed = useRef(false);
  const completionNotified = useRef(false);
  const thumb = mediaUrl(post.thumbnail_path);
  useEffect(()=>{completionNotified.current=false;},[post.id]);
  const notifyEnded=useCallback(()=>{
    if(!active||!pageVisible||completionNotified.current)return;
    completionNotified.current=true;
    onEnded?.();
  },[active,pageVisible,onEnded]);

  // Play/pause lifecycle driven by visibility.
  useEffect(() => {
    const v = video.current;
    if (!v || failed) return;
    let cancelled=false;
    if (active && pageVisible && !userPaused) {
      if(v.ended && !autoScroll)v.currentTime=0;
      void tryVideoPlayback(v,()=>!cancelled,()=>setNeedsGesture(true),()=>setAutoplayMuted(true));
    } else v.pause();
    return()=>{cancelled=true;v.pause();};
  }, [active, userPaused, failed, pageVisible, autoScroll,resumeTick]);

  // Reset a manual pause when the item leaves the screen (adjusting state during render).
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setUserPaused(false);
  }

  // Count time actually spent playing, including playback that starts after buffering.
  useEffect(()=>{
    const v=video.current;if(!active||!v||viewed.current)return;
    let timer:number|undefined;
    const clear=()=>{window.clearTimeout(timer);timer=undefined;};
    const playing=()=>{clear();timer=window.setTimeout(()=>{if(!v.paused&&!viewed.current){viewed.current=true;void posts.recordView(post.id).catch(()=>undefined);}},2000);};
    v.addEventListener('playing',playing);v.addEventListener('pause',clear);v.addEventListener('waiting',clear);if(!v.paused)playing();
    return()=>{clear();v.removeEventListener('playing',playing);v.removeEventListener('pause',clear);v.removeEventListener('waiting',clear);};
  },[active,post.id,failed]);

  // Progress without re-rendering: write transform directly.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const v = video.current;
      if (v && bar.current && v.duration) bar.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const toggle = useCallback(() => {
    if(needsGesture){setNeedsGesture(false);setUserPaused(false);setResumeTick(t=>t+1);const v=video.current;if(v)void tryVideoPlayback(v,()=>true,()=>setNeedsGesture(true),()=>setAutoplayMuted(true));return;}
    setUserPaused((p) => {
      setFlash(p ? 'play' : 'pause');
      window.setTimeout(() => setFlash(null), 450);
      return !p;
    });
  }, [needsGesture]);

  const toggleMute=()=>{setAutoplayMuted(false);if(autoplayMuted&&!muted){const v=video.current;if(v){v.muted=false;void v.play().catch(()=>setNeedsGesture(true));}}else onToggleMute();};
  const seek = (e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    const v = video.current;
    if (!v?.duration) return;
    if ('key' in e) {
      if (e.key === 'ArrowRight') v.currentTime = Math.min(v.duration, v.currentTime + 5);
      if (e.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - 5);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration;
  };

  return (
    <div className={cn('relative size-full overflow-hidden bg-black', className)}>
      <BlurFill src={thumbFailed?null:thumb} onError={()=>setThumbFailed(true)}/>
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
          <AlertTriangle aria-hidden size={30} />
          <p className="text-sm text-white/85">This video could not be played.</p>
          <button
            type="button"
            onClick={retryPlayback}
            className="flex h-10 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold backdrop-blur hover:bg-white/25"
          >
            <RotateCcw aria-hidden size={16} /> Retry
          </button>
        </div>
      )}
      {(
        <video
          ref={video}
          src={active||preload!=='none'||sourceAttached?mediaUrl(post.media_path) ?? undefined:undefined}
          poster={thumbFailed?undefined:thumb ?? undefined}
          preload={preload}
          muted={effectiveMuted}
          loop={!autoScroll && !post.series_id}
          onEnded={notifyEnded}
          onTimeUpdate={(event)=>{
            const {currentTime,duration}=event.currentTarget;
            if(post.series_id&&Number.isFinite(duration)&&duration>0&&currentTime/duration>=0.985)notifyEnded();
          }}
          playsInline
          disablePictureInPicture
          controlsList="nodownload noplaybackrate"
          onWaiting={() => setBuffering(true)}
          onLoadedMetadata={event=>{const player=event.currentTarget;if(resumePosition.current>0&&Number.isFinite(player.duration)){player.currentTime=Math.min(resumePosition.current,Math.max(0,player.duration-.1));resumePosition.current=0;}}}
          onPlaying={() => {setBuffering(false);setNeedsGesture(false);if(active){retryCount.current=0;onPlaybackStarted?.(post.id);}}}
          onCanPlay={() => {setBuffering(false);if(active&&pageVisible&&!userPaused&&video.current?.paused)setResumeTick(t=>t+1);}}
          onError={event => {if((active||preload!=='none'||sourceAttached)&&event.currentTarget.error?.code!==1){setBuffering(false);setFailed(true);}}}
          onClick={toggle}
          aria-label={post.caption ? `Video: ${post.caption.slice(0, 120)}` : `Video by @${post.author_username}`}
          className={cn('relative size-full cursor-pointer object-contain',failed&&'invisible')}
        />
      )}

      {active && showBuffering && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner size={36} className="text-white" />
        </div>
      )}

      <AnimatePresence>
        {!cleanView && (flash || ((userPaused||needsGesture) && active)) && !failed && (
          <motion.div
            key={userPaused||needsGesture ? 'paused' : 'flash'}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="glass-dark flex size-18 items-center justify-center rounded-full text-white">
              {userPaused||needsGesture ? <Play aria-hidden size={34} className="ml-1 fill-white" /> : <Pause aria-hidden size={32} className="fill-white" />}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!cleanView && <>
      {/* Controls: play/pause + mute. Keyboard reachable, 44px targets. */}
      {(showPause||showMute)&&<div className={cn('absolute top-3 left-3 z-10 flex w-fit items-center gap-1 rounded-full border border-white/10 bg-black/30 p-0.5 backdrop-blur', controlsBar && 'top-auto right-3 bottom-4 left-auto')}>
        {showPause&&<button
          type="button"
          onClick={toggle}
          aria-label={userPaused||needsGesture ? 'Play video' : 'Pause video'}
          className="glass-dark flex size-11 items-center justify-center rounded-full text-white"
        >
          {userPaused||needsGesture ? <Play aria-hidden size={18} className="fill-white" /> : <Pause aria-hidden size={18} className="fill-white" />}
        </button>}
        {showMute&&<button
          type="button"
          onClick={toggleMute}
          aria-label={effectiveMuted ? 'Unmute' : 'Mute'}
          aria-pressed={!effectiveMuted}
          className="glass-dark flex size-11 items-center justify-center rounded-full text-white"
        >
          {effectiveMuted ? <VolumeX aria-hidden size={19} /> : <Volume2 aria-hidden size={19} />}
        </button>}
      </div>}

      {/* Progress */}
      {showProgress&&<div
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext="Use left and right arrows to seek 5 seconds"
        onClick={seek}
        onKeyDown={seek}
        className="group absolute inset-x-2 bottom-0 z-10 h-3 cursor-pointer"
      >
        <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-full bg-white/25 transition-[height] group-hover:h-[5px]">
          <div ref={bar} className="h-full origin-left rounded-full bg-gradient-to-r from-[#FF7A18] via-[#FF3366] to-[#A855F7]" style={{ transform: 'scaleX(0)' }} />
        </div>
      </div>}
      </>}
    </div>
  );
});
