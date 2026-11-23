import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Check, Ticket, X} from 'lucide-react';
import {useState} from 'react';
import {rpc} from '@/api/client';
import '@/pages/admin/admin-business.css';

type Entry={id:string;username:string;utr:string;amount_paise:number;status:string;created_at:string;expires_at:number};
type Queue={fee_paise:number;active:boolean;reward_paise:number;pending:Entry[];recent:Entry[]};

/** Admin: set the game entry fee and approve UPI payments (each approval = 24-hour pass). */
export function GameEntryQueue(){
 const qc=useQueryClient();
 const q=useQuery({queryKey:['admin','monster-entry'],queryFn:()=>rpc<Queue>('monster_game_entry_queue'),refetchInterval:20000});
 const refresh=()=>qc.invalidateQueries({queryKey:['admin','monster-entry']});
 const review=useMutation({mutationFn:(a:{id:string;approve:boolean})=>rpc('monster_game_entry_review',{id:a.id,approve:a.approve,reason:a.approve?'':'Payment not found'}),onSuccess:refresh});
 const [fee,setFee]=useState<string>('');const [err,setErr]=useState('');
 const saveFee=useMutation({mutationFn:(r:number)=>rpc('monster_game_entry_fee',{rupees:r}),onSuccess:()=>{setFee('');setErr('');refresh();},onError:e=>setErr(e instanceof Error?e.message:'Could not save.')});
 const d=q.data;if(!d)return null;
 return <section className="ab-card">
  <div className="ab-head"><Ticket size={15}/><h2>Game entry payments</h2><span>{d.pending.length} pending</span></div>
  <div className="ab-row" style={{borderTop:0}}>
   <div className="ab-main"><b>Entry fee: ₹{d.fee_paise/100} {d.active?'· charging':'· free'}</b><span>Each approved payment gives a 24-hour pass. Cash rewards: {d.reward_paise?`₹${d.reward_paise/100}/elimination`:'off'}</span></div>
   <input className="ab-in" style={{width:70}} type="number" min={0} max={1000} placeholder="₹" value={fee} onChange={e=>setFee(e.target.value)} aria-label="Entry fee in rupees"/>
   <button type="button" className="ab-btn ok" disabled={fee===''||saveFee.isPending} onClick={()=>saveFee.mutate(Number(fee))}>Set</button>
  </div>
  {err&&<p className="ab-err">{err}</p>}
  <div className="ab-list">
   {!d.pending.length&&<p className="ab-empty">No payments waiting.</p>}
   {d.pending.map(e=><div key={e.id} className="ab-row"><span className="ab-av">₹</span>
    <div className="ab-main"><b>@{e.username} · ₹{e.amount_paise/100}</b><span>UTR {e.utr} · {new Date(e.created_at).toLocaleString()}</span></div>
    <button type="button" className="ab-btn ok" disabled={review.isPending} onClick={()=>review.mutate({id:e.id,approve:true})}><Check size={13}/>Approve</button>
    <button type="button" className="ab-btn" disabled={review.isPending} onClick={()=>review.mutate({id:e.id,approve:false})}><X size={13}/>Reject</button>
   </div>)}
   {d.recent.slice(0,5).map(e=><div key={e.id} className="ab-row"><span className="ab-av">₹</span><div className="ab-main"><b>@{e.username}</b><span>UTR {e.utr}{e.status==='approved'&&e.expires_at?` · pass until ${new Date(e.expires_at*1000).toLocaleString()}`:''}</span></div><span className={'ab-pill is-'+e.status}>{e.status}</span></div>)}
  </div>
 </section>;
}
