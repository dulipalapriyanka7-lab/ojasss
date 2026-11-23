import {useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowRight, Bath, BedDouble, Bell, Building2, Camera, Check, ChevronDown, CirclePlay, Heart, Home, ImagePlus, MapPin, Maximize2, Phone, Plus, Search, ShieldCheck, Tag, Upload, User, Users, X} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {coins} from '@/api/coins';
import {inrShort, KIND_LABEL, realestate, type ReKind, type ReListing} from '@/api/realestate';
import {uploadObject} from '@/api/upload';
import {useAuth} from '@/hooks/useAuth';
import {AVATAR_BUCKET} from '@/lib/env';
import {compressImage, mediaUrl} from '@/lib/media';
import {useSeo} from '@/lib/seo';
import {cn} from '@/lib/utils';
import './real-estate.css';

type Tab = 'all' | 'nearby' | 'rent' | 'sale' | 'projects' | 'agents' | 'saved' | 'mine';
const QUICK: {v: Tab; l: string; I: typeof Home; c: string}[] = [
  {v: 'nearby', l: 'Nearby', I: MapPin, c: 'o'}, {v: 'rent', l: 'For Rent', I: Home, c: 'b'}, {v: 'sale', l: 'For Sale', I: Tag, c: 'p'},
  {v: 'projects', l: 'Projects', I: Building2, c: 'v'}, {v: 'agents', l: 'Agents', I: User, c: 'g'}, {v: 'saved', l: 'Saved', I: Heart, c: 'l'},
];
const dist = (a: {lat: number; lng: number}, b: {lat: number | null; lng: number | null}) => b.lat == null || b.lng == null ? Infinity : Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180)) * 111;

