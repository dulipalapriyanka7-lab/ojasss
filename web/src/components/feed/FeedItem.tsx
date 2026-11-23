import {PostUploadBadges} from '../post/PostUploadBadges';
import {postExpiry} from '@/lib/postExpiry';
import {homeControl} from '@/lib/homeControls';
import { Music2 } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import type { PostCard } from '@/api';
import { useLivePost, usePostActions, usePublicSettings } from '@/hooks/usePostActions';
import { cn } from '@/lib/utils';
import { dateTime } from '@/lib/format';
import { COUNTRIES, languageLabel } from '@/lib/constants';
import { CommentsSheet } from '../post/Comments';
import { EngagementRail } from '../post/EngagementRail';
import { PosterView, VideoPlayer } from '../post/MediaView';
import { Caption, CategoryPill, CreatorRow, CtaButton, PostOptions } from '../post/PostMeta';
import {EpisodeStrip} from '../post/EpisodeStrip';
import {posts} from '@/api';

function ViralWindow({ post }: { post: PostCard }) {
  if (!post.is_viral || !post.one_chance_ready) return null;
  return <span className="viral-window-bubble"><span className="viral-window-dot" />Now in One Chance</span>;
}

interface Props {
  post: PostCard;
  index: number;
  /** Distance from the active item; media is only mounted within the window. */
  distance: number;
  muted: boolean;
  onToggleMute: () => void;
  cleanView?: boolean;
  oneChance?: boolean;
  autoScroll?: boolean;
  preloadNext?: boolean;
  onMediaEnded?: (id:string)=>void;
  onMediaPlaying?: (id:string)=>void;
}

export const FEED_WINDOW = 2;

