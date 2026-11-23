import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Clapperboard} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {seatLabel, shows, SOURCE_NAME, type SeatSource, type SeatStates} from '@/api/shows';
import {SeatMap} from '@/components/shows/SeatMap';
import './admin-business.css';
import './admin-demo.css';

const rupee = (n: number) => '₹' + n.toLocaleString('en-IN');
const local = (iso: string) => { const d = new Date(iso); const z = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };

/** Entry check: paste or scan the text inside a ticket QR (OJT1.…) to verify and check in. */
function VerifyTicket() {
  const [tok, setTok] = useState(""); const [res, setRes] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (checkIn: boolean) => { setBusy(true); setRes(""); try { const r = await shows.adminVerify(tok.trim(), checkIn); setRes((r.already_checked_in ? "⚠ Already checked in · " : "✓ Valid · ") + r.booking_ref + " · " + r.order.seats.map(seatLabel).join(", ") + " · @" + r.order.username + (checkIn && !r.already_checked_in ? " · checked in now" : "")); } catch (e) { setRes("✗ " + (e instanceof Error ? e.message : "Invalid ticket")); } finally { setBusy(false); } };
  return <section className="ab-card"><div className="ab-head"><h2>Check a ticket at entry</h2></div>
    <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}><input className="ab-input" style={{flex: 1, minWidth: 220}} value={tok} onChange={e => setTok(e.target.value)} placeholder="Scanned QR text (OJT1.…)" aria-label="Ticket code" />
      <button type="button" className="ab-btn" disabled={busy || !tok.trim()} onClick={() => void go(false)}>Verify</button>
      <button type="button" className="ab-btn ok" disabled={busy || !tok.trim()} onClick={() => void go(true)}>Check in</button></div>
    {res && <p className="ab-empty" style={{marginTop: 8}}>{res}</p>}
  </section>;
}

