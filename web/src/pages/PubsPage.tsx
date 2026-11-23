import {useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowLeft, Calendar, Check, Clock3, Coins, Copy, IndianRupee, MapPin, Mic2, ShieldCheck, Users, Wine, X} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {coins as coinApi} from '@/api/coins';
import {AGE_LABEL, PUB_DRINKS, PUB_MENU, PUB_STATE, PUB_TYPES, pubCover, pubs, type PubEvent, type PubMenuItem, type PubType} from '@/api/pubs';
import {useAuth} from '@/hooks/useAuth';
import {useSeo} from '@/lib/seo';
import {cn} from '@/lib/utils';
import './pubs.css';

const rupee = (n: number) => (n === 0 ? 'Free' : '₹' + n.toLocaleString('en-IN'));
const day = (iso: string) => new Date(iso);
const tm = (iso: string) => day(iso).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'});
type Pill = 'all' | PubType | 'menu' | 'drinks';
const PILLS: {v: Pill; l: string}[] = [{v: 'all', l: 'All'}, ...PUB_TYPES.map(t => ({v: t.value as Pill, l: t.label})), {v: 'menu', l: 'Bar Menu'}, {v: 'drinks', l: 'Drinks'}];
const typeLabel = (t: PubType) => PUB_TYPES.find(x => x.value === t)?.label ?? t;

function Top({title}: {title: string}) {
  const nav = useNavigate();
  return <header className="pb-top">
    <button type="button" className="pb-icon" aria-label="Back" onClick={() => nav(-1)}><ArrowLeft size={18} /></button>
    <Link to="/" className="pb-brand" aria-label="OJASSS home"><img src="/brand/mark.png" width={26} height={26} alt="" /></Link>
    <h1>{title}</h1>
    <span className="pb-new"><Wine size={12} className="pb-clink" />NEW</span>
  </header>;
}

/** /tickets/pubs and /tickets/pubs/:id */
export default function PubsPage() {
  const {id} = useParams();
  return id ? <PubEventPage id={id} /> : <PubsList />;
}

function MenuGrid({items, venueName}: {items: PubMenuItem[]; venueName?: (id: string) => string}) {
  const groups = PUB_MENU.map(c => ({...c, items: items.filter(i => i.category === c.value)})).filter(g => g.items.length);
  if (!groups.length) return <div className="pb-empty"><Wine size={24} /><b>No menu published yet</b><span>Venues publish their own menus here.</span></div>;
  return <div className="pb-menu">{groups.map(g => <section key={g.value}>
    <h3>{g.label}{g.value === 'beverages' && <em>Age-restricted · ID required at venue</em>}</h3>
    <div className="pb-items">{g.items.map(i => <div key={i.id} className={cn('pb-item', !i.available && 'is-off')}>
      {i.image ? <img src={i.image} alt="" loading="lazy" /> : <span className="pb-item-ph"><Wine size={16} /></span>}
      <div><b>{i.name}</b>{i.about && <small>{i.about}</small>}{venueName && <small className="pb-at">{venueName(i.venue_id)}</small>}</div>
      <strong>{i.available ? '₹' + i.price.toLocaleString('en-IN') : 'Unavailable'}</strong>
    </div>)}</div>
  </section>)}
  <p className="pb-fine">Menu and prices are published by each venue and shown for information. Order and pay at the venue. OJASSS does not sell or deliver drinks.</p>
  </div>;
}

function EventCard({e}: {e: PubEvent}) {
  const d = day(e.starts_at);
  return <Link to={'/tickets/pubs/' + e.id} className="pb-card">
    <div className="pb-cover"><img src={pubCover(e)} alt="" loading="lazy" /><span className="pb-date"><b>{d.getDate()}</b>{d.toLocaleString('en-IN', {month: 'short'}).toUpperCase()}</span><span className={"pb-type t-" + e.type}>{typeLabel(e.type)}</span></div>
    <div className="pb-body">
      <b className="pb-title">{e.title}</b>
      <p><MapPin size={12} />{e.venue?.name ?? 'Venue'} · {e.venue?.area ? e.venue.area + ', ' : ''}{e.venue?.city}</p>
      <p><Clock3 size={12} />{d.toLocaleDateString('en-IN', {weekday: 'short'})} · {tm(e.starts_at)} – {tm(e.ends_at)}</p>
      <div className="pb-foot"><strong>{rupee(e.price)}</strong><span className={'pb-st is-' + e.state}>{e.state === 'on_sale' && e.left <= 20 ? `${e.left} left` : PUB_STATE[e.state] ?? e.state}</span><i>View details</i></div>
    </div>
  </Link>;
}

