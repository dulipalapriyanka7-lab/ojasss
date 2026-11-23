import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EarningPoint } from '@/api';
import { rupees } from '@/lib/format';

const fmtBucket = (d: string, bucket: 'day' | 'week' | 'month') => {
  const date = new Date(d);
  return bucket === 'month'
    ? date.toLocaleDateString('en-IN', { month: 'short' })
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Stacked approved/pending earnings. Loaded lazily (charts chunk). */
export default function EarningsChart({ data, bucket }: { data: EarningPoint[]; bucket: 'day' | 'week' | 'month' }) {
  const rows = data.map((d) => ({ label: fmtBucket(d.bucket_start, bucket), approved: Number(d.approved_paise) / 100, pending: Number(d.pending_paise) / 100 }));
  const total = rows.reduce((a, r) => a + r.approved + r.pending, 0);
  return (
    <figure>
      <figcaption className="sr-only">
        Earnings by {bucket}: total {rupees(total * 100)} across {rows.length} periods.
      </figcaption>
      <div className="h-64 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} width={52} />
            <Tooltip
              cursor={{ fill: 'color-mix(in srgb, var(--surface-3) 60%, transparent)' }}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text)' }}
              formatter={(v, name) => [rupees(Number(v) * 100), name === 'approved' ? 'Approved' : 'Pending review']}
            />
            <Bar dataKey="approved" stackId="a" fill="var(--success)" radius={[0, 0, 4, 4]} />
            <Bar dataKey="pending" stackId="a" fill="var(--warning)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-fg-3">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success" />Approved</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warning" />Pending review</span>
      </div>
    </figure>
  );
}
