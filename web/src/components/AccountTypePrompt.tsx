import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Building2, ChevronRight, Store, User} from 'lucide-react';
import {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {business, type BizCategory} from '@/api/business';
import {Dialog} from '@/components/ui/Overlay';
import {useAuth} from '@/hooks/useAuth';
import {BIZ_CATS} from '@/lib/businessCats';
import {cn} from '@/lib/utils';
import '@/pages/business-hub.css';

function AccountTypeForm({onDone}:{onDone:()=>void}){
 const qc=useQueryClient();
 const [type,setType]=useState<'personal'|'business'|'realestate'>('personal');const nav=useNavigate();
 const [name,setName]=useState('');const [cat,setCat]=useState<BizCategory>('gold_silver');const [city,setCity]=useState('');
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const save=async()=>{setBusy(true);setErr('');try{await business.setAccountType({type,businessName:name,category:cat,city});await qc.invalidateQueries({queryKey:['business-me']});await qc.invalidateQueries({queryKey:['business-hub']});onDone();if(type==='realestate')nav('/real-estate');}catch(e){setErr(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}};
 return <div className="acct-wrap">
  <div className="acct-type">
   <button type="button" onClick={()=>setType('personal')} className={cn('acct-opt',type==='personal'&&'is-on')}><User aria-hidden size={18} strokeWidth={1.6}/><span><b>Personal</b><small>Create & earn</small></span></button>
   <button type="button" onClick={()=>setType('business')} className={cn('acct-opt',type==='business'&&'is-on')}><Store aria-hidden size={18} strokeWidth={1.6}/><span><b>Business</b><small>Sell products</small></span></button>
   <button type="button" onClick={()=>setType('realestate')} className={cn('acct-opt acct-re',type==='realestate'&&'is-on')}><Building2 aria-hidden size={18} strokeWidth={1.6}/><span><b>Real Estate <em>NEW</em></b><small>List & find homes</small></span></button>
  </div>
  {type==='business'&&<div className="acct-fields">
   <input className="acct-in" value={name} onChange={e=>setName(e.target.value)} placeholder="Business name" maxLength={80}/>
   <select className="acct-in" value={cat} onChange={e=>setCat(e.target.value as BizCategory)}>{BIZ_CATS.filter(c=>c.value!=='all').map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select>
   <input className="acct-in" value={city} onChange={e=>setCity(e.target.value)} placeholder="City (e.g. Vijayawada)" maxLength={60}/>
   <p className="acct-note">An OJASSS admin reviews business accounts. You can sell once approved.</p>
  </div>}
  {type==='realestate'&&<p className="acct-note">List houses for rent or sale, connect with buyers and tenants, and earn a reward for each verified listing.</p>}
  {err&&<p className="text-sm text-red-400">{err}</p>}
  <button type="button" disabled={busy||(type==='business'&&!name.trim())} onClick={save} className="acct-go">{busy?'Saving…':'Continue'}</button>
 </div>;
}

export function AccountTypePrompt(){
 const {me}=useAuth();
 const q=useQuery({queryKey:['business-me',me?.id],queryFn:business.me,enabled:!!me,staleTime:600_000});
 const [closed,setClosed]=useState(false);
 const open=!!me&&q.isSuccess&&!q.data.account_type&&!closed;
 return <Dialog open={open} onClose={()=>setClosed(true)} title="Account type" size="sm" className="acct-dialog"><AccountTypeForm onDone={()=>setClosed(true)}/></Dialog>;
}

export default function AccountTypePage(){
 const nav=useNavigate();
 return <div className="mx-auto w-full max-w-md px-4 py-8"><h1 className="mb-1 text-xl font-bold">Account type</h1><p className="mb-4 text-sm text-fg-3">Switch between a personal and a business account.</p><AccountTypeForm onDone={()=>nav('/explore')}/></div>;
}

export function ProfileBusinessCard(){
 const {me}=useAuth();
 const q=useQuery({queryKey:['business-me',me?.id],queryFn:business.me,enabled:!!me,staleTime:600_000});
 const d=q.data;if(!d)return null;
 const biz=d.account_type==='business';
 const status=!biz?'Personal account':d.business_status==='approved'?'Approved business':d.business_status==='rejected'?'Not approved':'Waiting for approval';
 return <Link to={biz?'/explore':'/account-type'} className={cn('pbiz',biz&&d.business_status==='approved'&&'is-ok')}>
  <span className="pbiz-ico">{biz?<Store aria-hidden size={16} strokeWidth={1.7}/>:<User aria-hidden size={16} strokeWidth={1.7}/>}</span>
  <span className="pbiz-txt"><b>{biz?d.business_name:'Personal'}</b><small>{status}</small></span>
  <span className="pbiz-go">{biz?'My Business':'Switch to Business'}<ChevronRight aria-hidden size={14}/></span>
 </Link>;
}