export const FeedItem = memo(function FeedItem({ post: card, index, distance, muted, onToggleMute, cleanView, oneChance, autoScroll, preloadNext, onMediaEnded, onMediaPlaying }: Props) {
  const navigate=useNavigate();
  const queryClient=useQueryClient();
  const {data:settings}=usePublicSettings();
  const show=(key:Parameters<typeof homeControl>[1])=>homeControl(settings,key);
  const showCreator=show('creator')||show('avatar');
  const hasMeta=!!card.content_origin||postExpiry(card)!==null||showCreator||['caption','hashtags','category','location','timestamp','region','audio','source','cta'].some(k=>show(k as Parameters<typeof homeControl>[1]));
  const post = useLivePost(card);
  const actions = usePostActions(post);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const active = distance === 0;
  const hideMutedFooter=settings?.['feed.reveal_footer_on_unmute']!==false&&muted&&post.kind==='video';
  useEffect(()=>{if(active)window.dispatchEvent(new CustomEvent('ojasss:feed-footer',{detail:{hidden:hideMutedFooter}}));},[active,hideMutedFooter]);
  const mounted = distance <= FEED_WINDOW;

  const handlers = {
    onHot: () => void actions.engage('hot'),
    onSpeak: () => void actions.engage('speak'),
    onViral: () => navigate(`/one-chance?post=${encodeURIComponent(post.id)}`),
    onComments: () => setCommentsOpen(true),
    onBookmark: () => void actions.toggleBookmark(),
    onShare: () => void actions.share(),
    onMore: () => setOptionsOpen(true),
  };

  return (
    <section
      data-index={index}
      data-active={active}
      aria-roledescription="slide"
      aria-label={`${post.kind === 'video' ? 'Video' : 'Poster'} by @${post.author_username}`}
      className={cn('relative flex h-feed w-full snap-start snap-always md:snap-normal items-center justify-center', !cleanView && 'md:py-4')}
    >
      {/* Stage: full-bleed on phones, a framed 9:16 stage on larger screens. */}
      <div data-clean-trigger className={cn('feed-media-stage relative h-full w-full select-none overflow-hidden bg-black', !cleanView && 'md:aspect-[9/16] md:h-full md:w-auto md:max-w-[calc(100vw-420px)] md:rounded-3xl md:shadow-float')}>
        {mounted ? (
          post.kind === 'video' ? (
<VideoPlayer post={post} active={active && !commentsOpen && !optionsOpen} autoScroll={autoScroll||oneChance} onEnded={()=>{if(active){if(post.series_id)void posts.completeEpisode(post.id).then(()=>{void queryClient.invalidateQueries({queryKey:['series',post.id]});if(!oneChance&&localStorage.getItem('ojasss-episode-autoplay')==='true')return posts.series(post.id).then(series=>{const next=series.episodes.find(episode=>episode.episode_number===(post.episode_number??0)+1);if(next&&!next.locked)navigate(`/post/${next.id}`);});}).catch(()=>undefined);onMediaEnded?.(post.id);}}} muted={muted} onToggleMute={onToggleMute} preload={active||preloadNext?'auto':'none'} onPlaybackStarted={onMediaPlaying} cleanView={cleanView} showPause={show('pause')} showMute={show('mute')} showProgress={show('progress')} />
          ) : (
            <PosterView post={post} priority={active} />
          )
        ) : (
          <div className="size-full bg-[#0b0a10]" />
        )}

        {!cleanView && <>
        {/* Optional metadata; hidden by default to leave the reel unobstructed. */}
        {hasMeta&&<>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3" style={{background:'linear-gradient(to top, rgba(0,0,0,.94), rgba(0,0,0,.5), transparent)'}} />
        <div className={cn(
          'feed-post-meta absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 p-3 pr-20 md:pr-4',
          'pb-4',
        )}>
          <PostUploadBadges post={post}/>{showCreator&&<div className="min-w-0"><CreatorRow post={post} onDark compact/></div>}<EpisodeStrip post={post} onDark/>
          <ViralWindow post={post}/>
          {showCreator&&post.caption.trim()&&<p className="reel-caption-slim ml-10 truncate" title={post.caption}>{post.caption}</p>}
          {!showCreator&&show('caption')&&<Caption text={post.caption} onDark clamp={1}/>}
          {show('hashtags')&&!!post.hashtags?.length&&<div className="flex flex-wrap gap-x-2 text-xs font-medium text-white/80">{post.hashtags.slice(0,5).map(tag=><a key={tag} href={"/explore?q="+encodeURIComponent(tag)}>#{tag}</a>)}</div>}
          <div className="flex flex-wrap gap-1.5">
            <CategoryPill post={post} showExpiry={false} onDark showCategory={show('category')} showLocation={show('location')}/>
            {show('category')&&post.is_viral && <span className="inline-flex h-7 items-center rounded-full bg-viral px-2.5 text-xs font-bold text-white">VIRAL</span>}
            {show('category')&&post.kind==='video'&&post.viral_eligible&&!post.is_viral&&<span className="inline-flex h-7 items-center rounded-full border border-white/25 bg-black/45 px-2.5 text-[11px] font-semibold text-white/85" title="Only viral videos enter One Chance">Not viral yet · not in One Chance</span>}
            {show('category')&&post.kind==='video'&&post.viral_eligible&&post.is_viral&&!post.one_chance_ready&&<span className="inline-flex h-7 items-center rounded-full border border-white/25 bg-black/45 px-2.5 text-[11px] font-semibold text-white/85" title="Went viral in an earlier One Chance week">Viral in a past week</span>}
            {show('category')&&post.complaint && <span className="inline-flex h-7 items-center rounded-full bg-warning/90 px-2.5 text-xs font-bold text-black">User complaint · unverified</span>}
          </div>
          {(show('timestamp')||show('region'))&&<p className="text-[11px] text-white/70">{show('timestamp')&&<time dateTime={post.created_at}>{dateTime(post.created_at)}</time>}{show('region')&&<span> · {languageLabel(post.language)}{post.country&&' · '+(COUNTRIES.find(c=>c.value===post.country)?.label??post.country)}</span>}</p>}
          {show('source')&&post.repost_source&&<a href={post.repost_source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center text-xs font-medium text-white/80 underline underline-offset-4">View original source</a>}
          {show('audio')&&post.kind==='video'&&<p className="flex items-center gap-1.5 text-[11px] text-white/60"><Music2 aria-hidden size={12}/><span className="truncate">{post.audio_title||'Audio from this reel'}</span></p>}
          {show('cta')&&post.has_cta && <div className="max-w-sm"><CtaButton post={post} onDark /></div>}
        </div>

        </>}
        {/* Mobile rail overlays the stage */}
        <div className="feed-mobile-actions absolute right-2 bottom-3 z-10 md:hidden">
          <EngagementRail post={post} handlers={handlers} oneChance={oneChance} onDark feedControls className="mt-auto shrink-0" />
        </div>
        </>}
      </div>

      {/* Desktop rail sits beside the stage */}
      {!cleanView && <div className="ml-4 hidden self-center md:block">
        <EngagementRail post={post} handlers={handlers} oneChance={oneChance} feedControls />
      </div>}

      {active && !cleanView && (
        <>
          <CommentsSheet open={commentsOpen} onClose={() => setCommentsOpen(false)} postId={post.id} commentsCount={post.comments_count} />
          <PostOptions post={post} open={optionsOpen} onClose={() => setOptionsOpen(false)} />
        </>
      )}
    </section>
  );
});


