import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { competition } from '@/api/competition';
import { WeeklyChallenges } from '@/components/feed/WeeklyChallenges';
import { Page } from '@/components/layout/AppShell';
import { PostGrid } from '@/components/post/PostGrid';
import { ErrorState } from '@/components/ui/Feedback';

export default function ViralHistoryPage() {
  const { userId } = useParams();
  const query = useQuery({
    queryKey: ['viral-history', userId],
    queryFn: () => competition.history(userId),
  });

  return (
    <Page width="sm" className="weekly-history-page">
      <h1 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <Flame className="text-orange-400" size={21} aria-hidden />Viral Trend History
      </h1>
      {query.isPending ? <p>Loading weekly results…</p> : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data.length ? (
        <p className="text-sm text-fg-3">Weekly challenges and results appear here after the week locks.</p>
      ) : query.data.map(({ competition: week, entry, videos, has_results }) => (
        <article key={week.id} className="mb-3 rounded-xl border border-line p-3">
          <h2 className="text-sm font-semibold">
            {new Date(week.start).toLocaleDateString(undefined, { timeZone: week.config.timezone })}
            {entry && ` · Rank #${entry.rank}`}
          </h2>
          <WeeklyChallenges names={week.challenges} locked />
          {entry && <p className="my-2 text-xs text-fg-3">
            {entry.votes} votes · {entry.views} views · {entry.viral} qualified videos · {Math.floor(entry.seconds / 60)} active minutes
          </p>}
          {!!videos?.length && <details className="my-2">
            <summary className="cursor-pointer py-2 text-sm text-fg-2">{videos.length} Viral {videos.length === 1 ? 'video' : 'videos'}</summary>
            <PostGrid items={videos} className="mt-1" />
          </details>}
          {has_results !== false && <Link className="inline-flex min-h-11 items-center text-sm text-brand-ink" to={`/leaderboard?week=${week.id}`}>
            View locked results →
          </Link>}
        </article>
      ))}
    </Page>
  );
}
