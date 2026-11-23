import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Armchair, ArrowLeft, ArrowRight, CloudUpload, Info, BadgeCheck, Bell, Calendar, Check, Clapperboard, Clock3, Coins, Compass, Copy, Drama, Home, IndianRupee, Laugh, LayoutGrid, MapPin, MicVocal, Music, Music2, Newspaper, PartyPopper, Plus, Search, ShieldCheck, ShoppingCart, Tag, Theater, Ticket as TicketIcon, Trophy, Upload, Wine, X, Sparkles, CupSoda, FerrisWheel, ChevronRight, type LucideIcon} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {coins} from '@/api/coins';
import {ORDER_LABEL, SOURCE_LABEL, STATUS_LABEL, TICKET_CATS, tickets, type Ticket, type TicketCat, type TicketSource} from '@/api/tickets';
import {uploadObject} from '@/api/upload';
import {useAuth} from '@/hooks/useAuth';
import {compressImage} from '@/lib/media';
import {useSeo} from '@/lib/seo';
import {cn} from '@/lib/utils';
import './tickets.css';
import './tickets-sell.css';

const rupee=(n:number)=>'₹'+n.toLocaleString('en-IN');
const when=(iso:string)=>new Date(iso).toLocaleString('en-IN',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
type Tab='mine'|'buy'|'listings';

const CAT_ICON:Record<TicketCat,LucideIcon>={movies:Clapperboard,events:Music,shows:Drama,sports:Trophy,concerts:MicVocal,theatre:Theater,comedy:Laugh,music:Music2,festivals:PartyPopper,pops:Sparkles,drinks:CupSoda,amusement:FerrisWheel};
const ACCENT:Record<TicketCat,string>={movies:'#E53935',events:'#8B5CF6',shows:'#EC4899',sports:'#0284C7',concerts:'#9333EA',theatre:'#9F1239',comedy:'#D97706',music:'#0891B2',festivals:'#DB2777',pops:'#7C3AED',drinks:'#15803D',amusement:'#4338CA'};
const CAT_SUB:Record<TicketCat,string>={movies:'Latest Releases',events:'Live & Special',shows:'Stage & Live',sports:'Live Matches',concerts:'Music & Live',theatre:'Plays & Performances',comedy:'Stand-up & Live',music:'Albums & Gigs',festivals:'Cultural & Seasonal',pops:'Trending & Popular',drinks:'Beverages & Refreshments',amusement:'Rides, Fun & More'};
const CAT_NEW:Partial<Record<TicketCat,true>>={pops:true,drinks:true,amusement:true};
function CatIcon({c,size=20}:{c:TicketCat;size?:number}){const I=CAT_ICON[c]??TicketIcon;return <I aria-hidden size={size}/>;}

function Wallet(){
 const {me}=useAuth();const q=useQuery({queryKey:['coins'],queryFn:coins.wallet,enabled:!!me});
 if(!me)return <Link to="/login?next=/tickets" className="tk-wallet">Sign in</Link>;
 return <Link to="/coins" className="tk-wallet" aria-label="Game coin wallet"><Coins size={15}/>{q.data?(q.data.coins).toLocaleString('en-IN'):'…'}</Link>;
}

function Top({title,onBack,extra}:{title?:string;onBack?:()=>void;extra?:React.ReactNode}){
 return <header className="tk-top">
  {onBack&&<button type="button" className="tk-icon" aria-label="Back" onClick={onBack}><ArrowLeft size={18}/></button>}
  <Link to="/" className="tk-brand" aria-label="OJASSS home"><img src="/brand/mark.png" width="30" height="30" alt=""/><b>OJASSS</b></Link>
  {title&&<h1>{title}</h1>}
  <span className="tk-grow"/>{extra}
  {!title&&<Link to="/notifications" className="tk-icon tk-round" aria-label="Notifications"><Bell size={17}/></Link>}
  <Wallet/>
 </header>;
}

function Poster({t}:{t:Pick<Ticket,'category'|'title'>&{poster?:string}}){
 if(t.poster)return <span className="tk-poster tk-poster-img" aria-hidden="true"><img src={t.poster} alt="" loading="lazy"/></span>;
 return <span className={'tk-poster tk-c-'+t.category} aria-hidden="true"><CatIcon c={t.category} size={26}/><small>{t.title.slice(0,22)}</small></span>;
}

function TicketCard({t,children,side}:{t:Ticket;children?:React.ReactNode;side?:React.ReactNode}){
 return <article className="tk-card">
  <Poster t={t}/>
  <div className="tk-card-body">
   <b className="tk-ttl">{t.title}</b>
   <p><MapPin size={12}/>{t.venue}, {t.city}</p>
   <p><Calendar size={12}/>{when(t.event_at)}</p>
   <p><TicketIcon size={12}/>{t.quantity} Ticket{t.quantity>1?'s':''} <span className="tk-seat">({t.seats})</span></p>
   {t.reason&&<p className="tk-reason">{t.reason}</p>}
   {children}
  </div>
  {side&&<div className="tk-side">{side}</div>}
 </article>;
}
function PriceSide({t}:{t:Ticket}){
 return <><strong className="tk-big-price">{rupee(t.price)}</strong>{t.quantity>1&&<small>({rupee(Math.round(t.price/t.quantity))} per ticket)</small>}
  <span className={'tk-st tk-st-'+t.status}><i/>{t.status==='listed'?'On Sale':STATUS_LABEL[t.status]}</span>
  {t.status==='listed'&&(t.verified?<em className="tk-ver"><BadgeCheck size={11}/>Verified</em>:<em className="tk-unver">Seller details</em>)}</>;
}

const NAV=[{to:'/',label:'Home',icon:Home},{to:'/discover',label:'Posts',icon:Newspaper},{to:'/tickets',label:'Tickets',icon:TicketIcon},{to:'/leaderboard',label:'Leaderboard',icon:Trophy},{to:'/upload',label:'Add Video',icon:Plus}];
const SLIDES=[{h:'Missed Your Show?',s:'Don’t Lose Your Money!',p:'Resell your unused tickets here safely and let someone else enjoy the show.'},{h:'Buy for Less',s:'Real seats, lower prices',p:'Every listing is reviewed by our team before it goes on sale.'},{h:'Pay Safely',s:'Your money is protected',p:'Pay OJASSS by UPI. Sellers are paid only after the ticket is transferred.'}];

export default function TicketsPage(){
 useSeo({title:'Tickets',noindex:false});
 const [params,setParams]=useSearchParams();const {me}=useAuth();const nav=useNavigate();
 const tab=(params.get('tab') as Tab)||(me?'mine':'buy');const selling=params.get('sell')==='1';
 const [cat,setCat]=useState<TicketCat|''>('');const [q,setQ]=useState('');const [city,setCity]=useState('');const [maxPrice,setMaxPrice]=useState('');const [qty,setQty]=useState(0);
 const market=useQuery({queryKey:['tickets-market',cat,city,maxPrice,qty],queryFn:()=>tickets.market({category:cat,city,maxPrice:parseInt(maxPrice,10)||0,quantity:qty})});
 const mine=useQuery({queryKey:['tickets-mine'],queryFn:tickets.mine,enabled:!!me});
 const [buy,setBuy]=useState<Ticket|null>(null);const [slide,setSlide]=useState(0);
 useEffect(()=>{const i=setInterval(()=>setSlide(s=>(s+1)%SLIDES.length),5000);return()=>clearInterval(i);},[]);
 const listings=useMemo(()=>{const s=q.trim().toLowerCase();return (market.data?.listings??[]).filter(t=>!s||(t.title+' '+t.venue).toLowerCase().includes(s));},[market.data,q]);
 const go=(t:Tab)=>{if(t!=='buy'&&!me){nav('/login?next=/tickets');return;}setParams({tab:t},{replace:true});};
 const sell=()=>me?setParams({sell:'1'}):nav('/login?next='+encodeURIComponent('/tickets?sell=1'));
 const pickCat=(c:TicketCat|'')=>{setCat(c);setParams({tab:'buy'},{replace:true});};
 const active=(mine.data?.listings??[]).filter(t=>['listed','pending_review','reserved'].includes(t.status));
 const sl=SLIDES[slide];
 if(selling)return <SellTicket onDone={()=>setParams({tab:'listings'},{replace:true})}/>;
 return <main className="tk">
  <Top/>
  <Link to="/premiere" className="tk-premiere"><img src="/shows/muta-mestri.jpg" alt=""/><span><em>NEW · Premium Premiere</em><b>Muta Mestri</b><small>Alankar 4K Dolby, Vijayawada · Book seats</small></span><i>Book</i></Link>
  <nav className="tk-nav" aria-label="Sections">{NAV.map(n=><Link key={n.to} to={n.to} className={cn(n.to==='/tickets'&&'is-tickets')} aria-current={n.to==='/tickets'?'page':undefined}><n.icon size={16}/>{n.label}</Link>)}</nav>
  <nav className="tk-chips" aria-label="Event categories">
   <button type="button" aria-pressed={cat===''} className={cn(cat===''&&'is-on')} onClick={()=>setCat('')}><LayoutGrid size={19}/>All</button>
   {TICKET_CATS.slice(0,9).map(c=><button type="button" key={c.value} aria-pressed={cat===c.value} className={cn(cat===c.value&&'is-on')} onClick={()=>pickCat(c.value)}><CatIcon c={c.value} size={19}/>{c.label}</button>)}
   <Link to="/tickets/pubs" className="tk-pubchip"><Wine size={19} className="tk-clink"/>Pub Events<em>NEW</em></Link>
  </nav>
  <section className="tk-hero" onClick={sell} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')sell();}} aria-label="Sell your ticket">
   <div className="tk-seats" aria-hidden="true"/>
   <div className="tk-hero-txt"><h2>{sl.h}</h2><h3>{sl.s}</h3><p>{sl.p}</p></div>
   <span className="tk-redticket" aria-hidden="true"><i>ADMIT</i><b>SELL<br/>YOUR<br/>TICKET</b><i>OJASSS</i></span>
   <span className="tk-dots" aria-hidden="true">{SLIDES.map((_,i)=><i key={i} className={cn(i===slide&&'is-on')}/>)}</span>
  </section>
  <div className="tk-bigcats">{TICKET_CATS.slice(0,5).map(c=><button type="button" key={c.value} className={cn(cat===c.value&&'is-on')} onClick={()=>pickCat(c.value)}><CatIcon c={c.value} size={26}/>{c.label}</button>)}</div>
  <div className="tk-tabs" role="tablist">
   {([['mine','My Tickets',TicketIcon],['buy','Buy Tickets',ShoppingCart],['listings','My Listings',Tag]] as const).map(([v,l,I])=><button key={v} type="button" role="tab" aria-selected={tab===v} className={cn(tab===v&&'is-on')} onClick={()=>go(v)}><I size={16}/>{l}</button>)}
  </div>

  {tab==='buy'&&<>
   <div className="tk-filters">
    <label className="tk-search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search event or venue" aria-label="Search tickets"/></label>
    <div className="tk-frow">
     <input value={city} onChange={e=>setCity(e.target.value)} placeholder="City" aria-label="City"/>
     <input value={maxPrice} onChange={e=>setMaxPrice(e.target.value.replace(/\D/g,''))} placeholder="Max ₹" inputMode="numeric" aria-label="Maximum price"/>
     <select value={qty} onChange={e=>setQty(+e.target.value)} aria-label="Tickets needed"><option value={0}>Any qty</option>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}+ tickets</option>)}</select>
    </div>
   </div>
   {market.isLoading&&<p className="tk-empty">Loading tickets…</p>}
   {market.data&&!listings.length&&<div className="tk-empty"><TicketIcon size={26}/><b>No tickets listed yet</b><span>Listings appear here after our team reviews them.</span></div>}
   <div className="tk-list">{listings.map(t=><TicketCard key={t.id} t={t} side={<><PriceSide t={t}/><button type="button" className="tk-gold tk-sm" disabled={t.seller===me?.username} onClick={()=>me?setBuy(t):nav('/login?next=/tickets')}>{t.seller===me?.username?'Yours':'Buy'}</button></>}/>)}</div>
  </>}

  {tab==='mine'&&<>
   <div className="tk-sec"><h2><TicketIcon size={20}/>My Purchased Tickets</h2><button type="button" onClick={sell}>Sell a Ticket <ArrowRight size={15}/></button></div>
   {mine.data&&!mine.data.orders.length&&<div className="tk-card tk-emptycard"><span>Tickets you buy on OJASSS show here. Booked somewhere else and can’t go?</span><button type="button" className="tk-outline" onClick={sell}><TicketIcon size={15}/>Sell Now</button></div>}
   <div className="tk-list">{mine.data?.orders.map(o=>o.ticket&&<TicketCard key={o.id} t={o.ticket} side={o.status==='transferred'?<><span className="tk-cant">Can’t Attend?</span><button type="button" className="tk-outline" onClick={sell}><TicketIcon size={15}/>Sell Now</button></>:<span className={'tk-st tk-o-'+o.status}><i/>{ORDER_LABEL[o.status]}</span>}/>)}</div>
   <div className="tk-sec"><h2><Tag size={20}/>My Active Listings</h2><button type="button" onClick={()=>go('listings')}>View All <ArrowRight size={15}/></button></div>
   {mine.data&&!active.length&&<p className="tk-empty tk-left">No active listings.</p>}
   <div className="tk-list">{active.slice(0,3).map(t=><ListingCard key={t.id} t={t}/>)}</div>
   <div className="tk-sec"><h2><Compass size={20}/>Explore Tickets</h2><button type="button" onClick={()=>pickCat('')}>Browse All <ArrowRight size={15}/></button></div>
   <div className="tx-grid">{TICKET_CATS.map(c=><button type="button" key={c.value} className="tx-card" style={{'--ac':ACCENT[c.value]} as React.CSSProperties} onClick={()=>pickCat(c.value)}>
     <img src={'/assets/tickets/categories/ref/'+c.value+'.jpg'} alt="" loading="lazy"/>
     <span className="tx-txt"><b>{c.label}{CAT_NEW[c.value]&&c.value!=='amusement'&&<em className="tx-new">NEW</em>}</b><small>{CAT_SUB[c.value]}</small></span><i className="tx-go"><ChevronRight size={14}/></i>
    </button>)}
    <Link to="/tickets/pubs" className="tx-pub">
     <img className="tx-pub-bg" src="/assets/tickets/categories/ref/pub-bar.jpg" alt=""/><img className="tx-pub-mugs" src="/assets/tickets/categories/ref/pub-mugs.jpg" alt=""/>
     <span className="tx-txt"><b>Pub Events<em>NEW</em></b><small>Live Music • DJ Nights • Stand-up • Bar Menu</small></span><i className="tx-go"><ChevronRight size={16}/></i>
    </Link>
   </div>
  </>}

  {tab==='listings'&&<>
   <div className="tk-sec"><h2><Tag size={20}/>My Listings</h2><button type="button" onClick={sell}>Sell a Ticket <ArrowRight size={15}/></button></div>
   {mine.data&&!mine.data.listings.length&&<div className="tk-empty"><TicketIcon size={26}/><b>No listings yet</b></div>}
   <div className="tk-list">{mine.data?.listings.map(t=><ListingCard key={t.id} t={t}/>)}</div>
  </>}
  {buy&&<BuySheet t={buy} upi={market.data?.upi_id??''} onClose={()=>setBuy(null)}/>}
 </main>;
}