function PubsList() {
  useSeo({title: 'Pub Events', noindex: false});
  const q = useQuery({queryKey: ['pubs'], queryFn: pubs.list});
  const [pill, setPill] = useState<Pill>('all');
  const venueName = useMemo(() => { const m = new Map((q.data?.venues ?? []).map(v => [v.id, v.name])); return (id: string) => m.get(id) ?? ''; }, [q.data]);
  const events = (q.data?.events ?? []).filter(e => pill === 'all' || e.type === pill);
  const menu = (q.data?.menu ?? []).filter(i => pill === 'menu' || PUB_DRINKS.includes(i.category));
  return <main className="pb">
    <Top title="Pub Events" />
    <section className="pb-hero">
      <img src="/assets/tickets/pubs/hero-lounge.svg" alt="" />
      <div><h2>Your Night. Your Vibe.</h2><p>Live Music • Stand-up • DJ Nights • Drinks</p></div>
    </section>
    <nav className="pb-pills" aria-label="Pub categories">{PILLS.map(p => <button key={p.v} type="button" aria-pressed={pill === p.v} className={cn(pill === p.v && 'is-on')} onClick={() => setPill(p.v)}>{p.l}</button>)}</nav>
    {q.isLoading && <p className="pb-loading">Loading events…</p>}
    {pill === 'menu' || pill === 'drinks' ? <MenuGrid items={menu} venueName={venueName} />
      : q.data && !events.length ? <div className="pb-empty"><Mic2 size={26} /><b>No {pill === 'all' ? 'pub events' : typeLabel(pill as PubType).toLowerCase()} listed yet</b><span>Events appear here as soon as venues publish them.</span></div>
      : <div className="pb-list">{events.map(e => <EventCard key={e.id} e={e} />)}</div>}
  </main>;
}

function PubEventPage({id}: {id: string}) {
  const q = useQuery({queryKey: ['pub-event', id], queryFn: () => pubs.event(id)});
  const {me} = useAuth(); const nav = useNavigate();
  const [book, setBook] = useState(false); const [tab, setTab] = useState<'info' | 'menu'>('info');
  const e = q.data?.event;
  useSeo({title: e?.title ?? 'Pub event', noindex: false});
  if (q.isLoading) return <main className="pb"><Top title="Pub Events" /><p className="pb-loading">Loading…</p></main>;
  if (!e) return <main className="pb"><Top title="Pub Events" /><div className="pb-empty"><b>Event not found</b></div></main>;
  const d = day(e.starts_at); const v = e.venue;
  return <main className="pb">
    <Top title="Pub Events" />
    <section className="pb-dcover"><img src={pubCover(e)} alt="" /><span className={"pb-type t-" + e.type}>{typeLabel(e.type)}</span></section>
    <h2 className="pb-dtitle">{e.title}</h2>
    {e.host && <p className="pb-host"><Mic2 size={13} />{e.host}</p>}
    <div className="pb-facts">
      <p><Calendar size={14} />{d.toLocaleDateString('en-IN', {weekday: 'long', day: 'numeric', month: 'long'})}</p>
      <p><Clock3 size={14} />{tm(e.starts_at)} – {tm(e.ends_at)}</p>
      <p><MapPin size={14} />{v?.name}{v?.address ? ', ' + v.address : ''}{v?.city ? ', ' + v.city : ''}</p>
      <p><Users size={14} />{AGE_LABEL[e.age]}{e.age !== 'all' ? ' · valid ID required' : ''}</p>
    </div>
    {(q.data?.my_bookings ?? []).map(b => <div key={b.id} className={'pb-mine is-' + b.status}><Check size={15} /><div><b>{b.ref} · {b.qty} entry</b><span>{b.status === 'pending' ? 'Payment being verified' : b.status === 'confirmed' ? 'Confirmed · show this at the door' : b.status}{b.note ? ' · ' + b.note : ''}</span></div></div>)}
    <div className="pb-tabs"><button type="button" className={cn(tab === 'info' && 'is-on')} onClick={() => setTab('info')}>Details</button><button type="button" className={cn(tab === 'menu' && 'is-on')} onClick={() => setTab('menu')}><Wine size={13} />View Menu</button></div>
    {tab === 'menu' ? <MenuGrid items={q.data!.menu} /> : <div className="pb-info">
      {e.about && <section><h3>About</h3><p>{e.about}</p></section>}
      <section><h3>Tickets</h3><div className="pb-tt"><div><b>{e.ticket_name || 'Entry'}</b><small>{e.left} of {e.capacity} available</small></div><strong>{rupee(e.price)}</strong></div></section>
      {e.rules && <section><h3>Entry rules</h3><p>{e.rules}</p></section>}
      {(e.policy || v?.rules) && <section><h3>Venue policies</h3><p>{[e.policy, v?.rules].filter(Boolean).join('\n')}</p></section>}
      {v?.hours && <section><h3>Venue hours</h3><p>{v.hours}{v.phone ? ' · ' + v.phone : ''}</p></section>}
    </div>}
    <div className="pb-bar">
      <div><strong>{rupee(e.price)}</strong><span>{PUB_STATE[e.state] ?? e.state}</span></div>
      {e.state === 'on_sale' ? <button type="button" className="pb-go" onClick={() => (me ? setBook(true) : nav('/login?next=/tickets/pubs/' + id))}>Book Ticket</button> : <span className={'pb-st is-' + e.state}>{PUB_STATE[e.state] ?? e.state}</span>}
    </div>
    {book && <BookSheet e={e} upi={q.data!.upi_id} onClose={() => setBook(false)} />}
  </main>;
}

