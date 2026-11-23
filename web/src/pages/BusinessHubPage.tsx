import {useQuery} from '@tanstack/react-query';
import './my-city.css';
import {BadgeCheck, Briefcase, ChevronRight, Clock3, Cpu, Gem, GraduationCap, Home, LayoutGrid, Link2, MapPin, Play, Recycle, Search, Shirt, ShoppingBasket, ShoppingCart, Sparkles, Store, Target, Gift, Users, UtensilsCrossed, Flame, Star, type LucideIcon} from 'lucide-react';
import {Fragment, useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {posts} from '@/api';
import {business, type BizCategory, type BizProduct, type BizTask} from '@/api/business';
import {useQueryClient} from '@tanstack/react-query';
import {Page} from '@/components/layout/AppShell';
import {Avatar} from '@/components/ui/Misc';
import {useAuth} from '@/hooks/useAuth';
import {count} from '@/lib/format';
import {mediaUrl} from '@/lib/media';
import {useSeo} from '@/lib/seo';
import {cn} from '@/lib/utils';
import './business-hub.css';
import {BuyProductSheet, orderLabel} from '@/components/BuyProductSheet';
import {BIZ_CATS} from '@/lib/businessCats';

type Tab='videos'|'products'|'tasks'|'mine';
const TABS:{value:Tab;label:string;icon:LucideIcon}[]=[{value:'videos',label:'Business Videos',icon:Play},{value:'products',label:'Products',icon:ShoppingCart},{value:'tasks',label:'Tasks & Rewards',icon:Target},{value:'mine',label:'My Business',icon:Store}];

function useNow(){const [n,setN]=useState(()=>Date.now());useEffect(()=>{const t=setInterval(()=>setN(Date.now()),1000);return()=>clearInterval(t);},[]);return n;}
const pad=(n:number)=>String(Math.max(0,n)).padStart(2,'0');
function parts(ms:number){const s=Math.max(0,Math.floor(ms/1000));return {d:Math.floor(s/86400),h:Math.floor(s%86400/3600),m:Math.floor(s%3600/60),s:s%60};}
function hms(ms:number){const p=parts(ms);return `${pad(p.d*24+p.h)}:${pad(p.m)}:${pad(p.s)}`;}
const rupee=(n:number)=>'₹'+n.toLocaleString('en-IN');

function Boxes({ms}:{ms:number}){const p=parts(ms);const u=([['D',p.d],['H',p.h],['M',p.m],['S',p.s]] as const).filter(([l,v])=>l!=='D'||v>0);return <span className="bz-boxes">{u.map(([l,v],i)=><Fragment key={l}>{i>0&&<em>:</em>}<span><b>{pad(v)}</b><i>{l}</i></span></Fragment>)}</span>;}

function SectionHead({icon:Icon,title,to,extra}:{icon:LucideIcon;title:string;to?:()=>void;extra?:React.ReactNode}){
 return <div className={"bz-head"+(extra?" has-timer":"")}><h2><span className="bz-head-ico"><Icon aria-hidden size={16} strokeWidth={2.2}/></span><span className="bz-head-t">{title}</span></h2>{extra}{to&&<button type="button" onClick={to} className="bz-see">See All<ChevronRight aria-hidden size={14}/></button>}</div>;
}

function ComingSoon(){
 return <div className="bz-soon"><span className="bz-soon-icon"><Store aria-hidden size={34} strokeWidth={1.5}/></span><h1>Business & E-Commerce</h1><p>Business profiles, products, deals and reward tasks are coming soon to OJASSS.</p><span className="bz-soon-pill"><Sparkles aria-hidden size={14}/>Coming soon</span><Link to="/" className="bz-soon-link">Back to feed</Link></div>;
}

function TaskAction({product,task,code,signedIn,onBuy}:{product:BizProduct;task?:BizTask;code:string;signedIn:boolean;onBuy:()=>void}){
 const qc=useQueryClient();const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [copied,setCopied]=useState(false);
 if(!signedIn)return <Link to="/login" className="bz-take">Sign in to take task<ChevronRight aria-hidden size={15}/></Link>;
 if(!task)return <><button type="button" className="bz-take" disabled={busy} onClick={async()=>{setBusy(true);setErr('');try{await business.takeTask(product.id);await qc.invalidateQueries({queryKey:['business-hub']});}catch(e){setErr(e instanceof Error?e.message:'Could not start task.');}finally{setBusy(false);}}}>{busy?'Starting…':'Take Task'}<ChevronRight aria-hidden size={15}/></button>{err&&<small className="bz-task-err">{err}</small>}</>;
 const link=`${location.origin}/explore?ref=${encodeURIComponent(code)}&task=${task.id}&p=${product.id}`;
 const pct=Math.min(100,Math.round(task.progress/task.need*100));
 if(task.status==='completed')return <div className="bz-task-done"><b>🎉 Task completed</b><span>{rupee(task.reward)} added to your earnings</span><Link to="/earnings" className="bz-take">View earnings<ChevronRight aria-hidden size={15}/></Link></div>;
 return <div className="bz-task-live">
  <div className="bz-prog"><i style={{width:pct+'%'}}/></div>
  <span className="bz-prog-l">{task.progress} / {task.need} purchases{task.buyers.length?' · '+task.buyers.map(b=>'@'+b).join(', '):''}</span>
  <div className="bz-share"><button type="button" className="bz-take" onClick={async()=>{const text=`Buy ${product.title} on OJASSS: ${rupee(product.price)}`;try{if(navigator.share){await navigator.share({title:product.title,text,url:link});return;}}catch{/* cancelled */}await navigator.clipboard?.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>{copied?'Link copied':'Share referral link'}<Link2 aria-hidden size={15}/></button></div>
  <small>Friends must join OJASSS with your link and buy this product. Reward is paid when {task.need} purchase{task.need>1?'s are':' is'} approved.</small>
  <button type="button" className="bz-task-buy" onClick={onBuy}>Or buy it yourself</button>
 </div>;
}

export default function BusinessHubPage(){
 useSeo({title:'Business & E-Commerce',description:'Business profiles, products, deals and reward tasks on OJASSS.',path:'/explore'});
 const {me}=useAuth();const now=useNow();
 const hub=useQuery({queryKey:['business-hub',me?.id],queryFn:business.hub});
 useEffect(()=>{const sp=new URLSearchParams(location.search);const t=sp.get('task'),p=sp.get('p');if(t&&p)try{localStorage.setItem('ojasss.bizTask',JSON.stringify({id:t,p}));}catch{/* private mode */}},[]);
 const live=hub.data?.can_view;
 const vids=useQuery({queryKey:['business-videos'],queryFn:()=>posts.trending({category:'business_promotion',kind:'video',days:30,limit:12}),enabled:!!live});
 const [myCity,setMyCity]=useState(true);
 const [cat,setCat]=useState<BizCategory|'all'>('all');const [tab,setTab]=useState<Tab>('videos');const [q,setQ]=useState('');const [pulse,setPulse]=useState('');
 const tap=(id:string)=>{setPulse(id);window.setTimeout(()=>setPulse(p=>p===id?'':p),650);};
 const match=(p:BizProduct)=>(cat==='all'||p.category===cat)&&(!q||(p.title+' '+(p.owner?.business_name??'')).toLowerCase().includes(q.toLowerCase()));
 const products=useMemo(()=>(hub.data?.products??[]).filter(p=>match(p)&&(!myCity||!p.city||p.city===me?.city)&&!(p.deal_ends_at&&Date.parse(p.deal_ends_at)<=now)),[hub.data,cat,q,now,myCity,me?.city]);
 const [buy,setBuy]=useState<BizProduct|null>(null);const orders=hub.data?.my_orders??[];// eslint-disable-line react-hooks/exhaustive-deps
 const profiles=(hub.data?.profiles??[]).filter(p=>(cat==='all'||p.business_category===cat)&&(!q||(p.business_name+p.username).toLowerCase().includes(q.toLowerCase())));
 const tasks=products.filter(p=>p.task_reward>0);
 const dealEnd=Math.max(0,...products.map(p=>p.deal_ends_at?Date.parse(p.deal_ends_at):0));
 const taskEnd=Math.max(0,...tasks.map(p=>p.deal_ends_at?Date.parse(p.deal_ends_at):0));
 const task=tasks[0];

 if(hub.isLoading)return <Page><div className="bz-loading"/></Page>;
 if(!live)return <Page><ComingSoon/></Page>;
 const meBiz=hub.data?.me;
 return <Page className="bz-page">
  {hub.data?.is_admin&&!hub.data.live&&<div className="bz-admin-note"><Sparkles aria-hidden size={14}/>Admin preview: users see "Coming soon". Go live from <Link to="/admin/business">Admin › Business</Link>.</div>}
  <header className="bz-top">
   <div className="bz-title"><span className="bz-logo"><Store aria-hidden size={26} strokeWidth={1.6}/></span><div><h1>Business &amp; E-Commerce</h1><p>Business Profiles • Products • Tasks • Earn Rewards</p></div></div>
   <label className="bz-search"><Search aria-hidden size={16} strokeWidth={1.75}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search Business, Products, Tasks..." aria-label="Search business"/></label>
  </header>
  {me?.city&&<div style={{display:"flex",gap:6,padding:"0 2px 8px",alignItems:"center"}}><button type="button" className={cn("city-chip",!myCity&&"is-on")} onClick={()=>setMyCity(false)}>🌏 All cities</button><button type="button" className={cn("city-chip",myCity&&"is-on")} onClick={()=>setMyCity(true)}>📍 {me.city}</button>{(hub.data?.coins??0)>0&&<Link to="/coins" className="city-chip" style={{marginLeft:"auto",color:"#fbbf24",display:"inline-flex",alignItems:"center"}}>🪙 {(hub.data?.coins??0).toLocaleString("en-IN")} coins</Link>}</div>}
  <nav className="bz-cats" aria-label="Business categories">
   {BIZ_CATS.map(c=><button key={c.value} type="button" aria-pressed={cat===c.value} onClick={()=>{setCat(c.value);tap('c'+c.value);}} style={{'--hue':c.hue} as React.CSSProperties} className={cn('bz-cat',cat===c.value&&'is-on',pulse==='c'+c.value&&'is-pulse')}><c.icon aria-hidden size={22} strokeWidth={1.5}/><span>{c.label}</span></button>)}
  </nav>
  <div className="bz-tabs" role="tablist">
   {TABS.map(t=><button key={t.value} role="tab" type="button" aria-selected={tab===t.value} onClick={()=>{setTab(t.value);tap('t'+t.value);}} className={cn('bz-tab',tab===t.value&&'is-on',pulse==='t'+t.value&&'is-pulse')}><t.icon aria-hidden size={16} strokeWidth={1.6}/>{t.label}</button>)}
  </div>

  {tab==='mine'?<MyBusiness hubMe={meBiz} mine={hub.data?.my_products??[]} now={now}/>:<>
  {(tab==='videos')&&<section className="bz-sec"><SectionHead icon={Flame} title="Trending Business Videos"/>
   <div className="bz-row">{(vids.data??[]).map(v=><Link key={v.id} to={`/post/${v.id}`} className="bz-vid">
    <span className="bz-vid-img" style={{backgroundImage:`url(${mediaUrl(v.thumbnail_path)??''})`}}><span className="bz-dur">{v.duration_ms?hms(v.duration_ms).slice(3):''}</span><span className="bz-play"><Play aria-hidden size={18} fill="currentColor"/></span><span className="bz-views"><Play aria-hidden size={10} fill="currentColor"/>{count(v.views_count)}</span></span>
    <span className="bz-vid-cap">{v.caption||'Business video'}</span></Link>)}
    {!vids.isLoading&&!(vids.data??[]).length&&<p className="bz-empty">No business videos yet.</p>}</div></section>}

  {(tab==='videos'||tab==='products')&&<section className="bz-sec"><SectionHead icon={Star} title="Featured Business Profiles"/>
   <div className="bz-row">{profiles.map(p=><Link key={p.id} to={`/profile/${p.username}`} className="bz-prof"><Avatar path={p.avatar_path} name={p.business_name} size={44}/><b>{p.business_name}<BadgeCheck aria-hidden size={14} className="text-sky-400"/></b><span><MapPin aria-hidden size={12}/>{p.business_city||'India'}</span><span className="bz-follow">View</span></Link>)}
    {!profiles.length&&<p className="bz-empty">No approved businesses yet.</p>}</div></section>}

  {(tab==='videos'||tab==='products')&&<section className="bz-sec"><SectionHead icon={ShoppingCart} title="Limited Time Deals – Products" extra={dealEnd>now?<span className="bz-timer"><span className="bz-timer-l"><i className="bz-live"/>Deals end in</span><Boxes ms={dealEnd-now}/></span>:null}/>
   <div className="bz-row">{products.map(p=>{const off=p.mrp>p.price?Math.round((1-p.price/p.mrp)*100):0;const ends=p.deal_ends_at?Date.parse(p.deal_ends_at)-now:0;
    return <article key={p.id} className="bz-prod bz-prod2"><div className="bz-prod-img">{p.image_url?<img src={p.image_url} alt="" loading="lazy"/>:<ShoppingBasket aria-hidden size={26} strokeWidth={1.4}/>}{off>0&&<span className="bz-off2">-{off}%</span>}{ends>0&&<span className="bz-ends2"><Clock3 aria-hidden size={10}/>{hms(ends)}</span>}</div>
     <div className="bz-prod-body"><b>{p.title}</b><span className="bz-seller"><BadgeCheck aria-hidden size={11}/>{p.owner?.business_name}</span><div className="bz-price2"><strong>{rupee(p.price)}</strong>{p.mrp>p.price&&<s>{rupee(p.mrp)}</s>}</div></div><button type="button" className="bz-buy" onClick={()=>setBuy(p)}>Pay now</button></article>;})}
    {!products.length&&<p className="bz-empty">No products yet.</p>}</div>
   {orders.length>0&&<div className="bz-orders" style={{marginTop:10}}><h3 style={{fontSize:13,fontWeight:800,margin:'0 0 2px'}}>My orders</h3>{orders.map(o=><div key={o.id} className="bz-order"><div><b>{o.title} · {rupee(o.amount)}</b><small>{orderLabel[o.status]}{o.note?' · '+o.note:''} · UTR {o.utr}</small></div><span className={'bz-ost is-'+o.status}>{o.status}</span></div>)}</div>}</section>}
  {buy&&<BuyProductSheet product={buy} upiId={hub.data?.upi_id??''} now={now} coins={hub.data?.coins??0} onClose={()=>setBuy(null)}/>}

  {(tab==='videos'||tab==='tasks')&&<section className="bz-sec"><SectionHead icon={Target} title="Product Promotion Task – Earn Rewards" extra={taskEnd>now?<span className="bz-timer gold"><span className="bz-timer-l"><i className="bz-live"/>Task ends in</span><Boxes ms={taskEnd-now}/></span>:null}/>
   {(tab==='tasks'?tasks:task?[task]:[]).map(t=><div key={t.id} className="bz-task">
    <div className="bz-task-prod">{t.image_url?<img src={t.image_url} alt=""/>:<ShoppingBasket aria-hidden size={28}/>}<div><b>{t.title}</b><strong>{rupee(t.price)}</strong></div></div>
    <div className="bz-task-steps"><span className="bz-your">Your Task</span><p><Users aria-hidden size={15}/>Refer {t.task_members} Members</p><p><Briefcase aria-hidden size={15}/>They must Join OJASSS</p><p><ShoppingCart aria-hidden size={15}/>Purchase this Product</p></div>
    <div className="bz-task-reward"><Gift aria-hidden size={26} strokeWidth={1.5}/><span>Task Reward</span><strong>{rupee(t.task_reward)}</strong><small>(on successful {t.task_members} purchases)</small><TaskAction product={t} task={(hub.data?.my_tasks??[]).find(x=>x.product_id===t.id)} code={hub.data?.referral_code??''} signedIn={!!me} onBuy={()=>setBuy(t)}/></div>
   </div>)}
   {!tasks.length&&<p className="bz-empty">No reward tasks yet.</p>}
   <div className="bz-how"><span className="bz-how-btn">How It Works?</span>{[[ShoppingCart,'Take Task'],[Link2,'Share Referral Link'],[Users,'Members Join & Buy'],[Gift,'Get Reward']].map(([I,l],i)=>{const Icon=I as LucideIcon;return <span key={i} className="bz-step"><em>{i+1}</em><Icon aria-hidden size={18} strokeWidth={1.6}/>{l as string}</span>;})}</div>
  </section>}
  </>}
 </Page>;
}

function MyBusiness({hubMe,mine,now}:{hubMe:import('@/api/business').BizMe|null|undefined;mine:BizProduct[];now:number}){
 if(!hubMe)return <div className="bz-card-msg"><Store aria-hidden size={28}/><p>Sign in to manage your business.</p><Link to="/login?next=/explore" className="bz-take">Sign in</Link></div>;
 if(hubMe.account_type!=='business')return <div className="bz-card-msg"><Store aria-hidden size={28}/><p>Your account is a personal account. Switch to a business account to sell products.</p><Link to="/account-type" className="bz-take">Become a business</Link></div>;
 if(hubMe.business_status!=='approved')return <div className="bz-card-msg"><Clock3 aria-hidden size={28}/><p><b>{hubMe.business_name}</b> is {hubMe.business_status==='rejected'?'not approved. Contact support to try again.':'waiting for admin approval. Your products appear here once approved.'}</p></div>;
 return <section className="bz-sec"><SectionHead icon={Store} title={hubMe.business_name??'My Business'}/>
  <div className="bz-row">{mine.map(p=>{const off=p.mrp>p.price?Math.round((1-p.price/p.mrp)*100):0;const ends=p.deal_ends_at?Date.parse(p.deal_ends_at)-now:0;return <article key={p.id} className="bz-prod bz-prod2"><div className="bz-prod-img">{p.image_url?<img src={p.image_url} alt="" loading="lazy"/>:<ShoppingBasket aria-hidden size={30}/>}{off>0&&<span className="bz-off2">-{off}%</span>}{ends>0&&<span className="bz-ends2"><Clock3 aria-hidden size={10}/>{hms(ends)}</span>}</div><div className="bz-prod-body"><b>{p.title}</b><strong>{rupee(p.price)}{p.mrp>p.price&&<> <s>{rupee(p.mrp)}</s></>}</strong>{ends>0&&<span className="bz-seller">Limited deal</span>}<span className="bz-seller">{p.status==='hidden'?'Hidden':'Live'}{p.deal_ends_at&&Date.parse(p.deal_ends_at)>now?' · deal on':''}</span></div></article>;})}
  {!mine.length&&<p className="bz-empty">No products assigned yet. The OJASSS team adds products to your business.</p>}</div></section>;
}
