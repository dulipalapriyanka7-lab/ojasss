import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Check, Copy, IndianRupee, Ticket} from 'lucide-react';
import {useState} from 'react';
import {rpc} from '@/api/client';
import {monsterGameStatusKey} from '@/api/monsterGame';

type EntryStatus={fee_paise:number;active:boolean;upi_id:string;pass_until:string|null;requests:{id:string;status:'pending'|'approved'|'rejected';utr:string;created_at:string;reason?:string|null}[]};

/** Rs 20 game pass: pay by UPI, submit the UTR, admin verifies, the pass lasts 24 hours. */
export function GameEntryPass(){
 const qc=useQueryClient();
 const q=useQuery({queryKey:['monster-entry'],queryFn:()=>rpc<EntryStatus>('monster_game_entry_status'),refetchInterval:20000});
 const [utr,setUtr]=useState('');const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [copied,setCopied]=useState(false);
 const d=q.data;if(!d)return null;
 const fee=d.fee_paise/100;const pending=d.requests.find(r=>r.status==='pending');const last=d.requests[0];
 const submit=async()=>{setBusy(true);setErr('');try{await rpc('monster_game_entry_submit',{utr});setUtr('');await q.refetch();qc.invalidateQueries({queryKey:monsterGameStatusKey});}catch(e){setErr(e instanceof Error?e.message:'Could not submit.');}finally{setBusy(false);}};
 const upiLink=`upi://pay?pa=${encodeURIComponent(d.upi_id)}&pn=OJASSS&am=${fee}&cu=INR&tn=${encodeURIComponent('OJASSS game entry')}`;
 return <div className="gp">
  <div className="gp-head"><span className="gp-ico"><Ticket size={18}/></span><div><b>Game pass · ₹{fee}</b><small>Play unlimited matches for 24 hours</small></div></div>
  {pending?<p className="gp-wait">Payment {pending.utr} is being checked. Your pass starts as soon as the admin approves it.</p>:<>
   <ol className="gp-steps">
    <li>Pay <b>₹{fee}</b> to <button type="button" className="gp-upi" onClick={()=>{void navigator.clipboard?.writeText(d.upi_id);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>{d.upi_id}{copied?<Check size={12}/>:<Copy size={12}/>}</button></li>
    <li>Enter the UPI reference (UTR) below</li>
   </ol>
   <a className="gp-pay" href={upiLink}><IndianRupee size={15}/>Pay ₹{fee} with UPI app</a>
   <div className="gp-form"><input value={utr} onChange={e=>setUtr(e.target.value.replace(/\s/g,''))} placeholder="12-digit UTR" inputMode="numeric" maxLength={30} aria-label="UPI reference number"/><button type="button" disabled={busy||utr.length<8} onClick={()=>void submit()}>{busy?'Sending…':'Submit'}</button></div>
   {last?.status==='rejected'&&<p className="gp-err">Last payment was not approved{last.reason?`: ${last.reason}`:''}.</p>}
   {err&&<p className="gp-err">{err}</p>}
  </>}
  <p className="gp-note">Entry fee only. Game coins have no cash value and there are no cash prizes.</p>
 </div>;
}