/** Admin: premiere show settings, seat blocks for tickets sold elsewhere, booking review. */
export default function AdminShows() {
  const qc = useQueryClient();
  const q = useQuery({queryKey: ['show-admin'], queryFn: () => shows.adminGet(), refetchInterval: 20000});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(''); const [starts, setStarts] = useState(''); const [prices, setPrices] = useState<Record<string, string>>({});
  const show = q.data?.show;
  useEffect(() => { if (!show) return; setTitle(show.title); setStarts(local(show.starts_at)); setPrices(Object.fromEntries(show.sections.map(s => [s.key, String(s.price)]))); }, [show]);
  const seats: SeatStates = useMemo(() => {
    const out: SeatStates = {};
    const orders = new Map((q.data?.orders ?? []).map(o => [o.id, o]));
    for (const [id, oid] of Object.entries(q.data?.taken ?? {})) out[id] = orders.get(oid)?.status === 'confirmed' ? 'sold' : 'held';
    for (const [id, src] of Object.entries(q.data?.blocked ?? {})) out[id] = 'b:' + src;
    return out;
  }, [q.data]);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(''); try { await fn(); setMsg(ok); setSel(new Set()); await qc.invalidateQueries({queryKey: ['show-admin']}); void qc.invalidateQueries({queryKey: ['show']}); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.'); } finally { setBusy(false); } };
  const toggle = (id: string) => setSel(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const s of Object.values(q.data?.blocked ?? {})) c[s] = (c[s] ?? 0) + 1; return c; }, [q.data]);
  const pending = (q.data?.orders ?? []).filter(o => o.status === 'pending');
  const confirmed = (q.data?.orders ?? []).filter(o => o.status === 'confirmed');
  if (!show) return <div className="ab ad"><p className="ab-empty">Loading…</p></div>;
  return <div className="ab ad">
    <div className="ab-top"><div className="ab-title"><span className="ab-logo"><Clapperboard size={16} /></span><div><h1>Premiere show <span className="nav-new-tag">NEW</span></h1><p>{show.theatre}, {show.city} · {confirmed.reduce((t, o) => t + o.seats.length, 0)} seats sold on OJASSS · {rupee(confirmed.reduce((t, o) => t + o.amount, 0))}</p></div></div></div>
    {msg && <p className="ab-empty">{msg}</p>}
    <section className="ab-card">
      <div className="ab-head"><h2>Show & prices</h2></div>
      <div style={{display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))'}}>
        <label style={{fontSize: 12}}>Title<input className="ab-input" style={{width: '100%'}} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label style={{fontSize: 12}}>Show date & time<input className="ab-input" style={{width: '100%', colorScheme: 'dark'}} type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} /></label>
        {show.sections.map(s => <label key={s.key} style={{fontSize: 12}}>{s.name} ₹<input className="ab-input" style={{width: '100%'}} inputMode="numeric" value={prices[s.key] ?? ''} onChange={e => setPrices(p => ({...p, [s.key]: e.target.value.replace(/\D/g, '')}))} /></label>)}
      </div>
      <div style={{display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap'}}>
        <button type="button" className="ab-btn ok" disabled={busy} onClick={() => void run(() => shows.adminSave({title, starts_at: new Date(starts).toISOString(), prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, parseInt(v, 10) || 0]))}), 'Saved.')}>Save</button>
        <button type="button" className="ab-btn" disabled={busy} onClick={() => void run(() => shows.adminSave({status: show.status === 'open' ? 'closed' : 'open'}), show.status === 'open' ? 'Booking closed.' : 'Booking opened.')}>{show.status === 'open' ? 'Close booking' : 'Open booking'}</button>
      </div>
    </section>
    <section className="ab-card">
      <div className="ab-head"><h2>Block seats sold elsewhere</h2><span>{Object.entries(counts).map(([k, v]) => `${SOURCE_NAME[k as SeatSource]} ${v}`).join(' · ') || 'none'}</span></div>
      <p style={{fontSize: 12, opacity: .75, margin: '0 0 8px'}}>Tap seats to select (tap a blocked seat to select it for unblocking), then choose where they were sold.</p>
      <SeatMap show={show} seats={seats} selected={sel} onToggle={toggle} admin />
      <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center'}}>
        <b style={{fontSize: 12}}>{sel.size} selected{sel.size ? ': ' + [...sel].slice(0, 12).map(seatLabel).join(', ') + (sel.size > 12 ? '…' : '') : ''}</b>
        {(['bookmyshow', 'district', 'other', 'admin'] as SeatSource[]).map(s => <button key={s} type="button" className="ab-btn ok" disabled={busy || !sel.size} onClick={() => void run(() => shows.adminBlock([...sel], s), `Blocked as ${SOURCE_NAME[s]}.`)}>{SOURCE_NAME[s]}</button>)}
        <button type="button" className="ab-btn" disabled={busy || !sel.size} onClick={() => void run(() => shows.adminBlock([...sel], ''), 'Unblocked.')}>Unblock</button>
        {sel.size > 0 && <button type="button" className="ab-btn" onClick={() => setSel(new Set())}>Clear</button>}
      </div>
    </section>
    <VerifyTicket />
    <section className="ab-card">
      <div className="ab-head"><h2>Payments to verify</h2><span>{pending.length}</span></div>
      {!pending.length && <p className="ab-empty">Nothing waiting.</p>}
      {pending.map(o => <div key={o.id} style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #ffffff12', fontSize: 12.5}}>
        <div style={{flex: 1, minWidth: 220}}><b>{o.seats.map(seatLabel).join(', ')}</b> · {rupee(o.amount)}{o.coins ? ` (coins ${o.coins})` : ''}<br />@{o.username} · {o.name} · {o.phone} · UTR <code>{o.utr ?? '—'}</code> · UPI {rupee(o.upi_amount)}</div>
        <button type="button" className="ab-btn ok" disabled={busy} onClick={() => void run(() => shows.adminOrder(o.id, 'confirmed'), 'Confirmed.')}>Confirm</button>
        <button type="button" className="ab-btn" disabled={busy} onClick={() => { const r = prompt('Reason for rejecting?') ?? ''; if (r.trim()) void run(() => shows.adminOrder(o.id, 'rejected', r), 'Rejected and seats released.'); }}>Reject</button>
      </div>)}
    </section>
    <section className="ab-card">
      <div className="ab-head"><h2>All bookings</h2><span>{q.data?.orders.length ?? 0}</span></div>
      <div className="cr-table" role="table"><div className="cr-tr cr-th" role="row"><span>Seats</span><span>Member</span><span>Amount</span><span>UTR</span><span>Status</span></div>
        {q.data?.orders.map(o => <div key={o.id} className="cr-tr" role="row"><span className="cr-city"><b>{o.seats.map(seatLabel).join(', ')}</b></span><span>@{o.username}</span><span>{rupee(o.amount)}</span><span>{o.utr ?? '—'}</span><span>{o.status}</span></div>)}
      </div>
    </section>
  </div>;
}
