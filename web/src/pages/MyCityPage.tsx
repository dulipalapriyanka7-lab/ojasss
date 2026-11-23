import {useQueryClient} from '@tanstack/react-query';
import {ArrowRight, Check, Crosshair, MapPin, Search} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {rpc} from '@/api/client';
import {meKey, useAuth} from '@/hooks/useAuth';
import {CITIES, nearestCity} from '@/lib/cities';
import {useSeo} from '@/lib/seo';
import {cn} from '@/lib/utils';
import './my-city.css';

/** Shown after category selection: pick your city for local videos, news, jobs and businesses. */
export default function MyCityPage(){
 useSeo({title:'My City',noindex:true});
 const {me}=useAuth();const nav=useNavigate();const qc=useQueryClient();
 const [city,setCity]=useState<string>(me?.city??'');const [q,setQ]=useState('');
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [locating,setLocating]=useState(false);const [detected,setDetected]=useState('');
 const list=useMemo(()=>{const t=q.trim().toLowerCase();return t?CITIES.filter(c=>c.name.toLowerCase().includes(t)):CITIES.filter(c=>c.popular);},[q]);
 const custom=q.trim().length>=2&&!CITIES.some(c=>c.name.toLowerCase()===q.trim().toLowerCase())?q.trim():'';
 const locate=(auto=false)=>{if(!navigator.geolocation){if(!auto)setErr('Location is not available on this device.');return;}setLocating(true);setErr('');
  navigator.geolocation.getCurrentPosition(p=>{setLocating(false);const c=nearestCity(p.coords.latitude,p.coords.longitude);setCity(c.name);setDetected(c.name);setQ('');},()=>{setLocating(false);if(!auto)setErr('Allow location access, or pick your city below.');},{timeout:10000,maximumAge:600000});};
 // Detect automatically for new users; they can still tap any other city to change it.
 useEffect(()=>{if(!me?.city)locate(true);},[]);// eslint-disable-line react-hooks/exhaustive-deps
 const save=async()=>{if(!city)return;setBusy(true);setErr('');try{await rpc('city_set',{p_city:city});await qc.invalidateQueries({queryKey:meKey});nav('/',{replace:true});}catch(e){setErr(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}};
 const skip=()=>{try{sessionStorage.setItem('ojasss.citySkip','1');}catch{/* storage */}nav('/',{replace:true});};
 return <main className="mc">
  <div className="mc-glow" aria-hidden="true"/>
  <header className="mc-head">
   <div className="mc-brand"><img src="/brand/mark.png" width="44" height="44" alt=""/><div><b>OJASSS</b><small>THE INDIAN MASS POWER APP</small></div></div>
   <h1><MapPin aria-hidden size={34} className="mc-pin"/>My <em>City</em></h1>
   <p>Choose your city to see local videos, news, jobs, businesses and more.</p>
  </header>
  <label className="mc-search"><Search aria-hidden size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search your city…" aria-label="Search your city"/></label>
  {detected&&<p className="mc-detected"><MapPin size={14}/>{city===detected?<>Detected: <b>{detected}</b> · tap another city to change</>:<>Changed from {detected} to <b>{city}</b></>}</p>}
  <div className="mc-label"><Crosshair aria-hidden size={16}/>{q?'Search results':'Nearby & Popular Cities'}</div>
  <div className="mc-grid">
   {list.map(c=><button type="button" key={c.name} className={cn('mc-card',city===c.name&&'is-on')} style={{background:c.bg}} onClick={()=>setCity(c.name)} aria-pressed={city===c.name}>
    {c.img?<img src={c.img} alt="" loading="lazy"/>:<span className="mc-icon" aria-hidden="true">{c.icon}</span>}<b>{c.name}</b>{city===c.name&&<i className="mc-tick"><Check size={13} strokeWidth={3}/></i>}
   </button>)}
   {custom&&<button type="button" className={cn('mc-card mc-custom',city.toLowerCase()===custom.toLowerCase()&&'is-on')} onClick={()=>setCity(custom.replace(/\b\w/g,s=>s.toUpperCase()))}><span className="mc-icon" aria-hidden="true">📍</span><b>{custom}</b><small>Use this city</small></button>}
  </div>
  {city&&!list.some(c=>c.name===city)&&!custom&&<p className="mc-picked"><MapPin size={13}/>Selected: <b>{city}</b></p>}
  <button type="button" className="mc-loc" onClick={()=>locate()} disabled={locating}><MapPin aria-hidden size={17}/>{locating?'Finding your city…':'Use My Current Location'}</button>
  {err&&<p className="mc-err">{err}</p>}
  <button type="button" className="mc-go" disabled={!city||busy} onClick={()=>void save()}>{busy?'Saving…':'Continue to OJASSS'}<ArrowRight aria-hidden size={19}/></button>
  <p className="mc-note">You can change your city anytime from Profile Settings. <button type="button" onClick={skip}>Skip for now</button></p>
 </main>;
}