function BookSheet({e, upi, onClose}: {e: PubEvent; upi: string; onClose: () => void}) {
  const qc = useQueryClient(); const wallet = useQuery({queryKey: ['coins'], queryFn: coinApi.wallet});
  const [qty, setQty] = useState(1); const [useCoins, setUseCoins] = useState(false); const [utr, setUtr] = useState(''); const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [age, setAge] = useState(e.age === 'all');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState<{ref: string; status: string} | null>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const total = qty * e.price; const have = wallet.data?.coins ?? 0; const spend = useCoins ? Math.min(have, total) : 0; const rest = total - spend;
  const link = `upi://pay?pa=${encodeURIComponent(upi)}&pn=OJASSS&am=${rest}&cu=INR&tn=${encodeURIComponent('OJASSS ' + e.title.slice(0, 30))}`;
  const submit = async () => { setBusy(true); setErr(''); try { const b = await pubs.book(e.id, {qty, utr: rest > 0 ? utr : '', name, phone, coins: spend, ageOk: age}); setDone({ref: b.ref, status: b.status}); void qc.invalidateQueries({queryKey: ['pub-event', e.id]}); void qc.invalidateQueries({queryKey: ['coins']}); } catch (x) { setErr(x instanceof Error ? x.message : 'Booking failed.'); } finally { setBusy(false); } };
  return createPortal(<div className="pb-back" onClick={onClose}><div className="pb-sheet" role="dialog" aria-modal="true" aria-label={'Book ' + e.title} onClick={ev => ev.stopPropagation()}>
    <header><b>{done ? 'Booking sent' : 'Book entry'}</b><button type="button" className="pb-icon" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
    {done ? <div className="pb-done"><span className="pb-tick"><Check size={30} strokeWidth={3} /></span><b>{done.status === 'confirmed' ? 'You’re in!' : 'Booked · verifying payment'}</b><p>Booking ID {done.ref}</p><span>{done.status === 'confirmed' ? 'Show this booking ID at the door.' : 'We will confirm once the UPI payment is verified.'}</span><button type="button" className="pb-go pb-block" onClick={onClose}>Done</button></div> : <>
      <p className="pb-sh-title">{e.title}<small>{e.venue?.name} · {day(e.starts_at).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})} · {tm(e.starts_at)}</small></p>
      <div className="pb-qty"><span>{e.ticket_name || 'Entry'} · {rupee(e.price)}</span><div><button type="button" aria-label="Fewer" onClick={() => setQty(n => Math.max(1, n - 1))}>−</button><b>{qty}</b><button type="button" aria-label="More" onClick={() => setQty(n => Math.min(10, e.left, n + 1))}>+</button></div></div>
      <dl className="pb-bill"><div><dt>Entries ({qty})</dt><dd>{rupee(total)}</dd></div>{spend > 0 && <div><dt>Game coins</dt><dd>−₹{spend}</dd></div>}<div className="pb-total"><dt>To pay</dt><dd>₹{rest.toLocaleString('en-IN')}</dd></div></dl>
      {total > 0 && <label className="pb-coins"><input type="checkbox" disabled={have <= 0} checked={useCoins} onChange={x => setUseCoins(x.target.checked)} /><Coins size={15} /><span>Pay with game coins<small>{have.toLocaleString('en-IN')} available · 1 coin = ₹1</small></span></label>}
      {rest > 0 && <><button type="button" className="pb-upi" onClick={() => { void navigator.clipboard?.writeText(upi); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>UPI: {upi}{copied ? <Check size={12} /> : <Copy size={12} />}</button>
        <a className="pb-go pb-block" href={link}><IndianRupee size={15} />Pay ₹{rest.toLocaleString('en-IN')} with UPI app</a>
        <input className="pb-in" value={utr} onChange={x => setUtr(x.target.value.replace(/\s/g, '').toUpperCase())} placeholder="12-digit UTR number" inputMode="numeric" maxLength={30} aria-label="UTR" /></>}
      <div className="pb-two"><input className="pb-in" value={name} onChange={x => setName(x.target.value)} placeholder="Full name" maxLength={80} aria-label="Name" /><input className="pb-in" value={phone} onChange={x => setPhone(x.target.value.replace(/[^0-9+ ]/g, ''))} placeholder="Phone" inputMode="tel" maxLength={15} aria-label="Phone" /></div>
      {e.age !== 'all' && <label className="pb-age"><input type="checkbox" checked={age} onChange={x => setAge(x.target.checked)} />I am {AGE_LABEL[e.age]} and will carry a valid photo ID.</label>}
      <p className="pb-fine"><ShieldCheck size={13} />This is an entry ticket only. Food and drinks are ordered and paid at the venue.</p>
      {err && <p className="pb-err">{err}</p>}
      <button type="button" className="pb-go pb-block" disabled={busy || !age || (rest > 0 && utr.length < 8) || !name.trim() || phone.replace(/\D/g, '').length < 10} onClick={() => void submit()}>{busy ? 'Booking…' : rest > 0 ? 'Submit payment' : total === 0 ? 'Book free entry' : `Pay ${spend} coins`}</button>
    </>}
  </div></div>, document.body);
}