const LSTEPS=[['pending_review','Review'],['listed','On sale'],['reserved','Reserved'],['sold','Sold']] as const;
/** Premium listing card; readOnly shows it to admins with the seller and booking source. */
export function ListingCard({t,readOnly=false}:{t:Ticket;readOnly?:boolean}){
 const qc=useQueryClient();const [edit,setEdit]=useState(false);const [price,setPrice]=useState(String(t.price));const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const editable=!readOnly&&(t.status==='pending_review'||t.status==='listed');
 const closed=t.status==='rejected'||t.status==='cancelled'||t.status==='expired';
 const at=LSTEPS.findIndex(([k])=>k===t.status);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setErr('');try{await fn();setEdit(false);void qc.invalidateQueries({queryKey:['tickets-mine']});void qc.invalidateQueries({queryKey:['tickets-market']});}catch(e){setErr(e instanceof Error?e.message:'Failed.');}finally{setBusy(false);}};
 return <article className={cn('ls',closed&&'is-closed')}>
  <div className="ls-main">
   <Poster t={t}/>
   <div className="ls-body">
    <b className="ls-title">{t.title}</b>
    <p><MapPin size={11}/>{t.venue}, {t.city}</p>
    <p><Calendar size={11}/>{when(t.event_at)}</p>
    <p><TicketIcon size={11}/>{t.quantity} × <span>{t.seats}</span></p>
    {readOnly&&<p className="ls-who">@{t.seller} · {SOURCE_LABEL[t.source]}{t.verified?" · ✓ Verified":""}</p>}
   </div>
   <div className="ls-side">
    <strong>{rupee(t.price)}</strong>
    {t.original_price>t.price&&<s>{rupee(t.original_price)}</s>}
    <span className={'ls-st tk-st-'+t.status}><i/>{t.status==='listed'?'On Sale':STATUS_LABEL[t.status]}</span>
   </div>
  </div>
  {!closed&&<ol className="ls-track" aria-label="Listing progress">{LSTEPS.map(([k,l],i)=><li key={k} className={cn(i<=at&&'is-done',i===at&&'is-now')}><i/>{l}</li>)}</ol>}
  {t.reason&&<p className="ls-note is-bad">{t.reason}</p>}
  {t.status==='reserved'&&<p className="ls-note">A buyer has paid. Our team will contact you to arrange the transfer.</p>}
  {editable&&(edit
   ?<div className="ls-actions"><span className="ls-rs"><i>₹</i><input value={price} onChange={e=>setPrice(e.target.value.replace(/\D/g,''))} inputMode="numeric" aria-label="New price" autoFocus/></span><button type="button" className="ls-btn is-gold" disabled={busy} onClick={()=>void run(()=>tickets.update(t.id,'price',parseInt(price,10)||0))}>Save</button><button type="button" className="ls-btn" onClick={()=>setEdit(false)}>Close</button></div>
   :<div className="ls-actions"><button type="button" className="ls-btn" onClick={()=>setEdit(true)}><Tag size={12}/>Edit price</button><button type="button" className="ls-btn is-danger" disabled={busy} onClick={()=>{if(confirm('Cancel this listing?'))void run(()=>tickets.update(t.id,'cancel'));}}><X size={12}/>Cancel</button></div>)}
  {err&&<p className="ls-note is-bad">{err}</p>}
 </article>;
}

