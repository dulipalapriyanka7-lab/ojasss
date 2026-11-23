import {useQuery, useQueryClient} from '@tanstack/react-query';
import {MessageSquareMore} from 'lucide-react';
import {useEffect, useState} from 'react';
import {FB_CATS, FB_STATUS, feedback, type Feedback, type FbStatus} from '@/api/feedback';
import {mediaUrl} from '@/lib/media';
import './admin-business.css';
import './admin-demo.css';

/** Admin-only inbox for private user feedback. */
export default function AdminFeedback() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<FbStatus | ''>(''); const [search, setSearch] = useState(''); const [q2, setQ2] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ2(search), 300); return () => clearTimeout(t); }, [search]);
  const q = useQuery({queryKey: ['fb-admin', status, q2], queryFn: () => feedback.adminList(status, q2), refetchInterval: 30000});
  const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const c = q.data?.counts;
  const run = async (fn: () => Promise<unknown>, ok: string) => { setMsg(''); try { await fn(); setMsg(ok); await qc.invalidateQueries({queryKey: ['fb-admin']}); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.'); } };
  return <div className="ab ad">
    <div className="ab-top"><div className="ab-title"><span className="ab-logo"><MessageSquareMore size={16} /></span><div><h1>User Feedback <span className="nav-new-tag">NEW</span></h1><p>Private suggestions, feature requests, bugs and complaints · admins only</p></div></div></div>
    <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8}}>
      <button type="button" className={'ab-btn' + (status === '' ? ' ok' : '')} onClick={() => setStatus('')}>All ({q.data?.total ?? 0})</button>
      {(Object.keys(FB_STATUS) as FbStatus[]).map(s => <button key={s} type="button" className={'ab-btn' + (status === s ? ' ok' : '')} onClick={() => setStatus(s)}>{FB_STATUS[s]} ({c?.[s] ?? 0})</button>)}
      <input className="ab-input" style={{flex: 1, minWidth: 180}} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subject, message, user or FB-ID" aria-label="Search feedback" />
    </div>
    {msg && <p className="ab-empty">{msg}</p>}
    <section className="ab-card">
      {q.isLoading && <p className="ab-empty">Loading…</p>}
      {q.data && !q.data.items.length && <p className="ab-empty">No feedback here.</p>}
      {q.data?.items.map(f => <Row key={f.id} f={f} open={open === f.id} onOpen={() => setOpen(open === f.id ? null : f.id)} run={run} />)}
    </section>
  </div>;
}

function Row({f, open, onOpen, run}: {f: Feedback; open: boolean; onOpen: () => void; run: (fn: () => Promise<unknown>, ok: string) => Promise<void>}) {
  const [notes, setNotes] = useState(f.admin_notes ?? '');
  const color: Record<FbStatus, string> = {new: '#f472b6', review: '#fbbf24', resolved: '#4ade80', closed: '#94a3b8'};
  return <div style={{padding: '10px 0', borderTop: '1px solid #ffffff12', fontSize: 12.5}}>
    <button type="button" onClick={onOpen} style={{display: 'block', width: '100%', textAlign: 'left'}}>
      <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
        <code style={{fontSize: 11, opacity: .7}}>{f.ref ?? f.id.slice(0, 8)}</code>
        <span style={{padding: '1px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: color[f.status], border: `1px solid ${color[f.status]}66`}}>{FB_STATUS[f.status]}</span>
        <span style={{fontSize: 11, opacity: .8}}>{FB_CATS.find(x => x.v === f.category)?.l}</span>
        {f.attachment_path && <span style={{fontSize: 11}}>📎</span>}
        <span style={{marginLeft: 'auto', fontSize: 11, opacity: .6}}>{new Date(f.created_at).toLocaleString('en-IN')}</span>
      </div>
      <b style={{display: 'block', marginTop: 4}}>{f.subject}</b>
      <span style={{opacity: .75}}>{f.display_name} · @{f.username} · <code style={{fontSize: 10.5}}>{f.user_id}</code></span>
      {!open && <p style={{margin: '3px 0 0', opacity: .7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{f.message}</p>}
    </button>
    {open && <div style={{marginTop: 8}}>
      <p style={{margin: '0 0 8px', whiteSpace: 'pre-wrap', lineHeight: 1.5}}>{f.message}</p>
      {f.attachment_path && <a href={mediaUrl(f.attachment_path, 'receipts') ?? '#'} target="_blank" rel="noreferrer"><img src={mediaUrl(f.attachment_path, 'receipts') ?? ''} alt="Attachment" style={{maxWidth: 240, maxHeight: 200, borderRadius: 8, border: '1px solid #ffffff22'}} /></a>}
      {f.assigned_to && <p style={{margin: '6px 0', fontSize: 11.5, opacity: .75}}>Assigned to @{f.assigned_to}</p>}
      <textarea className="ab-input" style={{width: '100%', height: 64, marginTop: 6}} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal admin notes (never shown to the user)" />
      <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6}}>
        <button type="button" className="ab-btn ok" onClick={() => void run(() => feedback.adminUpdate(f.id, {notes}), 'Notes saved.')}>Save notes</button>
        <button type="button" className="ab-btn" onClick={() => void run(() => feedback.adminUpdate(f.id, {assignMe: true, status: f.status === 'new' ? 'review' : undefined}), 'Assigned to you.')}>Assign to me</button>
        {(Object.keys(FB_STATUS) as FbStatus[]).filter(s => s !== f.status).map(s => <button key={s} type="button" className={'ab-btn' + (s === 'resolved' ? ' ok' : '')} onClick={() => void run(() => feedback.adminUpdate(f.id, {status: s}), 'Marked ' + FB_STATUS[s] + '.')}>{s === 'resolved' ? 'Mark resolved' : FB_STATUS[s]}</button>)}
      </div>
    </div>}
  </div>;
}
