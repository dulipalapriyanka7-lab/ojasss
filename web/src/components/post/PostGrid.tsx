import { Eye, Flame, Image as ImageIcon, Play } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PostCard } from '@/api';
import { useLivePost } from '@/hooks/usePostActions';
import { count, duration } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { postExpiry } from '@/lib/postExpiry';
import { cn, useInView } from '@/lib/utils';
import { Skeleton, Spinner, StatusBadge } from '../ui/Feedback';

const Tile = memo(function Tile({ post: card, masonry, showStatus }: { post: PostCard; masonry?: boolean; showStatus?: boolean }) {
  const post = useLivePost(card);
  const src = mediaUrl(post.kind === 'poster' ? post.media_path : post.thumbnail_path);
  const [coverFailed,setCoverFailed]=useState(false);
  useEffect(()=>setCoverFailed(false),[src]);
  const ratio = post.width && post.height ? post.width / post.height : post.kind === 'video' ? 9 / 16 : 4 / 5;
  return (
    <Link
      to={`/post/${post.id}`}
      className={cn(
        'group relative block overflow-hidden rounded-2xl bg-surface-2 outline-offset-2',
        masonry ? 'mb-3 break-inside-avoid' : 'aspect-[9/16]',
      )}
      style={masonry ? { aspectRatio: String(Math.max(0.56, Math.min(1.5, ratio))) } : undefined}
      aria-label={`${post.kind === 'video' ? 'Video' : 'Poster'} by @${post.author_username}${post.caption ? `: ${post.caption.slice(0, 80)}` : ''}`}
    >
      {src&&!coverFailed ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={()=>setCoverFailed(true)} className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
      ) : (
        <div className="flex size-full items-center justify-center text-fg-3"><Play aria-hidden size={28} /></div>
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10 opacity-90" />
      <div className="absolute top-2 left-2 flex gap-1.5">
        {post.kind === 'video' ? (
          <span className="flex h-[22px] items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 text-[10.5px] font-semibold leading-none text-white tabular-nums backdrop-blur-md">
            <Play aria-hidden size={11} className="fill-white" />{post.duration_ms ? duration(post.duration_ms) : 'Video'}
          </span>
        ) : (
          <span className="flex h-[22px] items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 text-[10.5px] font-semibold leading-none text-white tabular-nums backdrop-blur-md"><ImageIcon aria-hidden size={11} />Poster</span>
        )}
        {post.is_viral && <span className="flex h-6 items-center rounded-full bg-viral px-2 text-[11px] font-bold text-white">VIRAL</span>}
      </div>
      {showStatus && post.status !== 'published' && <StatusBadge status={post.status} className="absolute top-2 right-2" />}
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-3 text-xs font-semibold text-white drop-shadow">
        <span className="flex items-center gap-1"><Eye aria-hidden size={13} />{count(post.views_count)}</span>
        <span className="flex items-center gap-1"><Flame aria-hidden size={13} />{count(post.hot_count)}</span>
      </div>
    </Link>
  );
});

export function PostGrid({
  items, loading, hasMore, loadingMore, onLoadMore, variant = 'grid', showStatus, skeletonCount = 12, className,
}: {
  items: PostCard[];
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  variant?: 'grid' | 'masonry';
  showStatus?: boolean;
  skeletonCount?: number;
  className?: string;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const visibleItems = items.filter(p => (postExpiry(p) ?? Infinity) > now);
  const sentinel = useInView<HTMLDivElement>(() => {
    if (hasMore && !loadingMore) onLoadMore?.();
  });

  if (loading) {
    return (
      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5', className)} aria-label="Loading posts" role="status">
        {Array.from({ length: skeletonCount }, (_, i) => <Skeleton key={i} className="aspect-[9/16] rounded-2xl" />)}
      </div>
    );
  }

  return (
    <>
      {variant === 'masonry' ? (
        <div className={cn('columns-2 gap-3 sm:columns-3 lg:columns-4 2xl:columns-5', className)}>
          {visibleItems.map((p) => <Tile key={p.id} post={p} masonry showStatus={showStatus} />)}
        </div>
      ) : (
        <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5', className)}>
          {visibleItems.map((p) => <Tile key={p.id} post={p} showStatus={showStatus} />)}
        </div>
      )}
      <div ref={sentinel} aria-hidden className="h-4" />
      {loadingMore && <div className="flex justify-center py-6"><Spinner /></div>}
    </>
  );
}
