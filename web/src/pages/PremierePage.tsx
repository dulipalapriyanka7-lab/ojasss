import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Armchair, ArrowLeft, Calendar, Check, Clock3, Coins, Copy, IndianRupee, MapPin, ShieldCheck, Ticket, X} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {Link, useNavigate} from 'react-router-dom';
import {coins as coinApi} from '@/api/coins';
import {seatLabel, shows, type ShowOrder} from '@/api/shows';
import {SeatMap} from '@/components/shows/SeatMap';
import {useAuth} from '@/hooks/useAuth';
import {useSeo} from '@/lib/seo';
import {cn} from '@/lib/utils';
import './premiere.css';
import './premiere-v2.css';

const rupee = (n: number) => '₹' + n.toLocaleString('en-IN');
const pad = (n: number) => String(Math.max(0, n)).padStart(2, '0');
function useNow(ms = 1000) { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]); return n; }
const STATUS: Record<ShowOrder['status'], string> = {held: 'Seats held · finish payment', pending: 'Payment being verified', confirmed: 'Confirmed', rejected: 'Not confirmed', expired: 'Hold expired', cancelled: 'Cancelled'};

/** Premium premiere: poster hero, live countdown to showtime, seat map, hold → pay → confirm. */
export default function PremierePage() {
  useSeo({title: 'Muta Mestri · Premiere', noindex: false});
  const {me} = useAuth(); const nav = useNavigate(); const qc = useQueryClient(); const now = useNow();
  const q = useQuery({queryKey: ['show'], queryFn: () => shows.get(), refetchInterval: 15000});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [order, setOrder] = useState<ShowOrder | null>(null);
  const show = q.data?.show;
  const price = useMemo(() => { const m = new Map<string, number>(); show?.sections.forEach(s => m.set(s.key, s.price)); return m; }, [show]);
  const total = [...sel].reduce((t, id) => t + (price.get(id.split(':')[0]) ?? 0), 0);
  const held = q.data?.my_orders.find(o => o.status === 'held' && Date.parse(o.expires_at) > now) ?? null;
  useEffect(() => { if (held && !order) setOrder(held); }, [held, order]);
  if (q.isLoading || !show) return <main className="pm"><div className="pm-loading"><img src="/brand/mark.png" alt="" width={40} height={40} /><span>Loading premiere…</span></div></main>;
  const left = Date.parse(show.starts_at) - now;
  const open = show.status === 'open' && left > 0;
  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else if (n.size < 10) n.add(id); return n; });
  const confirm = async () => {
    if (!me) { nav('/login?next=/premiere'); return; }
    setBusy(true); setErr('');
    try { const o = await shows.hold([...sel]); setOrder(o); setSel(new Set()); void qc.invalidateQueries({queryKey: ['show']}); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not hold seats.'); void q.refetch(); }
    finally { setBusy(false); }
  };
  const when = new Date(show.starts_at);
  const h = Math.floor(left / 3600000), m = Math.floor(left % 3600000 / 60000), s = Math.floor(left % 60000 / 1000);
  const mine = (q.data?.my_orders ?? []).filter(o => o.status !== 'held' && o.status !== 'cancelled' && o.status !== 'expired');
  return <main className="pm">
        <header className="pm-top">
      <button type="button" className="pm-icon" aria-label="Back" onClick={() => nav(-1)}><ArrowLeft size={18} /></button>
      <Link to="/" className="pm-brand"><img src="/brand/mark.png" alt="" width={26} height={26} /><b>OJASSS</b></Link>
      <span className="pm-chip"><Ticket size={12} />Premiere</span>
    </header>

    <section className="pm-hero">
      <img className="pm-poster" src={show.poster} alt={`${show.title} poster`} />
      <div className="pm-info">
        <span className="pm-tag">{show.tag}</span>
        <h1>{show.title}</h1>
        <p className="pm-meta">{show.language} · {show.format} · {show.runtime}</p>
        <p><MapPin size={13} />{show.theatre}, {show.city}</p>
        <p><Calendar size={13} />{when.toLocaleDateString('en-IN', {weekday: 'short', day: 'numeric', month: 'short'})} · {when.toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'})}</p>
      </div>
    </section>

    <section className={cn('pm-count', !open && 'is-over')} aria-live="polite">
      {open ? <><small><Clock3 size={14} /><span>Premiere<br />Starts In</span></small>
        <div className="pm-digits">{[[h, 'HRS'], [m, 'MIN'], [s, 'SEC']].map(([v, l]) => <span key={l as string}><b>{pad(v as number)}</b><i>{l}</i></span>)}</div></>
        : <small>{show.status === 'closed' ? 'Booking is closed' : 'The show has started'}</small>}
    </section>

    {mine.length > 0 && <section className="pm-mine">{mine.map(o => <div key={o.id} className={'pm-booking is-' + o.status}>
      <Ticket size={16} /><div><b>{o.seats.map(seatLabel).join(', ')}</b><span>{STATUS[o.status]}{o.note ? ' · ' + o.note : ''} · {rupee(o.amount)}</span></div>
      {(o.status === 'confirmed' || o.status === 'pending') && <Link to={'/premiere/ticket/' + o.id} className="pm-view">{o.status === 'confirmed' ? 'View ticket' : 'Status'}</Link>}
    </div>)}</section>}

    <section className="pm-card">
      <div className="pm-card-head"><h2><Armchair size={16} />Select Your Seats</h2><span>{sel.size}/10 Selected</span></div>
      <SeatMap show={show} seats={q.data!.seats} selected={sel} onToggle={toggle} variant="cards" />
    </section>

    {open && sel.size > 0 && <div className="pm-bar">
      <div><b>{sel.size} seat{sel.size > 1 ? 's' : ''} · {rupee(total)}</b><span>{[...sel].map(seatLabel).join(', ')}</span></div>
      <button type="button" className="pm-go" disabled={busy} onClick={() => void confirm()}>{busy ? 'Holding…' : 'Confirm seats'}</button>
    </div>}
    {err && <p className="pm-err">{err}</p>}
    {order && <PaySheet order={order} upi={q.data!.upi_id} title={show.title} onClose={() => { setOrder(null); void q.refetch(); }} />}
  </main>;
}

function PaySheet({order, upi, title, onClose}: {order: ShowOrder; upi: string; title: string; onClose: () => void}) {
  const qc = useQueryClient(); const now = useNow(); const {me} = useAuth();
  const wallet = useQuery({queryKey: ['coins'], queryFn: coinApi.wallet, enabled: !!me});
  const [useCoins, setUseCoins] = useState(false); const [utr, setUtr] = useState(''); const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState<ShowOrder | null>(null); const [copied, setCopied] = useState(false);
  const have = wallet.data?.coins ?? 0; const spend = useCoins ? Math.min(have, order.amount) : 0; const rest = order.amount - spend;
  const left = Math.max(0, Date.parse(order.expires_at) - now);
  const expired = left <= 0 && !done;
  const link = `upi://pay?pa=${encodeURIComponent(upi)}&pn=OJASSS&am=${rest}&cu=INR&tn=${encodeURIComponent('OJASSS ' + title)}`;
  const pay = async () => { setBusy(true); setErr(''); try { const o = await shows.pay(order.id, {utr: rest > 0 ? utr : '', name, phone, coins: spend}); setDone(o); void qc.invalidateQueries({queryKey: ['show']}); void qc.invalidateQueries({queryKey: ['coins']}); } catch (e) { setErr(e instanceof Error ? e.message : 'Payment failed.'); } finally { setBusy(false); } };
  const cancel = async () => { setBusy(true); try { await shows.cancel(order.id); } catch { /* already gone */ } finally { setBusy(false); onClose(); } };
  return createPortal(<div className="pm-back"><div className="pm-sheet" role="dialog" aria-modal="true" aria-label="Pay for seats">
    <header><b>{done ? 'Booking sent' : 'Complete payment'}</b><button type="button" className="pm-icon" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
    {done ? <div className="pm-done"><span className="pm-tick"><Check size={34} strokeWidth={3} /></span>
      <b>{done.status === 'confirmed' ? 'Seats confirmed!' : 'Seats booked · verifying payment'}</b>
      <p>{done.seats.map(seatLabel).join(', ')} · {rupee(done.amount)}</p>
      {done.status === 'confirmed' && <Link to={'/premiere/ticket/' + done.id} className="pm-go pm-block">View e-ticket</Link>}
      <span>{done.status === 'confirmed' ? 'Show the e-ticket QR at the theatre.' : 'Your seats stay blocked for you while we confirm the UPI payment. You will get a notification.'}</span>
      <button type="button" className="pm-go pm-block" onClick={onClose}>Done</button></div>
    : expired ? <div className="pm-done"><b>Hold expired</b><span>The seats were released. Please choose again.</span><button type="button" className="pm-go pm-block" onClick={onClose}>Choose seats</button></div>
    : <>
      <div className="pm-hold"><Clock3 size={14} />Seats held for <b>{pad(Math.floor(left / 60000))}:{pad(Math.floor(left % 60000 / 1000))}</b></div>
      <p className="pm-seats">{order.seats.map(seatLabel).join(', ')}</p>
      <dl className="pm-bill"><div><dt>Tickets ({order.seats.length})</dt><dd>{rupee(order.amount)}</dd></div>{spend > 0 && <div><dt>Game coins</dt><dd>−{rupee(spend)}</dd></div>}<div className="pm-total"><dt>To pay</dt><dd>{rupee(rest)}</dd></div></dl>
      {<label className="pm-coins"><input type="checkbox" disabled={have <= 0} checked={useCoins} onChange={e => setUseCoins(e.target.checked)} /><Coins size={15} /><span>Use game coins <small>{have.toLocaleString('en-IN')} available · 1 coin = ₹1</small></span></label>}
      {rest > 0 && <>
        <button type="button" className="pm-upi" onClick={() => { void navigator.clipboard?.writeText(upi); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>UPI: {upi}{copied ? <Check size={12} /> : <Copy size={12} />}</button>
        <a className="pm-go pm-block" href={link}><IndianRupee size={15} />Pay {rupee(rest)} with UPI app</a>
        <input className="pm-in" value={utr} onChange={e => setUtr(e.target.value.replace(/\s/g, '').toUpperCase())} placeholder="12-digit UTR number" inputMode="numeric" maxLength={30} aria-label="UTR" />
      </>}
      <div className="pm-two"><input className="pm-in" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" maxLength={80} aria-label="Name" /><input className="pm-in" value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9+ ]/g, ''))} placeholder="Phone" inputMode="tel" maxLength={15} aria-label="Phone" /></div>
      <p className="pm-fine"><ShieldCheck size={13} />Seats are blocked for you the moment you submit. Admin verifies the UPI payment, then confirms.</p>
      {err && <p className="pm-err">{err}</p>}
      <div className="pm-sticky">      <button type="button" className="pm-go pm-block" disabled={busy || (rest > 0 && utr.length < 8) || !name.trim() || phone.replace(/\D/g, '').length < 10} onClick={() => void pay()}>{busy ? 'Submitting…' : rest > 0 ? 'Submit payment' : `Pay ${spend} coins · Proceed`}</button>
      <button type="button" className="pm-link" disabled={busy} onClick={() => void cancel()}>Cancel and release seats</button></div>
    </>}
  </div></div>, document.body);
}
