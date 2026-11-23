import { useInfiniteQuery } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { bookmarks, type PostCard } from '@/api';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { PostGrid } from '@/components/post/PostGrid';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { useSeo } from '@/lib/seo';

const PAGE = 24;

export default function SavedPage() {
  useSeo({ title: 'Saved', noindex: true });
  const q = useInfiniteQuery({
    queryKey: ['saved'],
    queryFn: ({ pageParam }) => bookmarks.list({ limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last: PostCard[], all) => (last.length < PAGE ? undefined : all.flat().length),
  });
  const items = q.data?.pages.flat() ?? [];
  return (
    <Page width="xl">
      <PageHeader title="Saved" description="Videos and posters you bookmarked. Only you can see this list." />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.isPending && items.length === 0 ? (
        <EmptyState icon={Bookmark} title="Nothing saved yet" description="Tap the bookmark on any post to save it for later." action={<ButtonLink to="/">Browse the feed</ButtonLink>} />
      ) : (
        <PostGrid items={items} loading={q.isPending} hasMore={q.hasNextPage} loadingMore={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} />
      )}
    </Page>
  );
}
