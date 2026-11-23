import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, Clock, Eye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { posts } from '@/api';
import { Page } from '@/components/layout/AppShell';
import { CommentsPanel } from '@/components/post/Comments';
import { EngagementRail, ViralProgress } from '@/components/post/EngagementRail';
import { PosterView, VideoPlayer } from '@/components/post/MediaView';
import { Caption, CategoryPill, ComplaintDetails, CreatorRow, CtaButton, PostOptions } from '@/components/post/PostMeta';
import { ButtonLink, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useAuth } from '@/hooks/useAuth';
import { useCommentsEnabled, useLivePost, usePostActions } from '@/hooks/usePostActions';
import { categoryLabel } from '@/lib/constants';
import { env } from '@/lib/env';
import { postExpiry } from '@/lib/postExpiry';
import { count, dateTime } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { useSeo } from '@/lib/seo';
import type { PostCard } from '@/api';

function PostView({ card }: { card: PostCard }) {
  const post = useLivePost(card);
  const actions = usePostActions(post);
  const { me } = useAuth();
  const [muted, setMuted] = useState(true);
  const [options, setOptions] = useState(false);
  const commentsRef = useRef<HTMLElement>(null);
  const commentsEnabled = useCommentsEnabled();
  const image = mediaUrl(post.kind === 'poster' ? post.media_path : post.thumbnail_path);

  useSeo({
    title: `${post.author_display_name || '@' + post.author_username}${post.caption ? `: ${post.caption.slice(0, 60)}` : ''}`,
    description: `${categoryLabel(post.category)} · ${count(post.hot_count)} HOT · ${count(post.speak_count)} SPEAK · ${count(post.viral_count)} VIRAL on OJASSS`,
    path: `/post/${post.id}`,
    image,
    type: post.kind === 'video' ? 'video.other' : 'article',
    noindex: post.status !== 'published',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': post.kind === 'video' ? 'VideoObject' : 'ImageObject',
      name: post.caption.slice(0, 100) || `Post by @${post.author_username}`,
      thumbnailUrl: image,
      uploadDate: post.created_at,
      contentUrl: mediaUrl(post.media_path),
      author: { '@type': 'Person', name: post.author_display_name || post.author_username, url: `${env.siteUrl}/profile/${post.author_username}` },
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-8">
      <div className="flex justify-center">
        <div
          className="relative w-full overflow-hidden rounded-3xl bg-black shadow-float lg:h-[calc(100svh-7rem)] lg:w-auto"
          style={{ aspectRatio: post.kind === 'video' ? '9 / 16' : post.width && post.height ? `${post.width} / ${post.height}` : '4 / 5', maxHeight: 'calc(100svh - 7rem)' }}
        >
          {post.kind === 'video' ? (
            <VideoPlayer post={post} active muted={muted} onToggleMute={() => setMuted((m) => !m)} preload="auto" onEnded={()=>{if(post.series_id)void posts.completeEpisode(post.id).catch(()=>undefined);}} />
          ) : (
            <PosterView post={post} priority />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {post.status !== 'published' && (
          <div className="flex items-start gap-3 rounded-2xl bg-warning-soft p-4 text-sm text-warning">
            <Clock aria-hidden size={18} className="mt-0.5 shrink-0" />
            <p>{post.status === 'pending_review' ? 'This post is awaiting review and is only visible to you and moderators.' : `This post is ${post.status.replace('_', ' ')} and is not publicly visible.`}</p>
          </div>
        )}
        <CreatorRow post={post} />
        <Caption text={post.caption} clamp={4} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
          <CategoryPill post={post} />
          <span className="inline-flex items-center gap-1"><Eye aria-hidden size={14} />{count(post.views_count)} views</span>
          <span>· {dateTime(post.created_at)}</span>
        </div>
        {post.has_cta && <CtaButton post={post} />}
        <div className="-mx-2">
          <EngagementRail
            horizontal
            post={post}
            handlers={{
              onHot: () => void actions.engage('hot'),
              onSpeak: () => void actions.engage('speak'),
              onViral: () => void actions.engage('viral'),
              onComments: () => commentsRef.current?.querySelector('textarea')?.focus(),
              onBookmark: () => void actions.toggleBookmark(),
              onShare: () => void actions.share(),
              onMore: () => setOptions(true),
            }}
          />
        </div>
        {!me && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="font-semibold">Join OJASSS to react, speak and earn</p>
            <p className="mt-1 text-sm text-fg-3">HOT, SPEAK and VIRAL reactions help creators earn rewards.</p>
            <div className="mt-3 flex gap-2">
              <ButtonLink to={`/register?next=/post/${post.id}`} size="sm">Create account</ButtonLink>
              <ButtonLink to={`/login?next=/post/${post.id}`} size="sm" variant="secondary">Sign in</ButtonLink>
            </div>
          </div>
        )}
        <ComplaintDetails post={post} />
        <ViralProgress post={post} />
        {commentsEnabled && (
          <section aria-labelledby="comments-h" className="rounded-2xl border border-line bg-surface p-4" ref={commentsRef}>
            <h2 id="comments-h" className="mb-2 font-semibold">Speak <span className="text-fg-3">· {count(post.comments_count)} voices</span></h2>
            <CommentsPanel postId={post.id} commentsCount={post.comments_count} className="max-h-[560px]" />
          </section>
        )}
      </div>
      <PostOptions post={post} open={options} onClose={() => setOptions(false)} />
    </div>
  );
}

export default function PostPage() {
  const { postId = '' } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const valid = /^[0-9a-f-]{36}$/i.test(postId);
  const q = useQuery({ queryKey: ['post', postId, me?.id ?? 'anon'], queryFn: () => posts.get(postId), enabled: valid, refetchInterval: env.mysql ? 5000 : false });
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  return (
    <Page width="xl" className="lg:py-6">
      <div className="mb-4 flex items-center gap-2">
        <IconButton label="Back" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))}><ArrowLeft size={22} /></IconButton>
        <Link to="/" className="text-sm font-semibold text-fg-3 hover:text-fg">OJASSS</Link>
      </div>
      {!valid || (q.isSuccess && (!q.data || (postExpiry(q.data) ?? Infinity) <= now)) ? (
        <EmptyState
          icon={Ban}
          title="This post isn't available"
          description="It may have been removed, made private, or the link is incorrect."
          action={<ButtonLink to="/">View home</ButtonLink>}
        />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Skeleton className="mx-auto aspect-[9/16] w-full max-w-md rounded-3xl lg:h-[calc(100svh-7rem)] lg:w-auto" />
          <div className="space-y-4">
            <div className="flex items-center gap-3"><Skeleton className="size-10 rounded-full" /><Skeleton className="h-4 w-40" /></div>
            <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      ) : (
        <PostView card={q.data!} />
      )}
    </Page>
  );
}
