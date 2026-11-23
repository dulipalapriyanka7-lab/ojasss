import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtSign, Bell, BellOff, CheckCheck, Flame, IndianRupee, Megaphone, MessageCircle, Scale, ShieldAlert, HandHeart, Wallet, Sparkles, type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifications, type AppNotification, type NotificationType } from '@/api';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Avatar, Segmented } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { timeAgo } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { useSeo } from '@/lib/seo';
import { cn, safeInternalPath, useInView } from '@/lib/utils';

const ICONS: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  follow: { icon: HandHeart, tone: 'bg-info-soft text-info' },
  new_post: { icon: Flame, tone: 'bg-hot-soft text-hot' },
  comment: { icon: MessageCircle, tone: 'bg-speak-soft text-speak' },
  engagement: { icon: Flame, tone: 'bg-hot-soft text-hot' },
  message: { icon: AtSign, tone: 'bg-brand-soft text-brand-ink' },
  reward: { icon: IndianRupee, tone: 'bg-success-soft text-success' },
  withdrawal: { icon: Wallet, tone: 'bg-success-soft text-success' },
  announcement: { icon: Megaphone, tone: 'bg-brand-soft text-brand-ink' },
  system: { icon: Bell, tone: 'bg-surface-2 text-fg-2' },
  complaint: { icon: Scale, tone: 'bg-warning-soft text-warning' },
  moderation: { icon: ShieldAlert, tone: 'bg-danger-soft text-danger' },
  episode_unlock: { icon: Sparkles, tone: 'bg-brand-soft text-brand-ink' },
};

export default function NotificationsPage() {
  useSeo({ title: 'Notifications', noindex: true });
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const q = useInfiniteQuery({
    queryKey: ['notifications', filter],
    queryFn: ({ pageParam }) => notifications.list(pageParam, filter === 'unread', 30),
    initialPageParam: null as string | null,
    getNextPageParam: (last: AppNotification[]) => (last.length === 30 ? last[last.length - 1].created_at : undefined),
  });
  const items = (q.data?.pages.flat() ?? []).filter((n) => n.type !== 'message');
  const sentinel = useInView<HTMLDivElement>(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['unread'] });
  };

  const markAll = async () => {
    try {
      const n = await notifications.markRead(null);
      toast.success(n ? `Marked ${n} as read` : 'You are all caught up');
      refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  const open = (n: AppNotification) => {
    if (!n.read_at) void notifications.markRead([n.id]).then(refresh).catch(() => undefined);
    if (n.link) navigate(safeInternalPath(n.link, '/notifications'));
  };

  return (
    <Page width="sm">
      <PageHeader
        title="Notifications"
        actions={<Button variant="ghost" size="sm" onClick={markAll} leading={<CheckCheck aria-hidden size={16} />}>Mark all read</Button>}
      />
      <Segmented label="Filter" value={filter} onChange={setFilter} items={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} className="mb-4" />

      {q.isPending ? (
        <ul className="space-y-2">{Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 p-3"><Skeleton className="size-11 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></li>
        ))}</ul>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={BellOff} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} description="Respect, comments, reactions and reward updates will appear here." />
      ) : (
        <ul className="-mx-2 space-y-1">
          {items.map((n) => {
            const meta = ICONS[n.type] ?? ICONS.system;
            const thumb = n.image_url || mediaUrl(n.post_thumbnail_path);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn('flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface-2', !n.read_at && 'bg-brand-soft/60 dark:bg-brand-soft/40')}
                >
                  <span className="relative shrink-0">
                    {n.actor
                      ? <Avatar path={n.actor.avatar_path} name={n.actor.display_name || n.actor.username} size={44} />
                      : <span className={cn('flex size-11 items-center justify-center rounded-full', meta.tone)}><meta.icon aria-hidden size={20} /></span>}
                    {n.actor && (
                      <span className={cn('absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full ring-2 ring-bg', meta.tone)}>
                        <meta.icon aria-hidden size={11} />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-sm text-fg-2">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-fg-3">{timeAgo(n.created_at)}</span>
                  </span>
                  {thumb && <img src={thumb} alt="" loading="lazy" className="size-12 shrink-0 rounded-lg object-cover" />}
                  {!n.read_at && <span className="size-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={sentinel} aria-hidden className="h-6" />
    </Page>
  );
}