function BuySheet({t,upi,onClose}:{t:Ticket;upi:string;onClose:()=>void}){
 const qc=useQueryClient();const wallet=useQuery({queryKey:['coins'],queryFn:coins.wallet});const have=wallet.data?.coins??0;
 const [useCoins,setUseCoins]=useState(false);const spend=useCoins?Math.min(have,t.total):0;const rest=t.total-spend;const [utr,setUtr]=useState('');const [name,setName]=useState('');const [phone,setPhone]=useState('');
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [done,setDone]=useState(false);const [copied,setCopied]=useState(false);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[onClose]);
 const link=`upi://pay?pa=${encodeURIComponent(upi)}&pn=OJASSS&am=${rest}&cu=INR&tn=${encodeURIComponent('OJASSS ticket '+t.title.slice(0,30))}`;
 const submit=async()=>{setBusy(true);setErr('');try{await tickets.buy(t.id,rest>0?utr:'',name,phone,spend);void qc.invalidateQueries({queryKey:['coins']});setDone(true);void qc.invalidateQueries({queryKey:['tickets-market']});void qc.invalidateQueries({queryKey:['tickets-mine']});}catch(e){setErr(e instanceof Error?e.message:'Could not send.');}finally{setBusy(false);}};
 return createPortal(<div className="tk-back" onClick={onClose}><div className="tk-sheet" role="dialog" aria-modal="true" aria-label={'Buy '+t.title} onClick={e=>e.stopPropagation()}>
  <header><b>{t.title}</b><button type="button" className="tk-icon" aria-label="Close" onClick={onClose}><X size={16}/></button></header>
  {done?<div className="tk-done"><Check size={30}/><b>Payment sent for verification</b><span>The ticket is reserved for you. After we confirm your payment, our team arranges the transfer from the seller. Track it in My Tickets.</span><button type="button" className="tk-gold tk-block" onClick={onClose}>Done</button></div>:<>
   <dl className="tk-bill"><div><dt>Ticket price ({t.quantity})</dt><dd>{rupee(t.price)}</dd></div><div><dt>Platform fee</dt><dd>{rupee(t.fee)}</dd></div>{spend>0&&<div><dt>Game coins</dt><dd>−{rupee(spend)}</dd></div>}<div className="tk-total"><dt>Total to pay</dt><dd>{rupee(rest)}</dd></div></dl>
   {<label className="tk-coins"><input type="checkbox" disabled={have<=0} checked={useCoins} onChange={e=>setUseCoins(e.target.checked)}/><Coins size={15}/><span>Pay with game coins<small>{have.toLocaleString('en-IN')} available · 1 coin = ₹1</small></span>{useCoins&&<b>−{rupee(spend)}</b>}</label>}
   <p className="tk-fine"><ShieldCheck size={13}/>Pay OJASSS, not the seller. The seller is paid only after the transfer. Entry depends on the organiser accepting the transferred ticket.</p>
   {!upi&&rest>0?<p className="tk-err">Payments are not set up yet.</p>:<>
    {rest>0&&<>
    <button type="button" className="tk-upi" onClick={()=>{void navigator.clipboard?.writeText(upi);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>UPI: {upi}{copied?<Check size={12}/>:<Copy size={12}/>}</button>
    <a className="tk-gold tk-block" href={link}><IndianRupee size={15}/>Pay {rupee(rest)} with UPI app</a></>}
    <div className="tk-form">
     {rest>0&&<input value={utr} onChange={e=>setUtr(e.target.value.replace(/\s/g,'').toUpperCase())} placeholder="12-digit UTR number" inputMode="numeric" maxLength={30} aria-label="UTR"/>}
     <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" maxLength={80} aria-label="Name"/>
     <input value={phone} onChange={e=>setPhone(e.target.value.replace(/[^0-9+ ]/g,''))} placeholder="Phone for the transfer" inputMode="tel" maxLength={15} aria-label="Phone"/>
     {err&&<p className="tk-err">{err}</p>}
     <button type="button" className="tk-gold tk-block" disabled={busy||(rest>0&&utr.length<8)||!name.trim()||phone.replace(/\D/g,'').length<10} onClick={()=>void submit()}>{busy?'Sending…':rest>0?'Submit payment':`Pay ${spend} coins`}</button>
    </div></>}
  </>}
 </div></div>,document.body);
}

function SellTicket({onDone}:{onDone:()=>void}){
 const {me}=useAuth();const qc=useQueryClient();
 const [category,setCategory]=useState<TicketCat>('movies');const [source,setSource]=useState<TicketSource|''>('');
 const [title,setTitle]=useState('');const [venue,setVenue]=useState('');const [city,setCity]=useState(me?.city??'');const [date,setDate]=useState('');
 const [qty,setQty]=useState(1);const [seats,setSeats]=useState('');const [ga,setGa]=useState(false);const [ref,setRef]=useState('');
 const [orig,setOrig]=useState('');const [price,setPrice]=useState('');const [transferable,setTransferable]=useState(false);const [authorised,setAuthorised]=useState(false);
 const [file,setFile]=useState<File|null>(null);const [preview,setPreview]=useState('');const [progress,setProgress]=useState(0);
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [done,setDone]=useState(false);const [how,setHow]=useState(false);
 useEffect(()=>{if(!file){setPreview('');return;}const u=URL.createObjectURL(file);setPreview(u);return()=>URL.revokeObjectURL(u);},[file]);
 const o=parseInt(orig,10)||0,p=parseInt(price,10)||0,save=Math.max(0,o-p);
 const step=!title||!venue||!date?1:!source||!file||!o||!p?2:3;
 const pick=(f:File|undefined)=>{setErr('');if(!f)return;if(!/^image\/(jpeg|png|webp)$/.test(f.type)){setErr(f.type==='application/pdf'?'PDF is not supported yet. Take a screenshot of the e-ticket and upload it as JPG or PNG.':'Upload a JPG or PNG image.');return;}if(f.size>15*1048576){setErr('Choose an image under 15 MB.');return;}setFile(f);};
 const submit=async()=>{
  setErr('');
  if(!title.trim()||!venue.trim()||!city.trim()||!date)return setErr('Enter the event name, venue, city and date.');
  if(Date.parse(date)<=Date.now()+3600000)return setErr('This event has already started or is too close to list.');
  if(!source)return setErr('Choose where you booked the ticket.');
  if(!file)return setErr('Upload your ticket proof.');
  if(!o||!p)return setErr('Enter the original and selling price.');
  if(p>o)return setErr('Selling price cannot be more than the original price.');
  if(!transferable||!authorised)return setErr('Confirm both declarations below.');
  if(!me)return;
  setBusy(true);
  try{
   const img=await compressImage(file,1600,0.82);
   if(img.blob.size>3*1048576)throw new Error('The image is too large after compression. Crop it and try again.');
   const path=await uploadObject(img.blob,img.mime,me.id,setProgress,'receipts').promise;
   await tickets.submit({p_category:category,p_source:source,p_title:title.trim(),p_venue:venue.trim(),p_city:city.trim(),p_event_at:new Date(date).toISOString(),p_quantity:qty,p_seats:ga?'General Admission':seats.trim(),p_booking_ref:ref.trim(),p_original_price:o,p_price:p,p_transferable:transferable,p_authorised:authorised,p_proof_path:path});
   setDone(true);void qc.invalidateQueries({queryKey:['tickets-mine']});
  }catch(e){setErr(e instanceof Error?e.message:'Could not submit.');}finally{setBusy(false);}
 };
 if(done)return <main className="tk"><Top title="Sell Your Ticket" onBack={onDone}/><div className="tk-done tk-panel"><Clock3 size={30}/><b>Submitted · Pending Review</b><span>Our team checks your proof and details before the ticket is listed. You'll get a notification either way.</span><button type="button" className="tk-gold tk-block" onClick={onDone}>View my listings</button></div></main>;
 const catLabel=TICKET_CATS.find(c=>c.value===category)?.label;
 return <main className="tk tk-sell">
  <Top/>
  <div className="sl-title"><button type="button" className="sl-back" aria-label="Back" onClick={onDone}><ArrowLeft size={20}/></button><h1>Sell Your Ticket</h1><button type="button" className="sl-how" onClick={()=>setHow(v=>!v)}><Info size={14}/>How it Works?</button></div>
  {how&&<ol className="tk-howbox"><li>Enter the event and upload your booking proof.</li><li>Our team reviews it. Only tickets allowed to be transferred are listed.</li><li>A buyer pays OJASSS. We contact you to transfer the ticket, then pay you.</li></ol>}
  <ol className="sl-steps">{['Ticket Details','Verify & Price','List & Sell'].map((s,i)=><li key={s} className={cn(step>i&&'is-on',step===i+1&&'is-cur')}><span>{i+1}</span><b>{s}</b></li>)}</ol>

  <article className="sl-event">
   <Poster t={{category,title:title||'Your event'}}/>
   <div className="sl-event-body">
    <div className="sl-event-head"><b>{title||'Event name'}</b><span className="sl-badge"><CatIcon c={category} size={13}/>{catLabel}</span></div>
    <p><MapPin size={13}/>{venue||'Venue'}{city?', '+city:''}</p>
    <p><Calendar size={13}/>{date?when(new Date(date).toISOString()):'Date & time'}</p>
    <p><TicketIcon size={13}/>{qty} Ticket{qty>1?'s':''} <span>({ga?'General Admission':seats||'Seats'})</span></p>
   </div>
  </article>

  <section className="sl-box">
   <div className="sl-chiprow">{TICKET_CATS.map(c=><button type="button" key={c.value} aria-pressed={category===c.value} className={cn(category===c.value&&'is-on')} onClick={()=>setCategory(c.value)}><CatIcon c={c.value} size={13}/>{c.label}</button>)}</div>
   <input className="sl-in" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Event / movie name" maxLength={120} aria-label="Event name"/>
   <div className="sl-two"><input className="sl-in" value={venue} onChange={e=>setVenue(e.target.value)} placeholder="Cinema / venue" maxLength={120} aria-label="Venue"/><input className="sl-in" value={city} onChange={e=>setCity(e.target.value)} placeholder="City" maxLength={60} aria-label="City"/></div>
   <input className="sl-in" type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} aria-label="Event date and time"/>
  </section>

  <h2 className="sl-h"><TicketIcon size={18}/>Ticket Source <small>(Where you booked?)</small></h2>
  <div className="sl-src">{(Object.keys(SOURCE_LABEL) as TicketSource[]).map(s=><button type="button" key={s} aria-pressed={source===s} className={cn('sl-src-'+s,source===s&&'is-on')} onClick={()=>setSource(s)}>
   {s==='bookmyshow'?<span className="bms">book<i>my</i>show</span>:s==='district'?<span className="dst">district</span>:<span className="oth"><TicketIcon size={15}/>Other Platform</span>}
   {source===s&&<em><Check size={11} strokeWidth={3}/></em>}</button>)}</div>
  <input className="sl-in sl-ref" value={ref} onChange={e=>setRef(e.target.value)} placeholder="Booking ID (kept private)" maxLength={40} aria-label="Booking ID"/>

  <section className="sl-box sl-upload">
   <CloudUpload size={26} className="sl-ico"/>
   <div className="sl-up-txt"><b>Upload Ticket Proof</b><span>{file?file.name:'Add your booking confirmation (QR / Barcode / E-ticket)'}</span>{busy&&progress>0&&<span className="tk-bar"><i style={{width:`${Math.round(progress*100)}%`}}/></span>}</div>
   <label className="sl-upbtn"><Upload size={15}/>{file?'Replace':'Upload File'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={e=>pick(e.target.files?.[0])}/></label>
   {preview&&<button type="button" className="sl-thumb" onClick={()=>setFile(null)} aria-label="Remove proof"><img src={preview} alt="Ticket proof preview"/><em><Check size={10} strokeWidth={3}/></em></button>}
  </section>

  <div className="sl-two">
   <section className="sl-box sl-field"><TicketIcon size={22} className="sl-ico"/><label>Number of Tickets<select value={qty} onChange={e=>setQty(+e.target.value)}>{[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n} Ticket{n>1?'s':''}</option>)}</select></label></section>
   <section className="sl-box sl-field"><Armchair size={22} className="sl-ico"/><label>Seat Numbers<input value={ga?'General Admission':seats} disabled={ga} onChange={e=>setSeats(e.target.value)} placeholder="A12, A13" maxLength={80}/></label></section>
  </div>
  <label className="tk-check sl-ga"><input type="checkbox" checked={ga} onChange={e=>setGa(e.target.checked)}/>No seat numbers (General Admission)</label>

  <section className="sl-box sl-price">
   <IndianRupee size={24} className="sl-ico"/>
   <div className="sl-price-in">
    <label>Original Price (total)<span className="sl-rs"><i>₹</i><input value={orig} onChange={e=>setOrig(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="0" aria-label="Original total price"/></span></label>
    <label>Selling Price<span className="sl-rs"><i>₹</i><input value={price} onChange={e=>setPrice(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="0" aria-label="Selling price"/></span></label>
   </div>
   <div className="sl-sum">
    <p>Original Price: {qty>1&&o?<>{rupee(Math.round(o/qty))} × {qty} = </>:null}{rupee(o)}</p>
    <p>Your Price: <b>{rupee(p)}</b> {p>o?<span className="sl-bad">(above original)</span>:save>0?<span className="sl-save">(Save {rupee(save)} for buyers)</span>:null}</p>
    <small>Original price is seller-provided until verified.</small>
   </div>
  </section>

  <section className="sl-note"><ShieldCheck size={18}/><span>We verify your ticket before listing. You’re paid after the ticket is transferred to the buyer.</span></section>
  <label className="tk-check"><input type="checkbox" checked={transferable} onChange={e=>setTransferable(e.target.checked)}/>The organiser / booking platform allows this ticket to be transferred or resold.</label>
  <label className="tk-check"><input type="checkbox" checked={authorised} onChange={e=>setAuthorised(e.target.checked)}/>I booked this ticket, it’s unused, and I’m not listing it anywhere else.</label>
  {err&&<p className="tk-err tk-errbox">{err}</p>}
  <button type="button" className="sl-go" disabled={busy} onClick={()=>void submit()}><Tag size={20}/>{busy?(progress>0&&progress<1?`Uploading ${Math.round(progress*100)}%…`:'Submitting…'):'List for Sale'}</button>
 </main>;
}
