import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Flame, Image as ImageIcon, Search, SearchX, Sparkles, Users, Video, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { posts, users, type Category, type PostCard, type PostKind, type Profile } from '@/api';
import { Page } from '@/components/layout/AppShell';
import { PostGrid } from '@/components/post/PostGrid';
import { Button } from '@/components/ui/Button';
import { Chip, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { RegionPicker } from '@/components/ui/RegionPicker';
import { Avatar, Segmented, VerifiedMark } from '@/components/ui/Misc';
import {useCategories} from '@/hooks/useCategories';
import { useAuth } from '@/hooks/useAuth';
import { LANGUAGES } from '@/lib/constants';
import { count } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { useDebounced } from '@/lib/utils';
import './discover.css';

const PAGE = 20;
type TypeFilter = 'all' | PostKind;

function CreatorCard({ p }: { p: Profile }) {
  return (
    <Link to={`/profile/${p.username}`} className="discover-creator group flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-line bg-surface p-2.5 text-center transition-colors hover:bg-surface-2">
      <Avatar path={p.avatar_path} name={p.display_name || p.username} size={44} />
      <span className="flex w-full items-center justify-center gap-1 text-sm font-semibold"><span className="truncate">{p.display_name || p.username}</span>{p.is_verified && <VerifiedMark size={14} />}</span>
      <span className="-mt-1.5 w-full truncate text-xs text-fg-3">@{p.username}</span>
      <span className="text-xs text-fg-2"><strong className="tabular">{count(p.followers_count)}</strong> respected by</span>
    </Link>
  );
}

function UserRow({ p }: { p: Profile }) {
  return (
    <Link to={`/profile/${p.username}`} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-surface-2">
      <Avatar path={p.avatar_path} name={p.display_name || p.username} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-semibold"><span className="truncate">{p.display_name || p.username}</span>{p.is_verified && <VerifiedMark size={15} />}</span>
        <span className="block truncate text-sm text-fg-3">@{p.username} · {count(p.followers_count)} followers</span>
      </span>
    </Link>
  );
}

export default function ExplorePage() {
  const categories=useCategories();
  const [params, setParams] = useSearchParams();
  const { me } = useAuth();
  const [q, setQ] = useState(params.get('q') ?? '');
  const debounced = useDebounced(q.trim(), 350);
  const category = (params.get('category') as Category | null) ?? null;
  const language = params.get('lang');
  const type = (params.get('type') as TypeFilter | null) ?? 'all';
  const kind = type === 'all' ? null : type;
  const searching = debounced.length >= 2;

  useSeo({ title: 'Discover', description: 'Trending videos, posters and creators on OJASSS.', path: '/explore' });

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const filters = { kind, category, language };
  const trending = useInfiniteQuery({
    queryKey: ['explore', 'trending', filters, me?.id],
    queryFn: ({ pageParam }) => posts.trending({ ...filters, days: 7, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last: PostCard[], all) => (last.length < PAGE ? undefined : all.flat().length),
    enabled: !searching,
  });
  const latest = useQuery({
    queryKey: ['explore', 'latest', filters, me?.id],
    queryFn: () => posts.feed({ mode: 'latest', limit: 10, ...filters }),
    enabled: !searching,
  });
  const creators = useQuery({ queryKey: ['explore', 'creators', me?.id], queryFn: () => users.popular(12), enabled: !searching });

  const postResults = useInfiniteQuery({
    queryKey: ['search', 'posts', debounced, filters],
    queryFn: ({ pageParam }) => posts.search(debounced, { ...filters, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last: PostCard[], all) => (last.length < PAGE ? undefined : all.flat().length),
    enabled: searching,
  });
  const userResults = useQuery({ queryKey: ['search', 'users', debounced], queryFn: () => users.search(debounced, { limit: 8 }), enabled: searching });

  const trendingItems = trending.data?.pages.flat() ?? [];
  const resultItems = postResults.data?.pages.flat() ?? [];

  return (
    <Page width="xl" className="discover-page">
      <div className="mb-3">
        <h1 className="text-xl font-bold">Discover</h1>
        <p className="mt-0.5 text-xs text-fg-3">Fresh videos. New creators. Your next inspiration.</p>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="discover-search relative mb-1">
        <label htmlFor="explore-search" className="sr-only">Search creators, videos and posters</label>
        <Search aria-hidden size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
        <input
          id="explore-search"
          autoFocus={params.get('focus')==='search'}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setParam('q', e.target.value.trim() || null);
          }}
          placeholder="Search videos or creators"
          autoComplete="off"
          className="h-11 w-full rounded-lg border-0 border-b border-line bg-transparent pr-11 pl-9 text-base outline-none placeholder:text-fg-3 focus:border-brand"
        />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => { setQ(''); setParam('q', null); }} className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-fg-3 hover:bg-surface-2">
            <X aria-hidden size={18} />
          </button>
        )}
      </form>

      <div className="discover-filters mb-4 flex min-w-0 flex-col gap-1 lg:flex-row lg:items-center">
        <div className="discover-categories -mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:flex-1 lg:px-0">
          <Chip selected={!category} onClick={() => setParam('category', null)} icon={Sparkles}>All</Chip>
          {categories.map((c) => (
            <Chip key={c.value} selected={category === c.value} onClick={() => setParam('category', category === c.value ? null : c.value)} icon={c.icon}>
              {c.label}
            </Chip>
          ))}
        </div>
        <div className="discover-type-row flex min-w-0 items-center gap-2">
          <Segmented
            label="Content type"
            size="sm"
            value={type}
            onChange={(v) => setParam('type', v === 'all' ? null : v)}
            items={[
              { value: 'all', label: 'All' },
              { value: 'video', label: <span className="flex items-center gap-1"><Video aria-hidden size={14} />Videos</span> },
              { value: 'poster', label: <span className="flex items-center gap-1"><ImageIcon aria-hidden size={14} />Posters</span> },
            ]}
          />
          <label htmlFor="explore-lang" className="sr-only">Language</label>
          <RegionPicker id="explore-lang" label="Language" value={language??''} onChange={v=>setParam('lang',v||null)} options={LANGUAGES} emptyLabel="All languages" className="discover-language !h-11 !w-36 shrink !rounded-lg text-xs"/>
        </div>
      </div>

      {searching ? (
        <div className="space-y-5">
          {(userResults.data?.length ?? 0) > 0 && (
            <section aria-labelledby="people-h">
              <h2 id="people-h" className="mb-2 flex items-center gap-2 text-lg font-semibold"><Users aria-hidden size={18} /> People</h2>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{userResults.data!.map((p) => <UserRow key={p.id} p={p} />)}</div>
            </section>
          )}
          <section aria-labelledby="posts-h">
            <h2 id="posts-h" className="mb-3 text-lg font-semibold">Posts</h2>
            {postResults.isError ? (
              <ErrorState error={postResults.error} onRetry={() => void postResults.refetch()} compact />
            ) : !postResults.isPending && resultItems.length === 0 && (userResults.data?.length ?? 0) === 0 ? (
              <EmptyState className="discover-empty" icon={SearchX} title={`No results for “${debounced}”`} description="Try a different word, a creator's username, or clear the filters." action={<Button variant="secondary" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Clear search</Button>} compact />
            ) : (
              <PostGrid
                items={resultItems}
                loading={postResults.isPending}
                hasMore={postResults.hasNextPage}
                loadingMore={postResults.isFetchingNextPage}
                onLoadMore={() => void postResults.fetchNextPage()}
                variant={kind === 'poster' ? 'masonry' : 'grid'}
              />
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="creators-h">
            <h2 id="creators-h" className="mb-2 text-sm font-semibold">Popular creators</h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
              {creators.isPending
                ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-32 w-28 shrink-0 rounded-xl" />)
                : (creators.data ?? []).length === 0
                  ? <p className="text-sm text-fg-3">Creators will appear here as the community grows.</p>
                  : creators.data!.map((p) => <CreatorCard key={p.id} p={p} />)}
            </div>
          </section>

          <section aria-labelledby="trending-h">
            <h2 id="trending-h" className="mb-3 flex items-center gap-2 text-lg font-semibold"><Flame aria-hidden size={20} className="text-hot" /> Trending this week</h2>
            {trending.isError ? (
              <ErrorState error={trending.error} onRetry={() => void trending.refetch()} compact />
            ) : !trending.isPending && trendingItems.length === 0 ? (
              <EmptyState className="discover-empty" icon={Flame} title="Nothing trending yet" description="This week's popular posts will appear here." compact />
            ) : (
              <PostGrid
                items={trendingItems}
                loading={trending.isPending}
                hasMore={trending.hasNextPage}
                loadingMore={trending.isFetchingNextPage}
                onLoadMore={() => void trending.fetchNextPage()}
                variant={kind === 'poster' ? 'masonry' : 'grid'}
              />
            )}
          </section>

          {!trending.hasNextPage && (latest.data?.length ?? 0) > 0 && (
            <section aria-labelledby="latest-h">
              <h2 id="latest-h" className="mb-3 text-lg font-semibold">Latest uploads</h2>
              <PostGrid items={latest.data!} />
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
