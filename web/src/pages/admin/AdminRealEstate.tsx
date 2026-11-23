import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Home} from 'lucide-react';
import {useEffect, useState} from 'react';
import {inrShort, KIND_LABEL, realestate, type ReListing} from '@/api/realestate';
import {mediaUrl} from '@/lib/media';
import './admin-business.css';
import './admin-demo.css';

type Tab = 'review' | 'live' | 'agents' | 'enquiries' | 'rewards';

/** Admin: verify property listings (ownership, duplicates), approve rewards, verify agents, view enquiries. */
export default function AdminRealEstate() {
  const qc = useQueryClient(); const q = useQuery({queryKey: ['re-admin'], queryFn: realestate.adminGet});
  const [tab, setTab] = useState<Tab>('review'); const [msg, setMsg] = useState(''); const [reward, setReward] = useState('');
  useEffect(() => { if (q.data) setReward(String(Math.round(q.data.reward_paise / 100))); }, [q.data]);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setMsg(''); try { await fn(); setMsg(ok); await qc.invalidateQueries({queryKey: ['re-admin']}); void qc.invalidateQueries({queryKey: ['re-home']}); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.'); } };
  const d = q.data; const pending = (d?.listings ?? []).filter(l => l.status === 'pending'); const live = (d?.listings ?? []).filter(l => l.status === 'approved');
  const pendAgents = (d?.agents ?? []).filter(a => a.status === 'pending').length;
  const byId = new Map((d?.listings ?? []).map(l => [l.id, l]));
  return <div className="ab ad">
    <div className="ab-top"><div className="ab-title"><span className="ab-logo"><Home size={16} /></span><div><h1>Real Estate <span className="nav-new-tag">NEW</span></h1><p>Verify listings and agents · reward paid only on approval, once per property</p></div></div></div>
    <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10}}>{([['review', `Review (${pending.length})`], ['live', `Live (${live.length})`], ['agents', `Agents${pendAgents ? ` (${pendAgents})` : ''}`], ['enquiries', 'Enquiries'], ['rewards', 'Rewards']] as [Tab, string][]).map(([t, l]) => <button key={t} type="button" className={'ab-btn' + (tab === t ? ' ok' : '')} onClick={() => setTab(t)}>{l}</button>)}</div>
    {msg && <p className="ab-empty">{msg}</p>}
    {(tab === 'review' || tab === 'live') && <section className="ab-card">
      <div className="ab-head"><h2>{tab === 'review' ? 'Pending listings' : 'Live listings'}</h2></div>
      {!(tab === 'review' ? pending : live).length && <p className="ab-empty">Nothing here.</p>}
      {(tab === 'review' ? pending : live).map(l => <ListingReview key={l.id} l={l} dupe={l.duplicate_of ? byId.get(l.duplicate_of) : undefined} run={run} live={tab === 'live'} />)}
    </section>}
    {tab === 'agents' && <section className="ab-card"><div className="ab-head"><h2>Agents</h2></div>
      {!(d?.agents.length) && <p className="ab-empty">No agent applications yet.</p>}
      {d?.agents.map(a => <div key={a.id} style={{display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #ffffff10', fontSize: 12.5, flexWrap: 'wrap'}}>
        {a.photo ? <img src={a.photo} alt="" style={{width: 40, height: 40, borderRadius: '50%', objectFit: 'cover'}} /> : <span style={{width: 40, height: 40, borderRadius: '50%', background: '#ffffff14'}} />}
        <div style={{flex: 1, minWidth: 200}}><b>{a.agency || a.name}</b> · {a.name} · @{a.username}<br /><small style={{opacity: .75}}>{a.city} · {a.phone} · WA {a.whatsapp} · <b>{a.status}</b></small>{a.about && <><br /><small style={{opacity: .65}}>{a.about}</small></>}</div>
        {a.status !== 'verified' && <button type="button" className="ab-btn ok" onClick={() => void run(() => realestate.adminAgent(a.id, 'verified'), 'Agent verified.')}>Verify</button>}
        {a.status !== 'rejected' && <button type="button" className="ab-btn" onClick={() => void run(() => realestate.adminAgent(a.id, 'rejected'), 'Agent rejected.')}>Reject</button>}
      </div>)}
    </section>}
    {tab === 'enquiries' && <section className="ab-card"><div className="ab-head"><h2>Enquiries</h2><span>{d?.enquiries.length ?? 0}</span></div>
      {d?.enquiries.map(e => <div key={e.id} style={{padding: '7px 0', borderTop: '1px solid #ffffff10', fontSize: 12.5}}><b>@{e.username}</b> → {e.to} · {e.title}<br /><small style={{opacity: .7}}>{new Date(e.created_at).toLocaleString('en-IN')}{e.note ? ' · ' + e.note : ''}</small></div>)}
      {!d?.enquiries.length && <p className="ab-empty">No enquiries yet.</p>}
    </section>}
    {tab === 'rewards' && <section className="ab-card"><div className="ab-head"><h2>Listing reward</h2></div>
      <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}><span style={{fontSize: 12}}>Cash reward per verified listing ₹</span><input className="ab-input" style={{width: 100}} inputMode="numeric" value={reward} onChange={e => setReward(e.target.value.replace(/\D/g, ''))} /><button type="button" className="ab-btn ok" onClick={() => void run(() => realestate.adminReward((parseInt(reward, 10) || 0) * 100), 'Reward saved. Applies to new submissions.')}>Save</button></div>
      <div className="ab-head" style={{marginTop: 12}}><h2>Reward history</h2></div>
      {d?.rewards.map(l => <div key={l.id} style={{padding: '6px 0', borderTop: '1px solid #ffffff10', fontSize: 12.5}}><b>{l.title}</b> · @{l.username} · {l.reward === 'credited' ? `Credited ₹${Math.round((l.reward_paise ?? 0) / 100)}` : 'Not eligible'}</div>)}
      {!d?.rewards.length && <p className="ab-empty">No rewards decided yet.</p>}
    </section>}
  </div>;
}

