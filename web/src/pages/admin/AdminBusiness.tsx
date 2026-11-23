import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {CITIES} from '@/lib/cities';
import {Check, Pencil, Plus, Store, Trash2, X} from 'lucide-react';
import {useState} from 'react';
import {business, type BizCategory, type BizOrder, type BizProduct} from '@/api/business';
import {BIZ_CATS} from '@/lib/businessCats';
import {cn} from '@/lib/utils';
import {useAuth} from '@/hooks/useAuth';
import {uploadObject} from '@/api/upload';
import {compressImage, mediaUrl} from '@/lib/media';
import '../business-hub.css';
import './admin-business.css';

const CATS=BIZ_CATS.filter(c=>c.value!=='all');
const blank:Partial<BizProduct>={title:'',image_url:'',category:'gold_silver',price:0,mrp:0,owner_id:'',deal_ends_at:null,task_reward:0,task_members:5,status:'active'};
const toLocal=(iso:string|null|undefined)=>{if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};

export default function AdminBusiness(){
 const qc=useQueryClient();
 const {isAdmin,me}=useAuth();const [upPct,setUpPct]=useState(-1);
 const upImg=async(f?:File)=>{if(!f||!me)return;setErr('');if(!/^image\/(jpeg|png|webp)$/.test(f.type)){setErr('Choose a JPG, PNG or WebP image.');return;}try{setUpPct(0);const img=await compressImage(f,1200,0.85);const path=await uploadObject(img.blob,img.mime,me.id,setUpPct).promise;set('image_url',mediaUrl(path)??'');}catch(e){setErr(e instanceof Error?e.message:'Upload failed.');}finally{setUpPct(-1);}};
 const list=useQuery({queryKey:['business-admin'],queryFn:business.adminList});
 const refresh=()=>{qc.invalidateQueries({queryKey:['business-admin']});qc.invalidateQueries({queryKey:['business-hub']});};
 const live=useMutation({mutationFn:business.setLive,onSuccess:refresh});
 const review=useMutation({mutationFn:(a:{id:string;ok:boolean})=>business.review(a.id,a.ok),onSuccess:refresh});
 const del=useMutation({mutationFn:business.deleteProduct,onSuccess:refresh});
 const [form,setForm]=useState<Partial<BizProduct>|null>(null);const [err,setErr]=useState('');
 const save=useMutation({mutationFn:business.saveProduct,onSuccess:()=>{setForm(null);refresh();},onError:e=>setErr(e instanceof Error?e.message:'Could not save.')});
 const [biz,setBiz]=useState<{id:string;name:string;category:BizCategory;city:string}|null>(null);
 const saveBiz=useMutation({mutationFn:(b:{id:string;name:string;category:BizCategory;city:string})=>business.updateBusiness(b.id,b),onSuccess:()=>{setBiz(null);refresh();},onError:e=>setErr(e instanceof Error?e.message:'Could not save.')});
 const delBiz=useMutation({mutationFn:business.deleteBusiness,onSuccess:refresh});
 const d=list.data;const approved=(d?.requests??[]).filter(r=>r.business_status==='approved');
 const set=(k:keyof BizProduct,v:unknown)=>setForm(f=>({...f,[k]:v}));
 return <div className="ab">
  <div className="ab-top">
   <div className="ab-title"><span className="ab-logo"><Store size={16}/></span><div><h1>Business &amp; E-Commerce</h1><p>Approvals and products</p></div></div>
   {isAdmin&&<label className={cn('ab-switch',d?.live&&'is-on')}><input type="checkbox" checked={!!d?.live} disabled={live.isPending} onChange={e=>live.mutate(e.target.checked)}/><i/><span>{d?.live?'Live':'Coming soon'}</span></label>}
  </div>

  {isAdmin&&<>  <section className="ab-card">
   <div className="ab-head"><h2>Business requests</h2><span>{d?.requests.length??0}</span></div>
   {!d?.requests.length&&<p className="ab-empty">No business requests yet.</p>}
   <div className="ab-list">{d?.requests.map(r=><div key={r.id} className="ab-row"><span className="ab-av">{(r.business_name||'?').slice(0,1).toUpperCase()}</span>
    <div className="ab-main"><b>{r.business_name}</b><span>@{r.username} · {CATS.find(c=>c.value===r.business_category)?.label??'—'} · {r.business_city||'—'}</span></div>
    <span className={cn('ab-pill','is-'+r.business_status)}>{r.business_status}</span>
    {r.business_status!=='approved'&&<button type="button" className="ab-btn ok" onClick={()=>review.mutate({id:r.id,ok:true})}><Check size={13}/>Approve</button>}
    {r.business_status!=='rejected'&&<button type="button" className="ab-btn" onClick={()=>review.mutate({id:r.id,ok:false})}><X size={13}/>{r.business_status==='approved'?'Revoke':'Reject'}</button>}
    <button type="button" aria-label="Edit business" className="ab-icon" onClick={()=>{setErr('');setBiz({id:r.id,name:r.business_name,category:(r.business_category??'gold_silver') as BizCategory,city:r.business_city??''});}}><Pencil size={13}/></button>
    <button type="button" aria-label="Delete business" className="ab-icon ab-danger" onClick={()=>{if(confirm(`Delete business "${r.business_name}"? The account becomes personal and its products are removed.`))delBiz.mutate(r.id);}}><Trash2 size={13}/></button>
    {biz?.id===r.id&&<div className="ab-form ab-inline">
     <label className="ab-f">Business name<input className="ab-in" value={biz.name} onChange={e=>setBiz({...biz,name:e.target.value})} maxLength={80}/></label>
     <label className="ab-f">Category<select className="ab-in" value={biz.category} onChange={e=>setBiz({...biz,category:e.target.value as BizCategory})}>{CATS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
     <label className="ab-f">City<input className="ab-in" value={biz.city} onChange={e=>setBiz({...biz,city:e.target.value})} maxLength={60}/></label>
     {err&&<p className="ab-err">{err}</p>}
     <div className="ab-actions"><button type="button" className="ab-btn ok" disabled={saveBiz.isPending||!biz.name.trim()} onClick={()=>saveBiz.mutate(biz)}>Save</button><button type="button" className="ab-btn" onClick={()=>setBiz(null)}>Cancel</button></div>
    </div>}
   </div>)}</div>
  </section></>}

  <section className="ab-card">
   <div className="ab-head"><h2>Products</h2><span>{d?.products.length??0}</span><button type="button" className="ab-btn ok ab-add" disabled={!approved.length} onClick={()=>{setErr('');setForm({...blank,owner_id:approved[0]?.id});}}><Plus size={13}/>Add</button></div>
   {!approved.length&&<p className="ab-empty">Approve a business first; every product is assigned to an approved business.</p>}
   {form&&<div className="ab-form">
    <label className="ab-f">Product name<input className="ab-in" value={form.title??''} onChange={e=>set('title',e.target.value)}/></label>
    <label className="ab-f">Assign to business<select className="ab-in" value={form.owner_id??''} onChange={e=>set('owner_id',e.target.value)}>{approved.map(a=><option key={a.id} value={a.id}>{a.business_name} (@{a.username})</option>)}</select></label>
    <label className="ab-f">Category<select className="ab-in" value={form.category} onChange={e=>set('category',e.target.value as BizCategory)}>{CATS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
    <div className="ab-f">Product image<div style={{display:'flex',alignItems:'center',gap:8}}>{form.image_url?<img src={form.image_url} alt="" className="ab-thumb" style={{width:56,height:56}}/>:<span className="ab-thumb" style={{width:56,height:56}}/>}<label className="ab-btn ok" style={{cursor:'pointer'}}>{upPct>=0?`Uploading ${Math.round(upPct*100)}%`:form.image_url?'Change image':'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={upPct>=0} onChange={e=>{void upImg(e.target.files?.[0]);e.target.value='';}}/></label>{form.image_url&&<button type="button" className="ab-btn" onClick={()=>set('image_url','')}>Remove</button>}</div><input className="ab-in" placeholder="or paste an https image link" value={form.image_url??''} onChange={e=>set('image_url',e.target.value)}/></div>
    <label className="ab-f">Price ₹<input className="ab-in" type="number" min={0} value={form.price??0} onChange={e=>set('price',Number(e.target.value))}/></label>
    <label className="ab-f">MRP ₹ (shows % off)<input className="ab-in" type="number" min={0} value={form.mrp??0} onChange={e=>set('mrp',Number(e.target.value))}/></label>
    <label className="ab-f">City<input className="ab-in" list="ojasss-cities" value={form.city??''} onChange={e=>set('city',e.target.value)} placeholder="e.g. Vijayawada"/><datalist id="ojasss-cities">{CITIES.map(c=><option key={c.name} value={c.name}/>)}</datalist></label>
    <label className="ab-f">Deal ends at<input className="ab-in" type="datetime-local" value={toLocal(form.deal_ends_at)} onChange={e=>set('deal_ends_at',e.target.value?new Date(e.target.value).toISOString():null)}/></label>
    <label className="ab-f">Status<select className="ab-in" value={form.status} onChange={e=>set('status',e.target.value)}><option value="active">Active</option><option value="hidden">Hidden</option></select></label>
    <label className="ab-f">Task reward ₹ (0 = no task)<input className="ab-in" type="number" min={0} value={form.task_reward??0} onChange={e=>set('task_reward',Number(e.target.value))}/></label>
    <label className="ab-f">Members to refer<input className="ab-in" type="number" min={1} max={100} value={form.task_members??5} onChange={e=>set('task_members',Number(e.target.value))}/></label>
    {err&&<p className="ab-err">{err}</p>}
    <div className="ab-actions"><button type="button" className="ab-btn ok" disabled={save.isPending||upPct>=0} onClick={()=>{setErr('');save.mutate(form);}}>Save product</button><button type="button" className="ab-btn" onClick={()=>setForm(null)}>Cancel</button></div>
   </div>}
   <div className="ab-list">{d?.products.map(p=><div key={p.id} className="ab-row">
    {p.image_url?<img src={p.image_url} alt="" className="ab-thumb"/>:<span className="ab-thumb"/>}
    <div className="ab-main"><b>{p.title}</b><span>₹{p.price} · {p.owner?.business_name} · 📍{p.city||'All cities'} · {p.status}{p.deal_ends_at&&Date.parse(p.deal_ends_at)<=Date.now()?' · ⏱ expired (hidden from users — edit the end time to re-add)':''}{p.task_reward?` · task ₹${p.task_reward}`:''}</span></div>
    <button type="button" aria-label="Edit" className="ab-icon" onClick={()=>{setErr('');setForm(p);}}><Pencil size={13}/></button>
    <button type="button" aria-label="Delete" className="ab-icon" onClick={()=>{if(confirm('Delete this product?'))del.mutate(p.id);}}><Trash2 size={13}/></button>
   </div>)}</div>
  </section>
  <OrdersQueue/>
  <TasksList/>
 </div>;
}

function OrdersQueue(){
 const qc=useQueryClient();
 const q=useQuery({queryKey:['business-orders'],queryFn:business.adminOrders,refetchInterval:20000});
 const upd=useMutation({mutationFn:(a:{id:string;status:BizOrder['status']})=>business.updateOrder(a.id,a.status,a.status==='rejected'?'Payment not found':''),onSuccess:()=>qc.invalidateQueries({queryKey:['business-orders']})});
 const list=q.data??[];const pending=list.filter(o=>o.status==='pending').length;
 return <section className="ab-card">
  <div className="ab-head"><h2>Product orders</h2><span>{pending} pending</span></div>
  {!list.length&&<p className="ab-empty">No orders yet.</p>}
  <div className="ab-list">{list.map(o=><div key={o.id} className="ab-row" style={{flexWrap:'wrap'}}>
   <span className="ab-av">₹</span>
   <div className="ab-main"><b>{o.title} · ₹{o.amount.toLocaleString('en-IN')}</b><span>@{o.username} · UTR {o.utr} · {new Date(o.created_at).toLocaleString()}</span><span>{o.name} · {o.phone} · {o.address}</span></div>
   <span className={cn('ab-pill','is-'+o.status)}>{o.status}</span>
   {o.status==='pending'&&<><button type="button" className="ab-btn ok" disabled={upd.isPending} onClick={()=>upd.mutate({id:o.id,status:'approved'})}><Check size={13}/>Approve</button><button type="button" className="ab-btn" disabled={upd.isPending} onClick={()=>upd.mutate({id:o.id,status:'rejected'})}><X size={13}/>Reject</button></>}
   {o.status==='approved'&&<button type="button" className="ab-btn ok" disabled={upd.isPending} onClick={()=>upd.mutate({id:o.id,status:'delivered'})}><Check size={13}/>Mark delivered</button>}
  </div>)}</div>
 </section>;
}

function TasksList(){
 const q=useQuery({queryKey:['business-tasks'],queryFn:business.adminTasks,refetchInterval:30000});
 const list=q.data??[];
 return <section className="ab-card">
  <div className="ab-head"><h2>Promotion tasks</h2><span>{list.filter(t=>t.status==='completed').length} completed</span></div>
  {!list.length&&<p className="ab-empty">No one has taken a task yet.</p>}
  <div className="ab-list">{list.map(t=><div key={t.id} className="ab-row">
   <span className="ab-av">🎯</span>
   <div className="ab-main"><b>@{t.username} · {t.title}</b><span>{t.progress}/{t.need} purchases · reward ₹{t.reward.toLocaleString('en-IN')}{t.buyers.length?' · buyers '+t.buyers.map(b=>'@'+b).join(', '):''}</span></div>
   <span className={cn('ab-pill','is-'+(t.status==='completed'?'approved':'pending'))}>{t.status==='completed'?'paid':'active'}</span>
  </div>)}</div>
 </section>;
}