export default function RealEstatePage() {
  useSeo({title: 'Real Estate', noindex: false});
  const {me} = useAuth(); const nav = useNavigate(); const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'all';
  const [city, setCity] = useState(me?.city ?? ''); const [q, setQ] = useState(''); const [bhk, setBhk] = useState(''); const [kind, setKind] = useState<ReKind | ''>(''); const [furn, setFurn] = useState(''); const [maxP, setMaxP] = useState('');
  const [here, setHere] = useState<{lat: number; lng: number} | null>(null); const [locErr, setLocErr] = useState('');
  const [upload, setUpload] = useState(params.get('upload') === '1'); const [how, setHow] = useState(false); const [agentForm, setAgentForm] = useState(false); const [contact, setContact] = useState<ReListing | null>(null);
  const data = useQuery({queryKey: ['re-home', city], queryFn: () => realestate.home(city)});
  const mine = useQuery({queryKey: ['re-mine'], queryFn: realestate.mine, enabled: !!me && tab === 'mine'});
  const wallet = useQuery({queryKey: ['coins'], queryFn: coins.wallet, enabled: !!me});
  const go = (t: Tab) => { const n = new URLSearchParams(params); if (t === 'all') n.delete('tab'); else n.set('tab', t); setParams(n, {replace: true}); };
  useEffect(() => { if (tab !== 'nearby' || here) return; if (!navigator.geolocation) { setLocErr('Location is not available. Pick your city instead.'); return; } navigator.geolocation.getCurrentPosition(p => setHere({lat: p.coords.latitude, lng: p.coords.longitude}), () => setLocErr('Allow location to see nearby homes, or pick your city.'), {timeout: 10000, maximumAge: 600000}); }, [tab, here]);
  const list = useMemo(() => {
    let l = data.data?.listings ?? [];
    const s = q.trim().toLowerCase();
    if (s) l = l.filter(x => (x.title + ' ' + x.area + ' ' + x.address).toLowerCase().includes(s));
    if (tab === 'rent') l = l.filter(x => x.deal !== 'sale'); if (tab === 'sale') l = l.filter(x => x.deal === 'sale');
    if (tab === 'projects') l = l.filter(x => x.kind === 'apartment' || x.kind === 'villa' || x.kind === 'commercial');
    if (tab === 'saved') l = l.filter(x => data.data?.saved.includes(x.id));
    if (bhk) l = l.filter(x => x.bhk.startsWith(bhk)); if (kind) l = l.filter(x => x.kind === kind); if (furn) l = l.filter(x => x.furnishing === furn);
    const mp = parseInt(maxP, 10); if (mp) l = l.filter(x => x.price <= mp);
    if (tab === 'nearby' && here) l = [...l].sort((a, b) => dist(here, a) - dist(here, b));
    l = [...l].sort((a, b) => Number((a.market ?? 'available') !== 'available') - Number((b.market ?? 'available') !== 'available'));
    return l;
  }, [data.data, q, tab, bhk, kind, furn, maxP, here]);
  const save = async (id: string) => { if (!me) { nav('/login?next=/real-estate'); return; } await realestate.save(id); void qc.invalidateQueries({queryKey: ['re-home']}); };
  const reward = data.data?.reward_rupees ?? 0;
  const cities = Array.from(new Set([...(data.data?.cities ?? []), ...(me?.city ? [me.city] : [])]));
  return <main className="re">
    <header className="re-top">
      <Link to="/" className="re-brand"><img src="/brand/mark.png" width={34} height={34} alt="" /><span><b>OJASSS</b><small>Real Estate</small></span></Link>
      <label className="re-city"><MapPin size={14} /><select value={city} onChange={e => setCity(e.target.value)} aria-label="City"><option value="">All cities</option>{cities.map(c => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={13} /></label>
      <Link to="/notifications" className="re-ic" aria-label="Notifications"><Bell size={17} /></Link>
      {me && <Link to="/coins" className="re-wallet">🪙 {wallet.data ? wallet.data.coins.toLocaleString('en-IN') : '…'}</Link>}
    </header>

    <section className="re-hero">
      <img src="/assets/real-estate/hero-house-light.jpg" alt="" />
      <div><h1>Find Your<br /><em>Perfect Home</em></h1><p>Rent • Sale • Buy • Lease</p>
        <div className="re-hero-btns"><button type="button" className="re-gold" onClick={() => (me ? setUpload(true) : nav('/login?next=/real-estate?upload=1'))}>List Your Property <Plus size={15} /></button><button type="button" className="re-ghost" onClick={() => setHow(v => !v)}><CirclePlay size={15} />How It Works</button></div></div>
    </section>
    {how && <ol className="re-how"><li>Upload photos, price and details of a home you own or are authorised to list.</li><li>Our team verifies ownership/authorisation and checks for duplicates.</li><li>Approved homes go live{reward ? ` and you get ₹${reward} cash in your earnings` : ''}. When it’s sold or rented, mark it from My listings. Buyers and tenants contact you directly.</li></ol>}

    <nav className="re-quick">{QUICK.map(x => <button key={x.v} type="button" className={cn('re-q re-q-' + x.c, tab === x.v && 'is-on')} onClick={() => go(tab === x.v ? 'all' : x.v)}><x.I size={22} /><span>{x.l}</span></button>)}</nav>

    {tab !== 'agents' && tab !== 'mine' && <>
      <div className="re-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search area, locality or title" aria-label="Search" /></div>
      <div className="re-filters">
        <select value={bhk} onChange={e => setBhk(e.target.value)} aria-label="BHK"><option value="">Any BHK</option>{['1', '2', '3', '4'].map(b => <option key={b} value={b}>{b} BHK{b === '4' ? '+' : ''}</option>)}</select>
        <select value={kind} onChange={e => setKind(e.target.value as ReKind)} aria-label="Type"><option value="">Any type</option>{(Object.keys(KIND_LABEL) as ReKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <select value={furn} onChange={e => setFurn(e.target.value)} aria-label="Furnishing"><option value="">Furnishing</option><option value="furnished">Furnished</option><option value="semi">Semi</option><option value="unfurnished">Unfurnished</option></select>
        <input value={maxP} onChange={e => setMaxP(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Max ₹" aria-label="Max price" />
      </div>
      <div className="re-sec"><h2><MapPin size={19} />{tab === 'saved' ? 'Saved Homes' : tab === 'rent' ? 'For Rent' : tab === 'sale' ? 'For Sale' : tab === 'projects' ? 'Projects' : 'Nearby Listings'}</h2><button type="button" onClick={() => go('all')}>View All <ArrowRight size={14} /></button></div>
      {tab === 'nearby' && locErr && <p className="re-note">{locErr}</p>}
      {data.isLoading && <p className="re-note">Loading homes…</p>}
      {data.data && !list.length && <div className="re-empty"><Home size={26} /><b>No homes listed {city ? 'in ' + city : ''} yet</b><span>Verified homes appear here as soon as they're approved. Be the first to list one{reward ? ` and earn ₹${reward}` : ''}.</span></div>}
      <div className="re-list">{list.map(l => <article key={l.id} className={cn('re-card', l.market && l.market !== 'available' && 'is-closed')}>
        <div className="re-photo"><img src={l.photos[0]} alt="" loading="lazy" /><span className={'re-deal is-' + l.deal}>{l.deal === 'sale' ? <Tag size={12} /> : <Home size={12} />}For {l.deal === 'sale' ? 'Sale' : l.deal === 'lease' ? 'Lease' : 'Rent'}</span>
          <button type="button" className={cn('re-fav', data.data?.saved.includes(l.id) && 'is-on')} aria-label="Save" onClick={() => void save(l.id)}><Heart size={16} /></button><span className="re-count"><Camera size={11} />{l.photos.length}</span>{l.market && l.market !== 'available' && <span className="re-ribbon">{l.market === 'sold' ? 'SOLD' : 'RENTED'}</span>}</div>
        <div className="re-body"><b>{l.bhk ? l.bhk + ' BHK ' : ''}{KIND_LABEL[l.kind]}{l.deal === 'sale' ? '' : ' for Rent'}</b>
          <p><MapPin size={13} />{l.area ? l.area + ', ' : ''}{l.city}{here && tab === 'nearby' && dist(here, l) < 999 ? ` · ${dist(here, l).toFixed(1)} km` : ''}</p>
          <div className="re-spec"><span><Maximize2 size={13} />{l.sqft.toLocaleString('en-IN')} sq.ft</span>{l.bhk && <span><BedDouble size={13} />{l.bhk}</span>}<span><Bath size={13} />{l.baths}</span></div>
          <div className="re-foot"><strong>{inrShort(l.price, l.price_unit)}{l.price_unit === 'month' && <small> / month</small>}</strong><button type="button" className="re-contact" disabled={!!l.market && l.market !== 'available'} onClick={() => (me ? setContact(l) : nav('/login?next=/real-estate'))}><Phone size={13} />Contact {l.agent ? 'Agent' : 'Owner'}</button></div>
          {l.agent && <small className="re-by"><ShieldCheck size={11} />{l.agent.agency || l.agent.name} · verified agent</small>}
        </div>
      </article>)}</div>
    </>}

    {tab === 'mine' && <MyListings data={mine.data} onUpload={() => setUpload(true)} onMark={async (id, m) => { await realestate.mark(id, m); void qc.invalidateQueries({queryKey: ['re-mine']}); void qc.invalidateQueries({queryKey: ['re-home']}); }} />}

    <section className="re-reward">
      <img src="/assets/real-estate/reward-art-light.jpg" alt="" />
      {reward > 0 && <span className="re-badge"><small>Get</small><b>₹{reward}</b><small>Cash</small></span>}
      <div><b>Upload a House Listing</b><small>(Rent or Sale)</small><p><Check size={12} />Add Photos <Check size={12} />Set Price <Check size={12} />Get Verified</p></div>
      <button type="button" className="re-gold" onClick={() => (me ? setUpload(true) : nav('/login?next=/real-estate?upload=1'))}><Upload size={15} />Upload Property</button>
    </section>
    {me && <button type="button" className="re-minebtn" onClick={() => go('mine')}>My listings & reward status <ArrowRight size={14} /></button>}

    <div className="re-sec"><h2><ShieldCheck size={19} />Verified Real-Estate Agents</h2>{me && <button type="button" onClick={() => setAgentForm(true)}>{data.data?.me_agent ? 'Edit agent profile' : 'Join as agent'} <ArrowRight size={14} /></button>}</div>
    {data.data && !data.data.agents.length && <p className="re-note">No verified agents {city ? 'in ' + city : ''} yet. Agents appear here after OJASSS verifies them.</p>}
    <div className="re-agents">{(data.data?.agents ?? []).map(a => <div key={a.id} className="re-agent">
      <span className="re-av">{a.photo ? <img src={a.photo} alt="" /> : <Users size={20} />}<i><Check size={9} strokeWidth={4} /></i></span>
      <div><b>{a.agency || a.name}</b><small><MapPin size={11} />{a.city}</small><small><Building2 size={11} />{a.listings ?? 0} Listings</small></div>
      <div className="re-agent-btns"><a href={'tel:' + a.phone} aria-label="Call" className="re-call"><Phone size={15} /></a><a href={'https://wa.me/' + a.whatsapp.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="re-wa">WA</a></div>
    </div>)}</div>

    {upload && <UploadSheet onClose={() => { setUpload(false); const n = new URLSearchParams(params); n.delete('upload'); setParams(n, {replace: true}); }} defCity={city || me?.city || ''} reward={reward} />}
    {agentForm && <AgentSheet current={data.data?.me_agent ?? null} onClose={() => setAgentForm(false)} />}
    {contact && <ContactSheet l={contact} onClose={() => setContact(null)} />}
  </main>;
}

function MyListings({data, onUpload, onMark}: {data?: {listings: ReListing[]}; onUpload: () => void; onMark: (id: string, m: 'available' | 'sold' | 'rented') => Promise<void>}) {
  if (!data) return <p className="re-note">Loading your listings…</p>;
  return <section><div className="re-sec"><h2><Home size={19} />My Listings</h2><button type="button" onClick={onUpload}>Add <Plus size={14} /></button></div>
    {!data.listings.length && <p className="re-note">You haven't listed a property yet.</p>}
    {data.listings.map(l => <div key={l.id} className="re-mine"><img src={l.photos[0]} alt="" /><div><b>{l.title}</b><small>{l.area ? l.area + ', ' : ''}{l.city} · {inrShort(l.price, l.price_unit)}</small>
      <span className={'re-st is-' + l.status}>{l.status === 'pending' ? 'Under review' : l.status === 'approved' ? 'Live' : l.status === 'rejected' ? 'Not approved' : 'Removed'}</span>
      <span className={'re-st is-r-' + l.reward}>Reward: {l.reward === 'pending' ? 'Pending' : l.reward === 'credited' ? `Credited ₹${Math.round((l.reward_paise ?? 0) / 100)}` : 'Not eligible'}</span>
      {l.reason && <small className="re-bad">{l.reason}</small>}
      {l.status === 'approved' && <div className="re-mark">{(l.market ?? 'available') === 'available' ? <button type="button" onClick={() => { if (confirm(l.deal === 'sale' ? 'Mark this home as SOLD?' : 'Mark this home as RENTED?')) void onMark(l.id, l.deal === 'sale' ? 'sold' : 'rented'); }}>Mark as {l.deal === 'sale' ? 'Sold' : 'Rented'}</button> : <><span className="re-st is-removed">{l.market === 'sold' ? 'Sold' : 'Rented'}</span><button type="button" onClick={() => void onMark(l.id, 'available')}>Mark available again</button></>}</div>}</div></div>)}</section>;
}

function useUploader() {
  const {me} = useAuth();
  return async (f: File) => { if (!me) throw new Error('Sign in first'); const img = await compressImage(f, 1600, 0.82); const path = await uploadObject(img.blob, img.mime, me.id, undefined, AVATAR_BUCKET).promise; return mediaUrl(path, AVATAR_BUCKET) ?? ''; };
}

function UploadSheet({onClose, defCity, reward}: {onClose: () => void; defCity: string; reward: number}) {
  const qc = useQueryClient(); const up = useUploader(); const {me} = useAuth();
  const [f, setF] = useState({kind: 'house' as ReKind, deal: 'rent', title: '', address: '', area: '', city: defCity, owner_name: '', owner_role: 'owner', phone: '', bhk: '2', baths: '2', sqft: '', price: '', furnishing: 'semi', about: '', amenities: ''});
  const [photos, setPhotos] = useState<string[]>([]); const [proof, setProof] = useState(''); const [auth, setAuth] = useState(false); const [geo, setGeo] = useState<{lat: number; lng: number} | null>(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: {target: {value: string}}) => setF(p => ({...p, [k]: e.target.value}));
  const addPhotos = async (files: FileList | null) => { if (!files) return; setErr(''); for (const file of Array.from(files).slice(0, 12 - photos.length)) { setBusy('Uploading photos…'); try { const u = await up(file); setPhotos(p => [...p, u]); } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed'); } } setBusy(''); };
  const addProof = async (file?: File) => { if (!file || !me) return; setBusy('Uploading proof…'); try { const img = await compressImage(file, 1600, 0.82); if (img.blob.size > 3 * 1048576) throw new Error('Proof image is too large'); setProof(await uploadObject(img.blob, img.mime, me.id, undefined, 'receipts').promise); } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed'); } setBusy(''); };
  const submit = async () => { setErr(''); setBusy('Submitting…'); try { await realestate.submit({p_kind: f.kind, p_deal: f.deal, p_title: f.title, p_address: f.address, p_area: f.area, p_city: f.city, p_owner_name: f.owner_name, p_owner_role: f.owner_role, p_phone: f.phone, p_bhk: f.kind === 'plot' || f.kind === 'commercial' ? '' : f.bhk, p_baths: parseInt(f.baths, 10) || 0, p_sqft: parseInt(f.sqft, 10) || 0, p_price: parseInt(f.price, 10) || 0, p_furnishing: f.furnishing, p_about: f.about, p_amenities: f.amenities.split(',').map(s => s.trim()).filter(Boolean), p_photos: photos, p_proof: proof, p_authorised: auth, p_lat: geo?.lat, p_lng: geo?.lng}); setDone(true); void qc.invalidateQueries({queryKey: ['re-mine']}); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not submit.'); } finally { setBusy(''); } };
  return createPortal(<div className="re-back" onClick={onClose}><div className="re-sheet" role="dialog" aria-modal="true" aria-label="List your property" onClick={e => e.stopPropagation()}>
    <header><b>{done ? 'Submitted for review' : 'List Your Property'}</b><button type="button" className="re-ic" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
    {done ? <div className="re-done"><span><Check size={30} strokeWidth={3} /></span><b>Thanks! Your property is under review.</b><p>Our team verifies ownership and checks for duplicates. Once approved it goes live{reward ? ` and ₹${reward} is added to your earnings` : ''}. Track it in “My listings”.</p><button type="button" className="re-gold re-block" onClick={onClose}>Done</button></div> : <>
      <div className="re-seg">{(['rent', 'sale', 'lease'] as const).map(d => <button key={d} type="button" className={cn(f.deal === d && 'is-on')} onClick={() => setF(p => ({...p, deal: d}))}>For {d[0].toUpperCase() + d.slice(1)}</button>)}</div>
      <div className="re-form">
        <select value={f.kind} onChange={set('kind')} aria-label="Property type">{(Object.keys(KIND_LABEL) as ReKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <input value={f.title} onChange={set('title')} placeholder="Title (e.g. 2 BHK near Benz Circle)" maxLength={90} />
        <input value={f.address} onChange={set('address')} placeholder="Full address (kept private until contact)" maxLength={200} />
        <div className="re-two"><input value={f.area} onChange={set('area')} placeholder="Area / locality" maxLength={80} /><input value={f.city} onChange={set('city')} placeholder="City" maxLength={60} /></div>
        <button type="button" className="re-ghost re-sm" onClick={() => navigator.geolocation?.getCurrentPosition(p => setGeo({lat: p.coords.latitude, lng: p.coords.longitude}), () => setErr('Location permission denied. You can still submit.'))}><MapPin size={13} />{geo ? 'Location added ✓' : 'Add my current location (for Nearby)'}</button>
        <div className="re-three">{f.kind !== 'plot' && f.kind !== 'commercial' && <select value={f.bhk} onChange={set('bhk')} aria-label="BHK">{['1', '2', '3', '4', '5'].map(b => <option key={b} value={b}>{b} BHK</option>)}</select>}<input value={f.baths} onChange={set('baths')} inputMode="numeric" placeholder="Baths" aria-label="Bathrooms" /><input value={f.sqft} onChange={e => setF(p => ({...p, sqft: e.target.value.replace(/\D/g, '')}))} inputMode="numeric" placeholder="Sq.ft" aria-label="Area in sq.ft" /></div>
        <div className="re-two"><input value={f.price} onChange={e => setF(p => ({...p, price: e.target.value.replace(/\D/g, '')}))} inputMode="numeric" placeholder={f.deal === 'sale' ? 'Sale price ₹' : 'Rent ₹ / month'} /><select value={f.furnishing} onChange={set('furnishing')} aria-label="Furnishing"><option value="unfurnished">Unfurnished</option><option value="semi">Semi-furnished</option><option value="furnished">Furnished</option></select></div>
        <input value={f.amenities} onChange={set('amenities')} placeholder="Amenities (comma separated: parking, lift, borewell)" />
        <textarea value={f.about} onChange={set('about')} rows={3} placeholder="Description" maxLength={1200} />
        <div className="re-two"><input value={f.owner_name} onChange={set('owner_name')} placeholder="Owner / agent name" maxLength={80} /><input value={f.phone} onChange={e => setF(p => ({...p, phone: e.target.value.replace(/[^0-9+ ]/g, '')}))} inputMode="tel" placeholder="Contact number" maxLength={15} /></div>
        <select value={f.owner_role} onChange={set('owner_role')} aria-label="I am"><option value="owner">I am the owner</option><option value="agent">I am an authorised agent</option></select>
      </div>
      <h3 className="re-h3">Photos <small>{photos.length}/12</small></h3>
      <div className="re-photos">{photos.map((p, i) => <span key={p}><img src={p} alt="" /><button type="button" aria-label="Remove photo" onClick={() => setPhotos(x => x.filter((_, j) => j !== i))}><X size={12} /></button></span>)}
        {photos.length < 12 && <label className="re-add"><ImagePlus size={20} /><small>Add</small><input type="file" accept="image/*" multiple hidden onChange={e => void addPhotos(e.target.files)} /></label>}</div>
      <label className="re-proof"><ShieldCheck size={16} /><span>{proof ? 'Ownership / authorisation proof added ✓' : 'Add ownership or authorisation proof (private)'}</span><input type="file" accept="image/*" hidden onChange={e => void addProof(e.target.files?.[0])} /></label>
      <label className="re-check"><input type="checkbox" checked={auth} onChange={e => setAuth(e.target.checked)} />I own this property or am authorised by the owner to list it. The details and photos are genuine.</label>
      {reward > 0 && <p className="re-note">₹{reward} reward is paid only after our team verifies the listing (genuine, authorised, not a duplicate). One reward per property.</p>}
      {err && <p className="re-err">{err}</p>}
      <button type="button" className="re-gold re-block" disabled={!!busy || !photos.length || !auth} onClick={() => void submit()}>{busy || 'Submit for verification'}</button>
    </>}
  </div></div>, document.body);
}

function AgentSheet({current, onClose}: {current: import('@/api/realestate').ReAgent | null; onClose: () => void}) {
  const qc = useQueryClient(); const up = useUploader();
  const [v, setV] = useState({name: current?.name ?? '', agency: current?.agency ?? '', city: current?.city ?? '', phone: current?.phone ?? '', whatsapp: current?.whatsapp ?? '', about: current?.about ?? '', photo: current?.photo ?? ''});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState(false);
  const save = async () => { setBusy(true); setErr(''); try { await realestate.agentApply(Object.fromEntries(Object.entries(v).map(([k, x]) => ['p_' + k, x]))); setOk(true); void qc.invalidateQueries({queryKey: ['re-home']}); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } };
  return createPortal(<div className="re-back" onClick={onClose}><div className="re-sheet" role="dialog" aria-modal="true" aria-label="Agent profile" onClick={e => e.stopPropagation()}>
    <header><b>Real-estate agent profile</b><button type="button" className="re-ic" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
    {ok ? <div className="re-done"><span><Check size={30} strokeWidth={3} /></span><b>Sent for verification</b><p>You'll show as a verified agent once OJASSS checks your details.</p><button type="button" className="re-gold re-block" onClick={onClose}>Done</button></div> : <div className="re-form">
      <label className="re-proof"><User size={16} /><span>{v.photo ? 'Photo added ✓' : 'Add profile photo'}</span><input type="file" accept="image/*" hidden onChange={async e => { const file = e.target.files?.[0]; if (file) { try { const u = await up(file); setV(p => ({...p, photo: u})); } catch { setErr('Upload failed'); } } }} /></label>
      {(['name', 'agency', 'city', 'phone', 'whatsapp'] as const).map(k => <input key={k} value={v[k]} onChange={e => setV(p => ({...p, [k]: e.target.value}))} placeholder={{name: 'Your name', agency: 'Agency name (optional)', city: 'City', phone: 'Phone', whatsapp: 'WhatsApp number'}[k]} />)}
      <textarea value={v.about} onChange={e => setV(p => ({...p, about: e.target.value}))} rows={2} placeholder="About you / areas you cover" />
      {err && <p className="re-err">{err}</p>}
      <button type="button" className="re-gold re-block" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : current ? 'Update profile' : 'Apply as agent'}</button>
      {current?.status && <p className="re-note">Status: {current.status === 'verified' ? 'Verified ✓' : current.status === 'pending' ? 'Under review' : 'Not verified'}</p>}
    </div>}
  </div></div>, document.body);
}

function ContactSheet({l, onClose}: {l: ReListing; onClose: () => void}) {
  const q = useQuery({queryKey: ['re-contact', l.id], queryFn: () => realestate.contact(l.id)});
  return createPortal(<div className="re-back" onClick={onClose}><div className="re-sheet" role="dialog" aria-modal="true" aria-label="Contact" onClick={e => e.stopPropagation()}>
    <header><b>Contact {l.agent ? 'agent' : 'owner'}</b><button type="button" className="re-ic" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
    {q.isLoading ? <p className="re-note">Loading…</p> : q.data ? <div className="re-contact-box"><b>{q.data.name}</b><small>{l.title}</small>{q.data.address && <small><MapPin size={11} /> {q.data.address}</small>}
      <div className="re-agent-btns"><a className="re-gold" href={'tel:' + q.data.phone}><Phone size={15} />Call {q.data.phone}</a><a className="re-wa re-wa-wide" target="_blank" rel="noreferrer" href={'https://wa.me/' + q.data.whatsapp.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1') + '?text=' + encodeURIComponent('Hi, I saw your listing "' + l.title + '" on OJASSS.')}>WhatsApp</a></div>
      <p className="re-note">Never pay a deposit before visiting the property and verifying the owner.</p></div> : <p className="re-err">Could not load contact.</p>}
  </div></div>, document.body);
}
