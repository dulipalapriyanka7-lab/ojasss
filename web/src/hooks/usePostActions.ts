import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookmarks, engagements, follows, posts, reference, type EngagementKind, type PostCard } from '@/api';
import { useToast } from '@/components/ui/Toast';
import { env } from '@/lib/env';
import { platform } from '@/lib/platform';
import {allowedCtaDestination} from '@/lib/ctaDestination';
import { useAuth } from './useAuth';

// A tiny shared store of per-post overrides (engagement, bookmark, follow) so an action in
// one view (feed) is reflected everywhere (post page, profile grid) without refetching.
type Patch = Partial<Pick<PostCard,
  'votes_count' | 'my_voted' | 'category' | 'viral_at' | 'my_hot' | 'my_speak' | 'my_viral' | 'hot_count' | 'speak_count' | 'viral_count' | 'is_viral' | 'viral_eligible' |
  'my_bookmarked' | 'bookmarks_count' | 'comments_count' | 'shares_count'>>;

const patches = new Map<string, Patch>();
const following = new Map<string, boolean>(); // author_id → following
const subs = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  subs.forEach((s) => s());
};
const subscribe = (s: () => void) => {
  subs.add(s);
  return () => subs.delete(s);
};

export function patchPost(id: string, p: Patch) {
  patches.set(id, { ...patches.get(id), ...p });
  emit();
}
export function setFollowing(authorId: string, v: boolean) {
  following.set(authorId, v);
  emit();
}

/** The card with any live overrides applied. */
export function useLivePost(card: PostCard): PostCard {
  useEffect(() => { if (patches.delete(card.id)) emit(); }, [card]);
  useSyncExternalStore(subscribe, () => version);
  const p = patches.get(card.id);
  const f = following.get(card.author_id);
  if (!p && f === undefined) return card;
  return { ...card, ...p, my_following: f ?? card.my_following };
}

export function usePublicSettings() {
  return useQuery({ queryKey: ['public-settings'], queryFn: reference.settings, staleTime: 30_000, refetchInterval:60_000, enabled: env.configured });
}

/** Comments are an admin switch (Admin → System → Settings); staff always see them to moderate. */
export function useCommentsEnabled(): boolean {
  const { data: settings } = usePublicSettings();
  const { isStaff } = useAuth();
  return isStaff || settings?.['content.comments_enabled'] === true;
}

/** Engagement / bookmark / follow / share / CTA with optimistic UI and rollback. */
export function usePostActions(card: PostCard) {
  const { me } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const requireAuth = useCallback((): boolean => {
    if (me) return true;
    navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
    return false;
  }, [me, navigate]);

  const engage = useCallback(async (kind: EngagementKind) => {
    if (!requireAuth()) return;
    if (me!.id === card.author_id) {
      toast.info('You cannot react to your own post.');
      return;
    }
    const current = { ...card, ...patches.get(card.id) };
    const flag = `my_${kind}` as const;
    const countKey = `${kind}_count` as const;
    if (kind === 'viral' && current.my_viral) return; // VIRAL votes are final
    if (kind === 'viral' && !current.viral_eligible) {
      toast.info('VIRAL happens automatically at 10 Fires and 10 Shares.');
      return;
    }
    const on = !current[flag];
    const before: Patch = { [flag]: current[flag], [countKey]: current[countKey] };
    patchPost(card.id, { [flag]: on, [countKey]: Math.max(0, current[countKey] + (on ? 1 : -1)) });
    if (on) platform.haptic(kind === 'viral' ? 'success' : 'light');
    try {
      const s = await engagements.toggle(card.id, kind);
      patchPost(card.id, s);
      if (s.is_viral && !current.is_viral) toast.success('This post just went VIRAL!');
    } catch (e) {
      patchPost(card.id, before);
      toast.error(e);
    }
  }, [card, me, requireAuth, toast]);

  const toggleBookmark = useCallback(async () => {
    if (!requireAuth()) return;
    const current = { ...card, ...patches.get(card.id) };
    const on = !current.my_bookmarked;
    patchPost(card.id, { my_bookmarked: on, bookmarks_count: Math.max(0, current.bookmarks_count + (on ? 1 : -1)) });
    try {
      const r = await bookmarks.toggle(card.id);
      patchPost(card.id, { my_bookmarked: r.bookmarked, bookmarks_count: r.bookmarks_count });
      toast.success(r.bookmarked ? 'Saved to your collection' : 'Removed from saved');
    } catch (e) {
      patchPost(card.id, { my_bookmarked: current.my_bookmarked, bookmarks_count: current.bookmarks_count });
      toast.error(e);
    }
  }, [card, requireAuth, toast]);

  const toggleFollow = useCallback(async () => {
    if (!requireAuth()) return;
    const was = following.get(card.author_id) ?? card.my_following;
    setFollowing(card.author_id, !was);
    try {
      const r = await follows.toggle(card.author_id);
      setFollowing(card.author_id, r.following);
    } catch (e) {
      setFollowing(card.author_id, was);
      toast.error(e);
    }
  }, [card, requireAuth, toast]);

  const share = useCallback(async () => {
    const url = `${env.siteUrl}/post/${card.id}`;
    try {
    const how = await platform.share({
      title: `${card.author_display_name || '@' + card.author_username} on OJASSS`,
      text: card.caption.slice(0, 120),
      url,
    });
    if (how === 'cancelled') return;
    if (how === 'copied') toast.success('Link copied');
    if (me) {
      try { patchPost(card.id, await posts.recordShare(card.id)); } catch { /* Next feed refresh reconciles counts. */ }
    }
    } catch(error){toast.error(error instanceof Error?error.message:'Could not share this link. Please try again.');}
  }, [card, me, toast]);

  const openCta = useCallback(() => {
    if(!allowedCtaDestination(card.cta_url)){toast.error('This link is not available.');return;}
    // Open during the tap itself: awaiting analytics first loses browser popup permission.
    platform.openExternal(card.cta_url);
    void posts.ctaClick(card.id).catch(()=>undefined);
  }, [card.id,card.cta_url, toast]);

  return { engage, toggleBookmark, toggleFollow, share, openCta, requireAuth };
}
