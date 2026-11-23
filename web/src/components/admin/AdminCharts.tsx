import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12, color: 'var(--text)' };
const axisTick = { fill: 'var(--text-3)', fontSize: 11 };

function label(iso: string, bucket: string) {
  const d = new Date(iso);
  if (bucket === 'hour') return d.toLocaleTimeString('en-IN', { hour: 'numeric' });
  if (bucket === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function TrendChart({ data, bucket, color = 'var(--brand)', format = (v: number) => String(v), name }: {
  data: Array<{ bucket_start: string; value: number }>; bucket: string; color?: string; format?: (v: number) => string; name: string;
}) {
  const rows = data.map((d) => ({ x: label(d.bucket_start, bucket), v: Number(d.value) }));
  const total = rows.reduce((a, r) => a + r.v, 0);
  const id = `g-${name.replace(/\W/g, '')}`;
  return (
    <figure>
      <figcaption className="sr-only">{name}: total {format(total)} over {rows.length} periods.</figcaption>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="x" tick={axisTick} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => format(v)} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [format(Number(v)), name]} />
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

const PALETTE = ['#f0600f', '#7c4dff', '#0e9f8e', '#e0337a', '#2458d6', '#a05a00', '#11845b', '#6b6779'];

export function BreakdownBars({ data, format = (v: number) => String(v), name }: { data: Record<string, number>; format?: (v: number) => string; name: string }) {
  const rows = Object.entries(data).map(([k, v]) => ({ k: k.replace(/_/g, ' '), v: Number(v) })).sort((a, b) => b.v - a.v);
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-fg-3">No data in this range.</p>;
  return (
    <figure>
      <figcaption className="sr-only">{name}: {rows.map((r) => `${r.k} ${format(r.v)}`).join(', ')}</figcaption>
      <div style={{ height: Math.max(120, rows.length * 38) }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="k" tick={axisTick} tickLine={false} axisLine={false} width={130} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [format(Number(v)), name]} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="v" radius={[0, 6, 6, 0]} barSize={18}>
              {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
