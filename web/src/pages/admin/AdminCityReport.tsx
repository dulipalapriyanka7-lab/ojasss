import {useQuery} from '@tanstack/react-query';
import {MapPin, Search} from 'lucide-react';
import {useState} from 'react';
import {rpc} from '@/api/client';
import './admin-business.css';
import './admin-demo.css';

type Row={city:string;users:number;videos:number;products:number;orders:number;order_amount:number};

/** Admin: members, videos, products and paid orders per city. */
export default function AdminCityReport(){
 const q=useQuery({queryKey:['city-report'],queryFn:()=>rpc<Row[]>('city_report'),refetchInterval:60000});
 const [s,setS]=useState('');
 const rows=(q.data??[]).filter(r=>r.city.toLowerCase().includes(s.toLowerCase()));
 const sum=(k:keyof Row)=>(q.data??[]).reduce((a,r)=>a+(r[k] as number),0);
 const max=Math.max(1,...rows.map(r=>r.users));
 return <div className="ab ad">
  <div className="ab-top"><div className="ab-title"><span className="ab-logo"><MapPin size={16}/></span><div><h1>City report <span className="nav-new-tag">NEW</span></h1><p>Members, videos and business activity by city</p></div></div></div>
  <div className="cr-stats">{([['Cities',(q.data??[]).filter(r=>r.city!=='Not set').length],['Members',sum('users')],['Videos',sum('videos')],['Products',sum('products')],['Paid orders',sum('orders')],['Order value','₹'+sum('order_amount').toLocaleString('en-IN')]] as const).map(([l,v])=><div key={l}><b>{v}</b><span>{l}</span></div>)}</div>
  <section className="ab-card">
   <div className="ab-head"><h2>By city</h2><span>{rows.length}</span></div>
   <label className="cr-search"><Search size={14}/><input value={s} onChange={e=>setS(e.target.value)} placeholder="Search city" aria-label="Search city"/></label>
   {q.isLoading&&<p className="ab-empty">Loading…</p>}
   <div className="cr-table" role="table">
    <div className="cr-tr cr-th" role="row"><span>City</span><span>Members</span><span>Videos</span><span>Products</span><span>Orders</span></div>
    {rows.map(r=><div key={r.city} className="cr-tr" role="row">
     <span className="cr-city"><b>📍 {r.city}</b><i style={{width:`${Math.round(r.users/max*100)}%`}}/></span>
     <span>{r.users}</span><span>{r.videos}</span><span>{r.products}</span><span>{r.orders}{r.order_amount?<small>₹{r.order_amount.toLocaleString('en-IN')}</small>:null}</span>
    </div>)}
   </div>
  </section>
 </div>;
}
