import {useQueryClient} from '@tanstack/react-query';
import {Trophy} from 'lucide-react';
import {useEffect, useState} from 'react';
import {inr, PRIZE_ORDER, prizes, usePrizes, type PrizeTier} from '@/api/prizes';
import './admin-business.css';
import './admin-demo.css';

const LABEL: Record<PrizeTier, string> = {gold: 'Gold · Rank 1', silver: 'Silver · Rank 2', platinum: 'Platinum · Rank 3', emerald: 'Emerald · Rank 4', bronze: 'Bronze · Rank 5'};

/** Admin: weekly leaderboard prize money shown on the leaderboard once announced. */
export default function AdminPrizes() {
  const qc = useQueryClient(); const q = usePrizes();
  const [v, setV] = useState<Record<PrizeTier, string>>({gold: '', silver: '', platinum: '', emerald: '', bronze: ''});
  const [announced, setAnnounced] = useState(false); const [note, setNote] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const d = q.data; if (!d) return; setV(Object.fromEntries(PRIZE_ORDER.map(k => [k, String(d[k] || '')])) as Record<PrizeTier, string>); setAnnounced(d.announced); setNote(d.note); }, [q.data]);
  const total = PRIZE_ORDER.reduce((t, k) => t + (parseInt(v[k], 10) || 0), 0);
  const save = async () => { setBusy(true); setMsg(''); try { await prizes.save({...Object.fromEntries(PRIZE_ORDER.map(k => [k, parseInt(v[k], 10) || 0])), announced, note}); setMsg(announced ? 'Saved and shown on the leaderboard.' : 'Saved (hidden until you announce it).'); await qc.invalidateQueries({queryKey: ['leaderboard-prizes']}); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.'); } finally { setBusy(false); } };
  return <div className="ab ad">
    <div className="ab-top"><div className="ab-title"><span className="ab-logo"><Trophy size={16} /></span><div><h1>Leaderboard prizes <span className="nav-new-tag">NEW</span></h1><p>Prize money per rank, shown on the weekly leaderboard when announced</p></div></div></div>
    <section className="ab-card">
      <div className="ab-head"><h2>Prize money (₹)</h2><span>Total {inr(total)}</span></div>
      <div style={{display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))'}}>
        {PRIZE_ORDER.map(k => <label key={k} style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12}}>{LABEL[k]}<input className="ab-input" inputMode="numeric" value={v[k]} placeholder="0" onChange={e => setV(p => ({...p, [k]: e.target.value.replace(/\D/g, '')}))} /></label>)}
      </div>
      <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginTop: 8}}>Note under the banner (optional)<input className="ab-input" value={note} maxLength={160} placeholder="Weekly rewards for the top 5 creators" onChange={e => setNote(e.target.value)} /></label>
      <label style={{display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 10}}><input type="checkbox" checked={announced} onChange={e => setAnnounced(e.target.checked)} />Announced & confirmed — show prize money on the leaderboard</label>
      <div style={{display: 'flex', gap: 8, marginTop: 10, alignItems: 'center'}}><button type="button" className="ab-btn ok" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save prizes'}</button>{msg && <span style={{fontSize: 12, opacity: .8}}>{msg}</span>}</div>
    </section>
  </div>;
}
