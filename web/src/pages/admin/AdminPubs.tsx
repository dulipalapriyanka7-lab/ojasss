import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Wine} from 'lucide-react';
import {useState} from 'react';
import {PUB_MENU, PUB_STATE, PUB_TYPES, pubCover, pubs, type PubEvent, type PubMenuItem, type PubVenue} from '@/api/pubs';
import {uploadObject} from '@/api/upload';
import {useAuth} from '@/hooks/useAuth';
import {AVATAR_BUCKET} from '@/lib/env';
import {compressImage, mediaUrl} from '@/lib/media';
import './admin-business.css';
import './admin-demo.css';

type Tab = 'events' | 'venues' | 'menu' | 'bookings';
const local = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); const z = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
const iso = (v: string) => (v ? new Date(v).toISOString() : '');
const F = ({label, children}: {label: string; children: React.ReactNode}) => <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12}}>{label}{children}</label>;
const grid = {display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))'} as const;
const inp = {width: '100%'} as const;

function ImageField({label, value, onChange}: {label: string; value: string; onChange: (v: string) => void}) {
  const {me} = useAuth(); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const pick = async (f?: File) => { if (!f || !me) return; setBusy(true); setErr(''); try { const img = await compressImage(f, 1600, 0.85); const path = await uploadObject(img.blob, img.mime, me.id, undefined, AVATAR_BUCKET).promise; onChange(mediaUrl(path, AVATAR_BUCKET) ?? ''); } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed'); } finally { setBusy(false); } };
  return <F label={label}><div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
    {value && <img src={value} alt="" style={{width: 44, height: 32, objectFit: 'cover', borderRadius: 6}} />}
    <label className="ab-btn" style={{cursor: 'pointer'}}>{busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}<input type="file" accept="image/*" hidden onChange={e => void pick(e.target.files?.[0])} /></label>
    {value && <button type="button" className="ab-btn" onClick={() => onChange('')}>Remove</button>}
  </div>{err && <small style={{color: '#fda4af'}}>{err}</small>}</F>;
}

/** Admin: Pub Events & Nightlife — venues, events, view-only bar menus, entry bookings. */
export default function AdminPubs() {
  const qc = useQueryClient(); const q = useQuery({queryKey: ['pubs-admin'], queryFn: pubs.adminGet});
  const [tab, setTab] = useState<Tab>('events'); const [msg, setMsg] = useState('');
  const [venue, setVenue] = useState<Partial<PubVenue> | null>(null); const [event, setEvent] = useState<Partial<PubEvent> | null>(null); const [item, setItem] = useState<Partial<PubMenuItem> | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => { setMsg(''); try { await fn(); setMsg(ok); after?.(); await qc.invalidateQueries({queryKey: ['pubs-admin']}); void qc.invalidateQueries({queryKey: ['pubs']}); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.'); } };
  const d = q.data; const vName = (id: string) => d?.venues.find(v => v.id === id)?.name ?? '—';
  const pending = (d?.bookings ?? []).filter(b => b.status === 'pending').length;
  return <div className="ab ad">
    <div className="ab-top"><div className="ab-title"><span className="ab-logo"><Wine size={16} /></span><div><h1>Pub Events <span className="nav-new-tag">NEW</span></h1><p>Venues, events, bar menus and entry bookings · menus are view-only, no drink sales</p></div></div></div>
    <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10}}>{(['events', 'venues', 'menu', 'bookings'] as Tab[]).map(t => <button key={t} type="button" className={'ab-btn' + (tab === t ? ' ok' : '')} onClick={() => setTab(t)}>{t === 'bookings' ? `Bookings${pending ? ` (${pending})` : ''}` : t[0].toUpperCase() + t.slice(1)}</button>)}</div>
    {msg && <p className="ab-empty">{msg}</p>}

    {tab === 'venues' && <section className="ab-card">
      <div className="ab-head"><h2>Venues</h2><button type="button" className="ab-btn ok" onClick={() => setVenue({status: 'draft'})}>Add venue</button></div>
      {venue && <div style={{padding: '8px 0 12px', borderBottom: '1px solid #ffffff14'}}>
        <div style={grid}>
          {(['name', 'city', 'area', 'address', 'phone', 'hours'] as const).map(k => <F key={k} label={k[0].toUpperCase() + k.slice(1)}><input className="ab-input" style={inp} value={(venue[k] as string) ?? ''} onChange={e => setVenue({...venue, [k]: e.target.value})} /></F>)}
          <ImageField label="Logo" value={venue.logo ?? ''} onChange={v => setVenue({...venue, logo: v})} />
          <ImageField label="Venue photo" value={venue.photo ?? ''} onChange={v => setVenue({...venue, photo: v})} />
        </div>
        <F label="Venue rules"><textarea className="ab-input" style={{...inp, height: 60}} value={venue.rules ?? ''} onChange={e => setVenue({...venue, rules: e.target.value})} /></F>
        <div style={{display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap'}}>
          <select className="ab-input" value={venue.status} onChange={e => setVenue({...venue, status: e.target.value as 'draft'})}><option value="draft">Draft</option><option value="published">Published</option></select>
          <button type="button" className="ab-btn ok" onClick={() => void run(() => pubs.saveVenue(Object.fromEntries(Object.entries({...venue}).map(([k, v]) => ['p_' + k, v]))), 'Venue saved.', () => setVenue(null))}>Save venue</button>
          <button type="button" className="ab-btn" onClick={() => setVenue(null)}>Close</button>
          {venue.id && <button type="button" className="ab-btn" onClick={() => { if (confirm('Delete this venue?')) void run(() => pubs.saveVenue({p_id: venue.id, p_delete: true}), 'Venue deleted.', () => setVenue(null)); }}>Delete</button>}
        </div>
      </div>}
      {(d?.venues ?? []).map(v => <div key={v.id} style={{display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #ffffff10', fontSize: 12.5}}>
        <img src={v.photo || v.logo || '/assets/tickets/pubs/venue-placeholder.svg'} alt="" style={{width: 52, height: 36, objectFit: 'cover', borderRadius: 6}} />
        <div style={{flex: 1}}><b>{v.name}</b> · {v.city}<br /><small style={{opacity: .7}}>{v.status === 'published' ? 'Published' : 'Draft'}{v.hours ? ' · ' + v.hours : ''}</small></div>
        <button type="button" className="ab-btn" onClick={() => setVenue(v)}>Edit</button>
      </div>)}
      {!d?.venues.length && !venue && <p className="ab-empty">Add a venue first, then create events and its menu.</p>}
    </section>}

    {tab === 'events' && <section className="ab-card">
      <div className="ab-head"><h2>Events</h2><button type="button" className="ab-btn ok" disabled={!d?.venues.length} onClick={() => setEvent({type: 'live_music', age: '18', status: 'draft', capacity: 100, price: 0, venue_id: d?.venues[0]?.id})}>Create event</button></div>
      {event && <div style={{padding: '8px 0 12px', borderBottom: '1px solid #ffffff14'}}>
        <div style={grid}>
          <F label="Venue"><select className="ab-input" style={inp} value={event.venue_id} onChange={e => setEvent({...event, venue_id: e.target.value})}>{d?.venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></F>
          <F label="Title"><input className="ab-input" style={inp} value={event.title ?? ''} onChange={e => setEvent({...event, title: e.target.value})} /></F>
          <F label="Category"><select className="ab-input" style={inp} value={event.type} onChange={e => setEvent({...event, type: e.target.value as PubEvent['type']})}>{PUB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></F>
          <F label="Performer / host"><input className="ab-input" style={inp} value={event.host ?? ''} onChange={e => setEvent({...event, host: e.target.value})} /></F>
          <F label="Starts"><input className="ab-input" style={{...inp, colorScheme: 'dark'}} type="datetime-local" value={local(event.starts_at)} onChange={e => setEvent({...event, starts_at: iso(e.target.value)})} /></F>
          <F label="Ends"><input className="ab-input" style={{...inp, colorScheme: 'dark'}} type="datetime-local" value={local(event.ends_at)} onChange={e => setEvent({...event, ends_at: iso(e.target.value)})} /></F>
          <F label="Booking opens (optional)"><input className="ab-input" style={{...inp, colorScheme: 'dark'}} type="datetime-local" value={local(event.book_from)} onChange={e => setEvent({...event, book_from: iso(e.target.value) || null})} /></F>
          <F label="Booking closes (optional)"><input className="ab-input" style={{...inp, colorScheme: 'dark'}} type="datetime-local" value={local(event.book_until)} onChange={e => setEvent({...event, book_until: iso(e.target.value) || null})} /></F>
          <F label="Capacity"><input className="ab-input" style={inp} inputMode="numeric" value={event.capacity ?? ''} onChange={e => setEvent({...event, capacity: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0})} /></F>
          <F label="Ticket price ₹ (0 = free)"><input className="ab-input" style={inp} inputMode="numeric" value={event.price ?? ''} onChange={e => setEvent({...event, price: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0})} /></F>
          <F label="Ticket name"><input className="ab-input" style={inp} placeholder="Entry / Cover charge" value={event.ticket_name ?? ''} onChange={e => setEvent({...event, ticket_name: e.target.value})} /></F>
          <F label="Age limit"><select className="ab-input" style={inp} value={event.age} onChange={e => setEvent({...event, age: e.target.value as PubEvent['age']})}><option value="all">All ages</option><option value="18">18+</option><option value="21">21+</option><option value="25">25+</option></select></F>
          <ImageField label="Event banner" value={event.cover ?? ''} onChange={v => setEvent({...event, cover: v})} />
        </div>
        <F label="Description"><textarea className="ab-input" style={{...inp, height: 70}} value={event.about ?? ''} onChange={e => setEvent({...event, about: e.target.value})} /></F>
        <F label="Entry rules"><textarea className="ab-input" style={{...inp, height: 50}} value={event.rules ?? ''} onChange={e => setEvent({...event, rules: e.target.value})} /></F>
        <F label="Booking conditions / policy"><textarea className="ab-input" style={{...inp, height: 50}} value={event.policy ?? ''} onChange={e => setEvent({...event, policy: e.target.value})} /></F>
        <div style={{display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap'}}>
          <select className="ab-input" value={event.status} onChange={e => setEvent({...event, status: e.target.value as PubEvent['status']})}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled (notifies bookers)</option></select>
          <button type="button" className="ab-btn ok" onClick={() => { if (event.status === 'cancelled' && !confirm('Cancel this event? Everyone who booked will be notified and coins refunded.')) return; const {venue: _v, state: _s, left: _l, sold: _so, ...rest} = event as PubEvent; void run(() => pubs.saveEvent(Object.fromEntries(Object.entries(rest).map(([k, v]) => ['p_' + k, v]))), 'Event saved.', () => setEvent(null)); }}>Save event</button>
          <button type="button" className="ab-btn" onClick={() => setEvent(null)}>Close</button>
        </div>
      </div>}
      {(d?.events ?? []).map(e => <div key={e.id} style={{display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #ffffff10', fontSize: 12.5}}>
        <img src={pubCover(e)} alt="" style={{width: 64, height: 36, objectFit: 'cover', borderRadius: 6}} />
        <div style={{flex: 1, minWidth: 0}}><b>{e.title}</b> · {vName(e.venue_id)}<br /><small style={{opacity: .7}}>{new Date(e.starts_at).toLocaleString('en-IN')} · {e.sold}/{e.capacity} booked · ₹{e.price} · {e.status === 'published' ? PUB_STATE[e.state] : e.status}</small></div>
        <button type="button" className="ab-btn" onClick={() => setEvent(e)}>Edit</button>
      </div>)}
      {!d?.events.length && !event && <p className="ab-empty">{d?.venues.length ? 'No events yet.' : 'Add a venue first.'}</p>}
    </section>}

    {tab === 'menu' && <section className="ab-card">
      <div className="ab-head"><h2>Bar menu</h2><button type="button" className="ab-btn ok" disabled={!d?.venues.length} onClick={() => setItem({venue_id: d?.venues[0]?.id, category: 'mocktails', available: true, status: 'published', price: 0})}>Add item</button></div>
      <p style={{fontSize: 11.5, opacity: .7, margin: '0 0 8px'}}>Enter only items and prices the venue gave you. Beverages are always marked age-restricted and are never sold online.</p>
      {item && <div style={{padding: '8px 0 12px', borderBottom: '1px solid #ffffff14'}}>
        <div style={grid}>
          <F label="Venue"><select className="ab-input" style={inp} value={item.venue_id} onChange={e => setItem({...item, venue_id: e.target.value})}>{d?.venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></F>
          <F label="Category"><select className="ab-input" style={inp} value={item.category} onChange={e => setItem({...item, category: e.target.value as PubMenuItem['category']})}>{PUB_MENU.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></F>
          <F label="Item name"><input className="ab-input" style={inp} value={item.name ?? ''} onChange={e => setItem({...item, name: e.target.value})} /></F>
          <F label="Price ₹"><input className="ab-input" style={inp} inputMode="numeric" value={item.price ?? ''} onChange={e => setItem({...item, price: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0})} /></F>
          <F label="Description"><input className="ab-input" style={inp} value={item.about ?? ''} onChange={e => setItem({...item, about: e.target.value})} /></F>
          <ImageField label="Photo" value={item.image ?? ''} onChange={v => setItem({...item, image: v})} />
        </div>
        <div style={{display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12}}>
          <label><input type="checkbox" checked={item.available ?? true} onChange={e => setItem({...item, available: e.target.checked})} /> Available</label>
          <select className="ab-input" value={item.status} onChange={e => setItem({...item, status: e.target.value as 'draft'})}><option value="published">Published</option><option value="draft">Draft</option></select>
          <button type="button" className="ab-btn ok" onClick={() => void run(() => pubs.saveMenu(Object.fromEntries(Object.entries(item).map(([k, v]) => ['p_' + k, v]))), 'Menu item saved.', () => setItem(null))}>Save item</button>
          <button type="button" className="ab-btn" onClick={() => setItem(null)}>Close</button>
          {item.id && <button type="button" className="ab-btn" onClick={() => void run(() => pubs.saveMenu({p_id: item.id, p_delete: true}), 'Removed.', () => setItem(null))}>Remove</button>}
        </div>
      </div>}
      {(d?.menu ?? []).map(m => <div key={m.id} style={{display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: '1px solid #ffffff10', fontSize: 12.5}}>
        <div style={{flex: 1}}><b>{m.name}</b> · ₹{m.price} · {PUB_MENU.find(c => c.value === m.category)?.label}<br /><small style={{opacity: .7}}>{vName(m.venue_id)} · {m.available ? 'Available' : 'Unavailable'} · {m.status}</small></div>
        <button type="button" className="ab-btn" onClick={() => setItem(m)}>Edit</button>
      </div>)}
    </section>}

    {tab === 'bookings' && <section className="ab-card">
      <div className="ab-head"><h2>Bookings</h2><span>{d?.bookings.length ?? 0}</span></div>
      {(d?.bookings ?? []).map(b => <div key={b.id} style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #ffffff10', fontSize: 12.5}}>
        <div style={{flex: 1, minWidth: 220}}><b>{b.ref}</b> · {b.title} · {b.qty} entry · ₹{b.amount}{b.coins ? ` (coins ${b.coins})` : ''}<br /><small style={{opacity: .75}}>@{b.username} · {b.name} · {b.phone} · UTR {b.utr ?? '—'} · <b>{b.status}</b></small></div>
        {b.status === 'pending' && <><button type="button" className="ab-btn ok" onClick={() => void run(() => pubs.booking(b.id, 'confirmed'), 'Confirmed.')}>Confirm</button><button type="button" className="ab-btn" onClick={() => { const r = prompt('Reason?') ?? ''; if (r.trim()) void run(() => pubs.booking(b.id, 'rejected', r), 'Rejected.'); }}>Reject</button></>}
        {b.status === 'confirmed' && <button type="button" className="ab-btn ok" onClick={() => void run(() => pubs.booking(b.id, 'attended'), 'Checked in.')}>Check in</button>}
      </div>)}
      {!d?.bookings.length && <p className="ab-empty">No bookings yet.</p>}
    </section>}
  </div>;
}
