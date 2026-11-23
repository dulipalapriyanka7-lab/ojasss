import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Coins} from 'lucide-react';
import {useState} from 'react';
import {coins, coinTypeLabel} from '@/api/coins';
import './admin-business.css';
import './admin-demo.css';

/** Admin: every game coin movement, plus manual credit/debit with a reason. */
export default function AdminCoins(){
 const qc=useQueryClient();const q=useQuery({queryKey:['coins-admin'],queryFn:coins.adminLedger});
 const [u,setU]=useState('');const [n,setN]=useState('');const [note,setNote]=useState('');const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
 const go=async()=>{setBusy(true);setMsg('');try{const r=await coins.adjust(u.trim(),parseInt(n,10),note.trim());setMsg(`@${r.username} now has ${r.coins} coins.`);setN('');setNote('');void qc.invalidateQueries({queryKey:['coins-admin']});}catch(e){setMsg(e instanceof Error?e.message:'Failed.');}finally{setBusy(false);}};
 return <div className="ab ad">
  <div className="ab-top"><div className="ab-title"><span className="ab-logo"><Coins size={16}/></span><div><h1>Game coins <span className="nav-new-tag">NEW</span></h1><p>1 coin = ₹1 · not withdrawable · {(q.data?.total_coins??0).toLocaleString('en-IN')} coins held by members</p></div></div></div>
  <section className="ab-card">
   <div className="ab-head"><h2>Credit or debit coins</h2></div>
   <div style={{display:'grid',gap:8,gridTemplateColumns:'1fr 120px',padding:'0 0 4px'}}>
    <input className="ab-input" value={u} onChange={e=>setU(e.target.value)} placeholder="@username" aria-label="Username"/>
    <input className="ab-input" value={n} onChange={e=>setN(e.target.value.replace(/[^0-9-]/g,''))} placeholder="+100 / -50" aria-label="Coins"/>
    <input className="ab-input" style={{gridColumn:'1/-1'}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Reason (required)" aria-label="Reason"/>
   </div>
   <button type="button" className="ab-btn ok" disabled={busy||!u.trim()||!parseInt(n,10)||note.trim().length<3} onClick={()=>void go()}>{busy?'Saving…':'Apply'}</button>
   {msg&&<p className="ab-empty">{msg}</p>}
  </section>
  <section className="ab-card">
   <div className="ab-head"><h2>Coin history</h2><span>{q.data?.ledger.length??0}</span></div>
   {q.isLoading&&<p className="ab-empty">Loading…</p>}
   <div className="cr-table" role="table">
    <div className="cr-tr cr-th" role="row"><span>Member</span><span>Type</span><span>Coins</span><span>Balance</span><span>Date</span></div>
    {q.data?.ledger.map(m=><div key={m.id} className="cr-tr" role="row"><span className="cr-city"><b>@{m.username}</b><small>{m.note}</small></span><span>{coinTypeLabel[m.type]??m.type}</span><span style={{color:m.delta>0?'#4ade80':'#fb7185',fontWeight:800}}>{m.delta>0?'+':''}{m.delta}</span><span>{m.balance}</span><span>{new Date(m.created_at).toLocaleDateString('en-IN')}</span></div>)}
   </div>
  </section>
 </div>;
}
