import {useCategoryLabel} from '@/hooks/useCategories';
import {DownloadVideoAction} from './DownloadVideoAction';
import {useQueryClient} from '@tanstack/react-query';
import {useAutoScroll,saveAutoScroll} from '@/lib/feedPreferences';
import { ChevronsDown, Trophy, Crown, ExternalLink, Flag, Link2, MapPin, Megaphone, Scale, Trash2, HandHeart, BadgeCheck, Info, ChevronRight, Send, Bookmark, Clapperboard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { posts, type PostCard } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { usePostActions } from '@/hooks/usePostActions';
import { COMPLAINT_SUBCATEGORIES } from '@/lib/constants';
import { postExpiry, remainingTime } from '@/lib/postExpiry';
import { usePlaceLabel } from '@/lib/location';
import { env } from '@/lib/env';
import { date, humanize, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

import { StatusBadge } from '../ui/Feedback';
import { Avatar, VerifiedMark } from '../ui/Misc';
import { ConfirmDialog, Dialog } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { ReportDialog } from './ReportDialog';
import {PostDetailsSheet} from './PostDetailsSheet';
import {mediaUrl} from '@/lib/media';

export function CreatorRow({ post, onDark, showFollow = true, compact=false }: { post: PostCard; onDark?: boolean; showFollow?: boolean; compact?:boolean }) {
  const categoryLabel=useCategoryLabel();
  const { me } = useAuth();
  const { toggleFollow } = usePostActions(post);
  const isMe = me?.id === post.author_id;
  const name = post.author_display_name || post.author_username;
  return (
    <div className={cn('flex min-w-0 items-center gap-3',compact&&'feed-creator-row')}>
      <Link to={`/profile/${post.author_username}`} className="flex min-w-0 flex-1 items-center gap-2.5" aria-label={`${name}, @${post.author_username}`}>
        <Avatar path={post.author_avatar_path} name={name} size={compact?32:40} ring={onDark} status={!!post.author_status_post_id} />
        <span className="min-w-0">
          <span className={cn('flex items-center gap-1 text-[15px] font-semibold', onDark && 'text-white drop-shadow')}>
            <span className="truncate">{name}</span>
            {post.author_verified && <VerifiedMark size={15} />}
          </span>
          {compact?<>
            <span className="reel-creator-category block truncate">{categoryLabel(post.source_category??post.category)}</span>
            <span className="reel-creator-upload flex min-w-0 items-center gap-1"><span className="min-w-0 truncate">@{post.author_username}</span><span aria-hidden>·</span><time className="shrink-0" dateTime={post.created_at} title={new Date(post.created_at).toLocaleString()}>{new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit'}).format(new Date(post.created_at)).replace('/','-')} {new Intl.DateTimeFormat('en',{hour:'numeric',minute:'2-digit'}).format(new Date(post.created_at))}</time></span>
          </>:<span className={cn('block truncate text-xs',onDark?'text-white/75':'text-fg-3')}>@{post.author_username} · {timeAgo(post.created_at)}</span>}

        </span>
      </Link>
      {showFollow && !isMe && (
        <button
          type="button"
          onClick={toggleFollow}
          aria-pressed={post.my_following}
          className={cn(
            'respect-creator-button ml-1 inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold transition-colors',
            post.my_following
              ? onDark ? 'bg-white/15 text-white backdrop-blur' : 'bg-surface-2 text-fg-2'
              : 'bg-brand-gradient text-white hover:brightness-110',
          )}
        >
          {post.my_following ? <BadgeCheck aria-hidden size={14} /> : <HandHeart aria-hidden size={14} />}
          {post.my_following ? 'Respecting' : 'Respect'}
        </button>
      )}
    </div>
  );
}

export function Caption({ text, onDark, clamp = 2 }: { text: string; onDark?: boolean; clamp?: number }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 110 || text.split('\n').length > clamp;
  return (
    <div className={cn('text-[15px] leading-relaxed', onDark && 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]')}>
      <p className={cn('break-words whitespace-pre-wrap', !open && long && (clamp === 1 ? 'line-clamp-1' : clamp === 2 ? 'line-clamp-2' : 'line-clamp-4'))}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className={cn('mt-0.5 text-sm font-semibold', onDark ? 'text-white/80' : 'text-fg-3')}>
          {open ? 'Show less' : 'more'}
        </button>
      )}
    </div>
  );
}

export function CategoryPill({ post, onDark, showCategory=true, showLocation=true, showExpiry=true }: { post: PostCard; onDark?: boolean; showCategory?:boolean; showLocation?:boolean; showExpiry?:boolean }) {
  const categoryLabel=useCategoryLabel();
  const locationName = usePlaceLabel(post.location);
  const expires = postExpiry(post);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { if (expires === null) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [expires]);
  return (
    <div className="flex max-w-full flex-wrap gap-1.5">{showCategory&&<Link
      to={`/?category=${post.category}`}
      className={cn(
        'inline-flex min-h-7 max-w-full flex-wrap items-center gap-1 rounded-2xl px-2.5 py-1 text-xs font-semibold',
        onDark ? 'bg-white/15 text-white backdrop-blur-md' : 'bg-surface-2 text-fg-2',
      )}
    >
      {post.category === 'public_complaint' && <Megaphone aria-hidden size={13} />}
      {categoryLabel(post.category)}
      {showExpiry && expires !== null && <span className="tabular-nums" aria-label="Time remaining"> · {remainingTime(expires, now)}</span>}
    </Link>}{showLocation&&post.location&&<span className={cn("inline-flex min-h-7 min-w-0 max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",onDark?"bg-white/10 text-white/85 backdrop-blur-md":"bg-surface-2 text-fg-2")}><MapPin aria-hidden size={12} className="shrink-0"/><span className="truncate">{locationName}</span></span>}</div>
  );
}

export function CtaButton({ post, onDark }: { post: PostCard; onDark?: boolean }) {
  const { openCta } = usePostActions(post);
  if (!post.has_cta) return null;
  return (
    <button
      type="button"
      onClick={openCta}
      className={cn(
        'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-transform active:scale-[0.98]',
        onDark ? 'bg-brand-gradient text-white hover:brightness-110' : 'bg-fg text-bg hover:opacity-90',
      )}
    >
      {post.cta_label ?? 'Learn more'}
      <ExternalLink aria-hidden size={16} />
    </button>
  );
}

/**
 * Complaint details with explicit separation of: what the user alleges, what OJASSS did
 * (platform processing / forwarding), and any authority response. Nothing here implies
 * OJASSS verified the allegation.
 */
export function ComplaintDetails({ post }: { post: PostCard }) {
  const c = post.complaint;
  if (!c) return null;
  const sub = COMPLAINT_SUBCATEGORIES.find((s) => s.value === c.subcategory)?.label ?? humanize(c.subcategory);
  return (
    <section aria-label="Complaint details" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">
          <Megaphone aria-hidden size={13} /> User-submitted complaint
        </span>
        <span className="text-xs text-fg-3">Not verified by OJASSS</span>
      </div>
      <div>
        <h3 className="text-xs font-semibold tracking-wide text-fg-3 uppercase">What the user reports</h3>
        <p className="mt-1 text-sm font-semibold">{sub}</p>
        <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-fg-2">{c.description}</p>
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-fg-3"><MapPin aria-hidden size={13} /> {c.location}</p>
        {c.legal_assistance_requested && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-fg-3"><Scale aria-hidden size={13} /> Complainant requested legal assistance</p>
        )}
      </div>
      <div className="border-t border-line pt-3">
        <h3 className="text-xs font-semibold tracking-wide text-fg-3 uppercase">Platform processing</h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-fg-3">Review status</dt><dd><StatusBadge status={c.status} /></dd>
          <dt className="text-fg-3">Forwarding</dt>
          <dd><StatusBadge status={c.forward_status} />{c.forwarded_at && <span className="ml-1 text-xs text-fg-3">{date(c.forwarded_at)}</span>}</dd>
          {c.authority_name && <><dt className="text-fg-3">Authority</dt><dd className="font-medium">{c.authority_name}</dd></>}
        </dl>
      </div>
      {c.authority_response && (
        <div className="border-t border-line pt-3">
          <h3 className="text-xs font-semibold tracking-wide text-fg-3 uppercase">Authority response</h3>
          <p className="mt-1 text-sm whitespace-pre-wrap text-fg-2">{c.authority_response}</p>
          {c.authority_responded_at && <p className="mt-1 text-xs text-fg-3">Recorded {date(c.authority_responded_at)}</p>}
        </div>
      )}
      <p className="text-xs text-fg-3">
        Complaints are the complainant's own allegations. <Link to="/complaints-disclaimer" className="font-semibold underline">Read the complaints disclaimer</Link>.
      </p>
    </section>
  );
}

/** "More" menu: copy link, report, delete (own post). */
export function PostOptions({ post, open, onClose }: { post: PostCard; open: boolean; onClose: () => void }) {
  const categoryLabel=useCategoryLabel();
  const queryClient=useQueryClient();
  const { me } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [detailsOpen,setDetailsOpen]=useState(false);
  const actions=usePostActions(post);
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const isMine = me?.id === post.author_id;

  const autoScroll=useAutoScroll();
  const item='post-option-row';
  const preview=mediaUrl(post.thumbnail_path??(post.kind==='poster'?post.media_path:null));
  return (
    <>
      <Dialog open={open} onClose={onClose} title="Post options" size="sm" className="ojass-glass-sheet">
        <div className="mb-3 flex items-center gap-3 border-b border-line pb-3"><img src={preview??'/brand/mark.png'} alt="" className="h-12 w-10 shrink-0 rounded-lg bg-surface-2 object-cover"/><div className="min-w-0"><p className="truncate text-sm font-semibold">{post.audio_title||post.caption||'An OJASSS moment'}</p><p className="mt-1 text-xs text-fg-3">@{post.author_username} · {categoryLabel(post.category)}</p></div></div>
        <div className="space-y-0.5"><button type="button" role="switch" aria-label="Auto-scroll" aria-checked={autoScroll} onClick={()=>saveAutoScroll(!autoScroll)} className="post-option-row auto-scroll-menu-row"><ChevronsDown size={19}/><span className="flex flex-1 items-center gap-2">Auto-scroll<span className="auto-scroll-new">NEW</span></span><span aria-hidden className="text-[11px] font-medium text-fg-3">{autoScroll?'On':'Off'}</span><span aria-hidden className={cn('auto-scroll-switch',autoScroll&&'is-on')}><span/></span></button><button type="button" className={item} onClick={()=>{onClose();setDetailsOpen(true);}}><Info size={19}/><span className="flex-1">Post details</span><ChevronRight size={15} className="text-fg-3"/></button>
          <Link to="/challenges" onClick={onClose} className={item}><Trophy size={19} className="text-purple-300"/><span className="flex flex-1 items-center gap-2">Daily & more challenges<span className="auto-scroll-new">NEW</span></span><ChevronRight size={15} className="text-fg-3"/></Link>
          <Link to="/my-tasks" onClick={onClose} className={cn(item,'my-tasks-menu-link')}><Trophy size={19}/><span className="flex-1">My Tasks</span><span className="auto-scroll-new">NEW</span><ChevronRight size={15}/></Link>
          <button type="button" className={item} onClick={async()=>{try{await navigator.clipboard.writeText(`${env.siteUrl}/post/${post.id}`);toast.success('Link copied');onClose();}catch(e){toast.error(e);}}}><Link2 size={19}/>Copy link</button>
          {isMine&&post.series_id&&<Link to={`/upload?episode=1&series=${encodeURIComponent(post.series_title??'')}&genre=${encodeURIComponent(post.series_genre??'Horror')}&next=${(post.episode_number??0)+1}`} onClick={onClose} className={item}><Clapperboard size={19} className="text-fuchsia-400"/><span className="flex-1">Upload next episode</span><ChevronRight size={15} className="text-fg-3"/></Link>}
          {post.kind==='video'&&<DownloadVideoAction post={post}/>}
          <button type="button" className={item} onClick={()=>{onClose();void actions.share();}}><Send size={19}/>Share post</button>
          <button type="button" className={item} onClick={()=>{onClose();void actions.toggleBookmark();}}><Bookmark size={19} className={post.my_bookmarked?'fill-current text-brand-ink':''}/>{post.my_bookmarked?'Remove from saved':'Save reel'}</button>
          {post.category==='one_chance'&&<Link to="/one-chance" onClick={onClose} className={cn(item,'text-purple-400')}><Crown size={19}/><span>One Chance Premium <span className="text-xs text-fg-3">· ₹10 / 7 days</span></span></Link>}
          {!isMine&&<button type="button" className={cn(item,'text-danger')} onClick={()=>{onClose();setReporting(true);}}><Flag size={19}/>Report post</button>}
          {isMine&&<button type="button" className={cn(item,'text-danger')} onClick={()=>{onClose();setDeleting(true);}}><Trash2 size={19}/>Delete post</button>}
        </div>
      </Dialog>
      <PostDetailsSheet post={post} open={detailsOpen} onClose={()=>setDetailsOpen(false)}/>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="post" targetId={post.id} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this post?"
        description="Your post and unused uploaded files will be permanently deleted. Earned rewards are not affected."
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await posts.remove(post.id);
            queryClient.removeQueries({queryKey:['post',post.id]});
            queryClient.resetQueries({queryKey:['profile-posts']});
            queryClient.resetQueries({queryKey:['feed']});
            void queryClient.invalidateQueries({queryKey:['profile']});
            toast.success('Post deleted');
            setDeleting(false);
            navigate(`/profile/${post.author_username}`);
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
