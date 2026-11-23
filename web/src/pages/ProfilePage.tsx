import {ProfileBusinessCard} from '@/components/AccountTypePrompt';
import {DownloadAppCard} from '@/components/ui/DownloadAppCard';
import {StatusStories} from '@/components/profile/StatusStories';
import {ProfileTaskProgress} from '@/pages/MemberProgram';
import {FeedbackCard} from '@/pages/FeedbackPage';
import {Crown} from 'lucide-react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Bookmark, Calendar, Clapperboard, Flag, Flame, Image as ImageIcon, MessageCircle, MoreHorizontal, Rocket, Settings, BadgeCheck, HandHeart, UserX, Users } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { blocks, bookmarks, follows, messages, posts, users, type PostCard, type Profile } from '@/api';
import { ApiError } from '@/api/client';
import { Page } from '@/components/layout/AppShell';
import { PostGrid } from '@/components/post/PostGrid';
import { ReportDialog } from '@/components/post/ReportDialog';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Avatar, Tabs, VerifiedMark } from '@/components/ui/Misc';
import { ConfirmDialog, Dialog } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { count, date } from '@/lib/format';
import { avatarUrl } from '@/lib/media';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/utils';

type Tab = 'videos' | 'posters' | 'viral' | 'saved';
const PAGE = 24;

