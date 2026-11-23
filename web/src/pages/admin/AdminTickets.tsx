import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Ticket as TicketIcon} from 'lucide-react';
import {useState} from 'react';
import {ORDER_LABEL, SOURCE_LABEL, tickets, type Ticket, type TicketOrder} from '@/api/tickets';
import {mediaUrl} from '@/lib/media';
import {ListingCard} from '@/pages/TicketsPage';
import './admin-business.css';
import './admin-demo.css';

const rupee=(n:number)=>'₹'+n.toLocaleString('en-IN');
const proofUrl=(path:string)=>mediaUrl(path,'receipts')??'';

/** Admin: review ticket listings (proof is private) and handle buyer payments / transfers. */
export default function AdminTickets(){
 const qc=useQueryClient();
 const list=useQuery({queryKey:['tickets-admin'],queryFn:tickets.adminList});
 const orders=useQuery({queryKey:['tickets-admin-orders'],queryFn:tickets.adminOrders});
 const [msg,setMsg]=useState('');
 const run=async(fn:()=>Promise<unknown>)=>{setMsg('');try{await fn();void qc.invalidateQueries({queryKey:['tickets-admin']});void qc.invalidateQueries({queryKey:['tickets-admin-orders']});}catch(e){setMsg(e instanceof Error?e.message:'Failed.');}};
 const pending=(list.data??[]).filter(t=>t.status==='pending_review');
 return <div className="ab ad">
  <div className="ab-top"><div className="ab-title"><span className="ab-logo"><TicketIcon size={16}/></span><div><h1>Tickets <span className="nav-new-tag">NEW</span></h1><p>Review listings before they go live · confirm buyer payments · mark transfers</p></div></div></div>
  {msg&&<p className="ab-empty" style={{color:'#fda4af'}}>{msg}</p>}
  <section className="ab-card"><div className="ab-head"><h2>Pending review</h2><span>{pending.length}</span></div>
   {!pending.length&&<p className="ab-empty">Nothing to review.</p>}
   {pending.map(t=><Review key={t.id} t={t} run={run}/>)}
  </section>
  <section className="ab-card"><div className="ab-head"><h2>Buyer orders</h2><span>{orders.data?.length??0}</span></div>
   {!orders.data?.length&&<p className="ab-empty">No orders yet.</p>}
   {orders.data?.map(o=><OrderRow key={o.id} o={o} run={run}/>)}
  </section>
  <section className="ab-card"><div className="ab-head"><h2>All listings</h2><span>{list.data?.length??0}</span></div>
   <div className="ls-grid">{list.data?.map(t=><ListingCard key={t.id} t={t} readOnly/>)}</div>
  </section>
 </div>;
}

function Review({t,run}:{t:Ticket;run:(fn:()=>Promise<unknown>)=>Promise<void>}){
 const [reason,setReason]=useState('');const [verified,setVerified]=useState(false);
 return <div style={{display:'flex',gap:10,padding:'10px 0',borderTop:'1px solid #ffffff12',flexWrap:'wrap'}}>
  {t.proof_path&&<a href={proofUrl(t.proof_path)} target="_blank" rel="noreferrer"><img src={proofUrl(t.proof_path)} alt="Ticket proof" style={{width:90,height:120,objectFit:"cover",borderRadius:8,border:"1px solid #ffffff22"}}/></a>}
  <div style={{flex:1,minWidth:220,fontSize:12.5,lineHeight:1.5}}>
   <b>{t.title}</b> · {t.category}<br/>{t.venue}, {t.city} · {new Date(t.event_at).toLocaleString('en-IN')}<br/>
   {t.quantity} × · {t.seats} · {SOURCE_LABEL[t.source]} · booking <code>{t.booking_ref}</code><br/>
   Original {rupee(t.original_price)} → selling <b>{rupee(t.price)}</b> · seller @{t.seller}
  </div>
  <div style={{display:'flex',flexDirection:'column',gap:6,minWidth:220}}>
   <label style={{fontSize:12,display:'flex',gap:6}}><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>I checked the booking with the provider/organiser (shows “Verified”)</label>
   <input className="ab-input" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (required to reject)"/>
   <div style={{display:'flex',gap:6}}><button type="button" className="ab-btn ok" onClick={()=>void run(()=>tickets.review(t.id,'approve','',verified))}>Approve & list</button><button type="button" className="ab-btn" disabled={!reason.trim()} onClick={()=>void run(()=>tickets.review(t.id,'reject',reason,false))}>Reject</button></div>
  </div>
 </div>;
}

function OrderRow({o,run}:{o:TicketOrder;run:(fn:()=>Promise<unknown>)=>Promise<void>}){
 const [note,setNote]=useState('');const open=o.status==='pending'||o.status==='paid';
 return <div style={{display:'flex',gap:10,padding:'10px 0',borderTop:'1px solid #ffffff12',flexWrap:'wrap',fontSize:12.5,lineHeight:1.5}}>
  <div style={{flex:1,minWidth:220}}><b>{o.ticket?.title??'Ticket'}</b> · {ORDER_LABEL[o.status]}<br/>Buyer @{o.buyer} · {o.buyer_name} · {o.buyer_phone}<br/>Seller @{o.seller} · UTR <code>{o.utr}</code> · total {rupee(o.total)} (fee {rupee(o.fee)}){o.note?<><br/>Note: {o.note}</>:null}</div>
  {open&&<div style={{display:'flex',flexDirection:'column',gap:6,minWidth:220}}>
   <input className="ab-input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (required to reject)"/>
   <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
    {o.status==='pending'&&<button type="button" className="ab-btn ok" onClick={()=>void run(()=>tickets.orderUpdate(o.id,'paid',note))}>Payment received</button>}
    <button type="button" className="ab-btn ok" onClick={()=>void run(()=>tickets.orderUpdate(o.id,'transferred',note))}>Ticket transferred</button>
    <button type="button" className="ab-btn" disabled={!note.trim()} onClick={()=>void run(()=>tickets.orderUpdate(o.id,'rejected',note))}>Reject & relist</button>
   </div></div>}
 </div>;
}
