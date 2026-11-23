import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/api/client';

type Window = { start: string; end: string };
type Report = Window & {
  users: { id: string; username: string; seconds: number }[];
  has_more: boolean;
};
const formatDate = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
});
const duration = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`;
const period = ({ start, end }: Window) =>
  `${formatDate.format(new Date(start))} to ${formatDate.format(new Date(end))} IST`;

export function WeeklyUsageCard() {
  const usage = useQuery({
    queryKey: ['weekly-usage'],
    queryFn: () => rpc<Window & { seconds: number }>('weekly_usage_total'),
    refetchInterval: 15_000,
  });
  return <section className="weekly-usage-slim mb-4 rounded-2xl border border-line p-4">
    <h2 className="font-semibold">Weekly active time</h2>
    {usage.isPending && <p role="status">Loading active time…</p>}
    {usage.isError && <button onClick={() => void usage.refetch()}>Couldn’t load active time. Retry</button>}
    {usage.data && <>
      <p className="mt-1 text-2xl font-bold tabular-nums">{duration(usage.data.seconds)}</p>
      <p className="text-sm text-fg-2">{period(usage.data)}</p>
    </>}
  </section>;
}

export default function WeeklyUsageReport() {
  const [weeks, setWeeks] = useState(0);
  const [offset, setOffset] = useState(0);
  const report = useQuery({
    queryKey: ['weekly-usage-report', weeks, offset],
    queryFn: () => rpc<Report>('weekly_usage_report', { weeks_ago: weeks, offset }),
  });
  return <section className="mx-auto max-w-3xl space-y-4 p-4">
    <h1 className="text-2xl font-bold">Weekly active time</h1>
    <label className="flex flex-wrap items-center gap-2">Report week
      <select className="rounded-lg border border-line bg-surface p-2" value={weeks} onChange={event => {
        setWeeks(Number(event.target.value));
        setOffset(0);
      }}>
        {Array.from({ length: 53 }, (_, i) => <option key={i} value={i}>{i ? `${i} week(s) ago` : 'Current report week'}</option>)}
      </select>
    </label>
    {report.isPending && <p role="status">Loading weekly report…</p>}
    {report.isError && <button onClick={() => void report.refetch()}>Couldn’t load report. Retry</button>}
    {report.data && <>
      <p className="text-sm text-fg-2">{period(report.data)}</p>
      {report.data.users.length === 0 && <p>No users found for this page.</p>}
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {report.data.users.map(user => <li key={user.id} className="flex justify-between gap-3 p-3">
          <span className="break-all">@{user.username}</span>
          <span className="shrink-0 tabular-nums">{duration(Number(user.seconds))}</span>
        </li>)}
      </ul>
      <nav aria-label="Report pages" className="flex gap-4">
        <button disabled={offset === 0} onClick={() => setOffset(offset - 50)}>Previous</button>
        <button disabled={!report.data.has_more} onClick={() => setOffset(offset + 50)}>Next</button>
      </nav>
    </>}
  </section>;
}
