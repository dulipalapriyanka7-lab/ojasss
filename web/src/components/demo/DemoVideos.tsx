import {useQuery} from '@tanstack/react-query';
import {ChevronLeft, ChevronRight, Clapperboard, Play, Video, X} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {demo, type DemoVideo} from '@/api/demo';
import {useCategories} from '@/hooks/useCategories';
import {mediaUrl} from '@/lib/media';
import {cn} from '@/lib/utils';
import './demo-videos.css';

type Lang='en'|'te';
const LANG_KEY='ojasss.demoLang';
const readLang=():Lang=>{try{return localStorage.getItem(LANG_KEY)==='te'?'te':'en';}catch{return 'en';}};
export const demoCatLabel=(id:string,cats:{value:string;label:string}[])=>id==='general'?'How to use OJASSS':cats.find(c=>c.value===id)?.label??id.replace(/_/g,' ');
const dur=(s:number)=>s?`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:'';

/** "How to use OJASSS" banner with Telugu / English choice. Opens the demo player. */
export function DemoBanner(){
 const [lang,setLang]=useState<Lang>(readLang);const [open,setOpen]=useState(false);
 const pick=(l:Lang)=>{setLang(l);try{localStorage.setItem(LANG_KEY,l);}catch{/* private mode */}};
 return <>
  <section className="dv-banner">
   <div className="dv-phone" aria-hidden="true"><span><Play size={18} fill="currentColor"/></span><i/></div>
   <div className="dv-copy">
    <div className="dv-tags"><b>New to OJASSS?</b><em><Video size={11}/>DEMO</em></div>
    <h2>How to use the OJASSS app</h2>
    <p>Short videos for every category: explore, join challenges and earn rewards.</p>
    <div className="dv-actions">
     <button type="button" className="dv-watch" onClick={()=>setOpen(true)}><Play size={13} fill="currentColor"/>Watch demo videos</button>
     <div className="dv-lang" role="group" aria-label="Demo language">
      <button type="button" aria-pressed={lang==='te'} onClick={()=>pick('te')}>తెలుగు</button>
      <button type="button" aria-pressed={lang==='en'} onClick={()=>pick('en')}>English</button>
     </div>
    </div>
   </div>
  </section>
  {open&&<DemoPlayer lang={lang} setLang={pick} onClose={()=>setOpen(false)}/>}
 </>;
}

/** Full-screen demo player: video on top, category chips, then the category's video list. */
export function DemoPlayer({lang,setLang,onClose,initialCategory}:{lang:Lang;setLang:(l:Lang)=>void;onClose:()=>void;initialCategory?:string}){
 const q=useQuery({queryKey:['demo-videos'],queryFn:demo.list,staleTime:60_000});
 const cats=useCategories();
 const all=q.data??[];
 const inLang=useMemo(()=>{const l=all.filter(v=>v.lang===lang);return l.length?l:all;},[all,lang]);
 const groups=useMemo(()=>[...new Set(inLang.map(v=>v.category))].sort((a,b)=>a==='general'?-1:b==='general'?1:0),[inLang]);
 const [cat,setCat]=useState<string>(initialCategory??'all');
 const list=cat==='all'?inLang:inLang.filter(v=>v.category===cat);
 const [cur,setCur]=useState<DemoVideo|null>(null);
 const playing=cur&&list.some(v=>v.id===cur.id)?cur:list[0]??null;
 const idx=playing?list.findIndex(v=>v.id===playing.id):-1;
 const vid=useRef<HTMLVideoElement>(null);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);document.body.style.overflow='hidden';return()=>{window.removeEventListener('keydown',k);document.body.style.overflow='';};},[onClose]);
 return createPortal(<div className="dv-player" role="dialog" aria-modal="true" aria-label="Demo videos">
  <header className="dv-top">
   <button type="button" className="dv-x" aria-label="Close demo videos" onClick={onClose}><X size={18}/></button>
   <div><b>Demo videos</b><small>{playing?demoCatLabel(playing.category,cats):'OJASSS'}</small></div>
   <div className="dv-lang sm" role="group" aria-label="Demo language"><button type="button" aria-pressed={lang==='te'} onClick={()=>setLang('te')}>తె</button><button type="button" aria-pressed={lang==='en'} onClick={()=>setLang('en')}>EN</button></div>
  </header>
  <div className="dv-stage">
   {playing?<video key={playing.id} ref={vid} src={mediaUrl(playing.media_path)??undefined} poster={mediaUrl(playing.thumbnail_path)??undefined} controls autoPlay playsInline preload="auto" onEnded={()=>{if(idx>=0&&idx<list.length-1)setCur(list[idx+1]);}}/>
    :<div className="dv-empty">{q.isLoading?<span className="dv-spin"/>:<><Clapperboard size={30}/><b>Demo videos are coming soon</b><span>Check back shortly.</span></>}</div>}
   {playing&&list.length>1&&<><button type="button" className="dv-nav l" aria-label="Previous video" disabled={idx<=0} onClick={()=>setCur(list[idx-1])}><ChevronLeft size={20}/></button><button type="button" className="dv-nav r" aria-label="Next video" disabled={idx>=list.length-1} onClick={()=>setCur(list[idx+1])}><ChevronRight size={20}/></button></>}
  </div>
  {playing&&<div className="dv-now"><b>{playing.title}</b><span>{idx+1} / {list.length}{playing.duration?` · ${dur(playing.duration)}`:''}</span></div>}
  {groups.length>0&&<nav className="dv-chips" aria-label="Demo categories">
   <button type="button" aria-pressed={cat==='all'} onClick={()=>setCat('all')}>All<i>{inLang.length}</i></button>
   {groups.map(g=><button type="button" key={g} aria-pressed={cat===g} onClick={()=>setCat(g)}>{demoCatLabel(g,cats)}<i>{inLang.filter(v=>v.category===g).length}</i></button>)}
  </nav>}
  <ul className="dv-list">{list.map((v,i)=><li key={v.id}><button type="button" className={cn(playing?.id===v.id&&'is-on')} onClick={()=>setCur(v)}>
   <span className="dv-thumb">{v.thumbnail_path?<img src={mediaUrl(v.thumbnail_path)??''} alt="" loading="lazy"/>:<video src={(mediaUrl(v.media_path)??'')+'#t=0.5'} preload="metadata" muted playsInline/>}<em>{playing?.id===v.id?<i className="dv-eq"><s/><s/><s/></i>:<Play size={12} fill="currentColor"/>}</em>{v.duration>0&&<small>{dur(v.duration)}</small>}</span>
   <span className="dv-meta"><b>{i+1}. {v.title}</b><small>{demoCatLabel(v.category,cats)} · {v.lang==='te'?'తెలుగు':'English'}</small></span>
  </button></li>)}</ul>
 </div>,document.body);
}