function ListingReview({l, dupe, run, live}: {l: ReListing; dupe?: ReListing; run: (fn: () => Promise<unknown>, ok: string) => Promise<void>; live: boolean}) {
  const [reason, setReason] = useState(''); const [verified, setVerified] = useState(false); const [pay, setPay] = useState(!l.duplicate_of);
  return <div style={{padding: '10px 0', borderTop: '1px solid #ffffff14', fontSize: 12.5}}>
    <div style={{display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6}}>{l.photos.map(p => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" style={{width: 96, height: 70, objectFit: 'cover', borderRadius: 8}} /></a>)}
      {l.proof && <a href={mediaUrl(l.proof, 'receipts') ?? '#'} target="_blank" rel="noreferrer" style={{display: 'grid', placeItems: 'center', width: 96, height: 70, borderRadius: 8, border: '1px dashed #fbbf24', color: '#fbbf24', fontSize: 11}}>Proof</a>}</div>
    <b>{l.title}</b> · {KIND_LABEL[l.kind]} · for {l.deal} · {inrShort(l.price, l.price_unit)}{l.price_unit === 'month' ? '/mo' : ''}<br />
    <small style={{opacity: .8}}>{l.address}, {l.area}, {l.city} · {l.bhk ? l.bhk + ' BHK · ' : ''}{l.sqft} sq.ft · {l.baths} bath · {l.furnishing}</small><br />
    <small style={{opacity: .8}}>{l.owner_role === 'agent' ? 'Agent' : 'Owner'}: {l.owner_name} · {l.phone} · by @{l.username} · reward {l.reward}{l.market && l.market !== 'available' ? ' · marked ' + l.market.toUpperCase() + ' by uploader' : ''}</small>
    {l.about && <p style={{margin: '4px 0', opacity: .75}}>{l.about}</p>}
    {dupe && <p style={{margin: '4px 0', color: '#fca5a5'}}>⚠ Possible duplicate of “{dupe.title}” by @{dupe.username} ({dupe.status}). No reward for duplicates.</p>}
    {!l.proof && !live && <p style={{margin: '4px 0', color: '#fcd34d'}}>No ownership proof uploaded — verify by phone/visit before approving.</p>}
    <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6}}>
      {!live && <><label style={{fontSize: 12}}><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> Ownership / authorisation verified</label>
        <label style={{fontSize: 12}}><input type="checkbox" checked={pay} disabled={!!l.duplicate_of} onChange={e => setPay(e.target.checked)} /> Pay ₹{Math.round((l.reward_paise ?? 0) / 100)} reward</label>
        <button type="button" className="ab-btn ok" disabled={!verified} onClick={() => void run(() => realestate.adminListing(l.id, 'approve', {verified, reward: pay}), 'Approved' + (pay ? ' and reward credited.' : '.'))}>Approve</button></>}
      <input className="ab-input" style={{flex: 1, minWidth: 160}} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (to reject/remove)" />
      {!live && <button type="button" className="ab-btn" disabled={!reason.trim()} onClick={() => void run(() => realestate.adminListing(l.id, 'reject', {reason}), 'Rejected.')}>Reject</button>}
      <button type="button" className="ab-btn" disabled={!reason.trim()} onClick={() => void run(() => realestate.adminListing(l.id, 'remove', {reason}), 'Removed.')}>Remove (fraud)</button>
    </div>
  </div>;
}