function FollowList({ user, direction, onClose }: { user: Profile; direction: 'followers' | 'following'; onClose: () => void }) {
  const q = useQuery({ queryKey: ['follows', user.id, direction], queryFn: () => follows.list(user.id, direction, { limit: 100 }) });
  return (
    <Dialog open onClose={onClose} title={direction === 'followers' ? 'Respected by' : 'Respecting'} size="sm">
      {q.isPending ? (
        <div className="space-y-3 py-2">{Array.from({ length: 5 }, (_, i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-11 rounded-full" /><Skeleton className="h-4 w-32" /></div>)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : q.data!.length === 0 ? (
        <EmptyState icon={Users} title={direction === 'followers' ? 'No followers yet' : 'Not following anyone yet'} description={direction === 'followers' ? 'Share great posts to grow your audience.' : 'Discover creators in the home feed.'} compact />
      ) : (
        <ul className="-mx-2 pb-2">
          {q.data!.map((p) => (
            <li key={p.id}>
              <Link to={`/profile/${p.username}`} onClick={onClose} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
                <Avatar path={p.avatar_path} name={p.display_name || p.username} size={44} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-semibold"><span className="truncate">{p.display_name || p.username}</span>{p.is_verified && <VerifiedMark size={14} />}</span>
                  <span className="block truncate text-sm text-fg-3">@{p.username}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function ProfileHeader({ user }: { user: Profile }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [following, setFollowingState] = useState(user.is_following);
  const [followers, setFollowers] = useState(user.followers_count);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [list, setList] = useState<'followers' | 'following' | null>(null);
  const [busy, setBusy] = useState(false);
  const name = user.display_name || user.username;

  const toggleFollow = async () => {
    if (!me) return navigate(`/login?next=/profile/${user.username}`);
    const was = following;
    setFollowingState(!was);
    setFollowers((n) => n + (was ? -1 : 1));
    try {
      const r = await follows.toggle(user.id);
      setFollowingState(r.following);
      setFollowers(r.followers_count);
    } catch (e) {
      setFollowingState(was);
      setFollowers(user.followers_count);
      toast.error(e);
    }
  };

  const message = async () => {
    if (!me) return navigate(`/login?next=/profile/${user.username}`);
    setBusy(true);
    try {
      const id = await messages.open(user.id);
      navigate(`/messages/${id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    setBusy(true);
    try {
      if (user.blocked_by_me) {
        await blocks.unblock(user.id);
        toast.success(`Unblocked @${user.username}`);
      } else {
        await blocks.block(user.id);
        toast.success(`Blocked @${user.username}. They can no longer see or contact you.`);
      }
      setConfirmBlock(false);
      await qc.invalidateQueries({ queryKey: ['profile', user.username] });
      await qc.invalidateQueries({ queryKey: ['feed'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="profile-redesign mb-5 text-left">
      <section className="profile-identity-card">
        <div aria-hidden className="profile-identity-art">
          {avatarUrl(user.avatar_path)
            ? <img src={avatarUrl(user.avatar_path)!} alt="" />
            : <div />}
        </div>
        <div className="profile-identity-main">
          <div className="profile-avatar-shell">
            <Avatar path={user.avatar_path} name={name} size={68} className="shrink-0" status={!!user.status_post_id} premium={!!user.is_premium} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="profile-display-name">
              <span className="truncate">{name}</span>
              {user.is_verified && <VerifiedMark size={18} />}
            </h1>
            <p className="profile-user-handle">@{user.username}</p>
            {user.has_viral_badge && (
              <span className="profile-viral-badge">
                <Rocket aria-hidden size={14} /> VIRAL creator
              </span>
            )}
          </div>
        </div>
        {(user.bio || user.phone || user.interests) && <div className="profile-identity-details">
          {user.bio && <p className="profile-bio">{user.bio}</p>}
          {user.phone && <a className="profile-phone" href={`tel:${user.phone.replace(/[^+0-9]/g, '')}`}>{user.phone}</a>}
          {user.interests && <p className="profile-interests"><span>Interests</span>{user.interests}</p>}
        </div>}
      </section>

      <div className="profile-dashboard-actions">
          {user.is_me ? (
            <>
              <ButtonLink to="/settings" aria-label="Edit profile" variant="secondary" className="profile-dashboard-action profile-action-edit" leading={<Settings aria-hidden size={18} />}>Edit profile</ButtonLink>
              <ButtonLink to="/?category=one_chance" variant="secondary" className="profile-dashboard-action profile-action-chance" leading={<Crown size={18}/>}>One Chance</ButtonLink>
              <ButtonLink to="/saved" variant="secondary" className="profile-dashboard-action profile-action-saved" leading={<Bookmark aria-hidden size={18} />}>Saved</ButtonLink>
            </>
          ) : user.blocked_by_me ? (
            <Button className="profile-visitor-action" variant="outline" onClick={() => void toggleBlock()} loading={busy} leading={<UserX aria-hidden size={18} />}>Unblock</Button>
          ) : (
            <>
              <Button className="profile-visitor-action" onClick={toggleFollow} variant={following ? 'secondary' : 'primary'} leading={following ? <BadgeCheck aria-hidden size={18} /> : <HandHeart aria-hidden size={18} />}>
                {following ? 'Respecting' : user.follows_me ? 'Respect back' : 'Respect'}
              </Button>
              <Button className="profile-visitor-action" variant="secondary" onClick={message} loading={busy} leading={<MessageCircle aria-hidden size={18} />}>Message</Button>
              <IconButton label="More profile options" className="profile-more-action" variant="secondary" onClick={() => setMenu(true)}><MoreHorizontal size={20} /></IconButton>
            </>
          )}
      </div>

      <div className="profile-metrics" aria-label="Profile statistics">
        <div className="profile-metric profile-metric-posts"><Clapperboard aria-hidden size={16}/><span className="profile-metric-value">{count(user.posts_count)}</span><span className="profile-metric-label">Posts</span></div>
        <button type="button" onClick={()=>setList('followers')} className="profile-metric profile-metric-followers"><Users aria-hidden size={16}/><span className="profile-metric-value">{count(followers)}</span><span className="profile-metric-label">Respected by</span></button>
        <button type="button" onClick={()=>setList('following')} className="profile-metric profile-metric-following"><BadgeCheck aria-hidden size={16}/><span className="profile-metric-value">{count(user.following_count)}</span><span className="profile-metric-label">Respecting</span></button>
      </div>
      <p className="profile-joined"><Calendar aria-hidden size={14} /> Joined {date(user.created_at)}</p>

      {list && <FollowList user={user} direction={list} onClose={() => setList(null)} />}

      <Dialog open={menu} onClose={() => setMenu(false)} title="Profile options" size="sm">
        <div className="flex flex-col gap-1 pb-1">
          <button type="button" className="flex h-13 items-center gap-3 rounded-xl px-3 text-left font-medium text-danger hover:bg-surface-2" onClick={() => { setMenu(false); setReporting(true); }}>
            <Flag aria-hidden size={20} /> Report @{user.username}
          </button>
          <button type="button" className="flex h-13 items-center gap-3 rounded-xl px-3 text-left font-medium text-danger hover:bg-surface-2" onClick={() => { setMenu(false); setConfirmBlock(true); }}>
            <Ban aria-hidden size={20} /> Block @{user.username}
          </button>
          <Button variant="secondary" className="mt-2" onClick={() => setMenu(false)}>Cancel</Button>
        </div>
      </Dialog>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={user.id} />
      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={toggleBlock}
        loading={busy}
        tone="danger"
        confirmLabel="Block"
        title={`Block @${user.username}?`}
        description="They won't be able to see your posts, message you or find your profile. You'll also stop following each other."
      />
    </header>
  );
}

const ProfileTaskAdmin=lazy(()=>import('@/components/admin/ProfileTaskAdmin'));

export default function ProfilePage() {
  const { handle = '' } = useParams();
  const { me, isAdmin } = useAuth();
  const [manageTasks,setManageTasks]=useState(false);
  const [tab, setTab] = useState<Tab>('videos');
  const profile = useQuery({ queryKey: ['profile', handle.toLowerCase(), me?.id], queryFn: () => users.get(handle) });
  const user = profile.data;
  const isMe = !!user?.is_me;

  useSeo({
    title: user ? `${user.display_name || user.username} (@${user.username})` : 'Profile',
    description: user?.bio || (user ? `Watch videos and posters by @${user.username} on OJASSS.` : undefined),
    path: `/profile/${handle}`,
    image: avatarUrl(user?.avatar_path),
    type: 'profile',
  });

  const content = useInfiniteQuery({
    queryKey: ['profile-posts', user?.id, tab, me?.id],
    queryFn: ({ pageParam }) =>
      tab === 'saved' ? bookmarks.list({ limit: PAGE, offset: pageParam }) : posts.byUser(user!.id, (tab === 'videos' || tab === 'viral') ? 'video' : 'poster', { limit: PAGE, offset: pageParam, viralOnly: tab === 'viral' }),
    initialPageParam: 0,
    getNextPageParam: (last: PostCard[], all) => (last.length < PAGE ? undefined : all.flat().length),
    enabled: !!user && !user.blocked_by_me,
  });
  // Viral is deliberately a view of the profile owner's existing video feed.
  // Keeping the data source and cards identical preserves playback and engagement UI.
  const items = (content.data?.pages.flat() ?? []).filter((post) => tab !== 'viral' || post.is_viral);

  if (profile.isError) {
    const nf = profile.error instanceof ApiError && profile.error.kind === 'not_found';
    return (
      <Page>
        {nf
          ? <EmptyState icon={UserX} title="Profile not available" description="This account may not exist, may be restricted, or isn't visible to you." action={<ButtonLink to="/">View creators</ButtonLink>} />
          : <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />}
      </Page>
    );
  }

  return (
    <Page width="lg">
      {!user ? (
        <div className="space-y-4 pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row"><Skeleton className="size-16 rounded-full" /><div className="space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-28" /></div></div>
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <StatusStories />
          <ProfileHeader key={user.id} user={user} />
          {isMe&&<section className="profile-creator-tools mb-5" aria-label="Creator tools">
            <DownloadAppCard variant="profile" />
            {tab !== 'viral' && <ButtonLink to="/upload?episode=1" className="profile-upload-episode" leading={<Clapperboard aria-hidden size={19}/>}>Upload next episode</ButtonLink>}
          </section>}
          {isMe && <ProfileBusinessCard />}
          {isMe && <ProfileTaskProgress />}
          {isMe && <FeedbackCard />}
          {isAdmin&&<div className="mb-4 task-actions"><button type="button" aria-expanded={manageTasks} onClick={()=>setManageTasks(!manageTasks)}>{manageTasks?'Close task management':'Manage profile tasks'}</button></div>}
          {isAdmin&&manageTasks&&<div className="mb-4"><Suspense fallback={<p role="status">Loading tasks…</p>}><ProfileTaskAdmin key={user.id} userId={user.id}/></Suspense></div>}
          <Link to={`/viral-history/${user.id}`} className="mb-4 flex min-h-11 items-center gap-2 text-sm font-semibold text-orange-300"><Flame size={17}/>Viral Trend History<span className="ml-auto text-xs text-fg-3">Weekly achievements →</span></Link>
          {user.blocked_by_me ? (
            <EmptyState icon={Ban} title={`You blocked @${user.username}`} description="Unblock to see their posts again." />
          ) : (
            <>
              <Tabs
                label="Profile content"
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'videos', label: <span className="flex items-center gap-2"><Clapperboard aria-hidden size={17} />Videos</span> },
                  { value: 'posters', label: <span className="flex items-center gap-2"><ImageIcon aria-hidden size={17} />Posters</span> },
                  {
                    value: 'viral',
                    label: <span className="profile-viral-tab flex items-center gap-2"><Flame aria-hidden size={17} />Viral</span>,
                    activeClassName: 'text-fuchsia-300',
                    indicatorClassName: 'bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 shadow-[0_0_12px_rgba(217,70,239,.85)]',
                  },
                  ...(isMe ? [{ value: 'saved' as const, label: <span className="flex items-center gap-2"><Bookmark aria-hidden size={17} />Saved</span> }] : []),
                ]}
                className="profile-content-tabs mb-5"
              />
              {content.isError ? (
                <ErrorState error={content.error} onRetry={() => void content.refetch()} compact />
              ) : !content.isPending && items.length === 0 ? (
                <EmptyState
                  icon={tab === 'saved' ? Bookmark : tab === 'posters' ? ImageIcon : tab === 'viral' ? Flame : Clapperboard}
                  title={tab === 'saved' ? 'Nothing saved yet' : tab === 'viral' ? (isMe ? 'No viral videos yet' : 'No viral videos yet') : isMe ? `You haven't posted any ${tab} yet` : `No ${tab} yet`}
                  description={tab === 'saved' ? 'Tap the bookmark on any post to keep it here.' : tab === 'viral' ? 'Videos that reach viral status will appear here.' : isMe ? 'Share your first one — it only takes a minute.' : `When @${user.username} posts ${tab}, they'll show up here.`}
                  action={isMe && tab !== 'saved' && tab !== 'viral' ? <ButtonLink to="/upload">Upload</ButtonLink> : tab === 'saved' ? <ButtonLink to="/" variant="secondary">Home</ButtonLink> : undefined}
                  compact
                />
              ) : (
                <PostGrid
                  items={items}
                  loading={content.isPending}
                  hasMore={content.hasNextPage}
                  loadingMore={content.isFetchingNextPage}
                  onLoadMore={() => void content.fetchNextPage()}
                  variant={tab === 'posters' ? 'masonry' : 'grid'}
                  showStatus={isMe}
                  className={cn('profile-media-grid', (tab === 'videos' || tab === 'viral') && 'lg:grid-cols-4')}
                />
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}
