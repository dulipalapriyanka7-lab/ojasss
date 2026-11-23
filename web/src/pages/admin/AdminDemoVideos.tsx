import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Eye, EyeOff, Pencil, Play, Plus, Trash2, Upload, Video} from 'lucide-react';
import {useRef, useState} from 'react';
import {demo, type DemoVideo} from '@/api/demo';
import {uploadObject} from '@/api/upload';
import {DemoPlayer, demoCatLabel} from '@/components/demo/DemoVideos';
import {useAuth} from '@/hooks/useAuth';
import {useCategories} from '@/hooks/useCategories';
import {mediaUrl, sniffFile} from '@/lib/media';
import {cn} from '@/lib/utils';
import './admin-business.css';
import './admin-demo.css';

type Form=Partial<DemoVideo>&{file?:File};
const blank:Form={title:'',category:'general',lang:'en',sort:0,active:true};
const fmt=(s:number)=>s?`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:'';
const videoDuration=(f:File)=>new Promise<number>(res=>{const v=document.createElement('video');v.preload='metadata';v.onloadedmetadata=()=>{res(Math.round(v.duration||0));URL.revokeObjectURL(v.src);};v.onerror=()=>res(0);v.src=URL.createObjectURL(f);});

/** Admin: upload how-to videos per category and language (Telugu / English). */
export default function AdminDemoVideos(){
 const qc=useQueryClient();const {me}=useAuth();const cats=useCategories();
 const q=useQuery({queryKey:['demo-admin'],queryFn:demo.adminList});
 const refresh=()=>{qc.invalidateQueries({queryKey:['demo-admin']});qc.invalidateQueries({queryKey:['demo-videos']});};
 const [form,setForm]=useState<Form|null>(null);const [err,setErr]=useState('');const [pct,setPct]=useState<number|null>(null);
 const [filter,setFilter]=useState('all');const [preview,setPreview]=useState<{lang:'en'|'te';cat:string}|null>(null);
 const fileRef=useRef<HTMLInputElement>(null);
 const del=useMutation({mutationFn:demo.remove,onSuccess:refresh});
 const toggle=useMutation({mutationFn:(v:DemoVideo)=>demo.save({id:v.id,title:v.title,category:v.category,lang:v.lang,sort:v.sort,active:!v.active}),onSuccess:refresh});
 const save=useMutation({mutationFn:async(f:Form)=>{
   if(!me)throw new Error('Sign in again.');
   let media_path=f.media_path,duration=f.duration;
   if(f.file){
    const mime=await sniffFile(f.file);
    if(!mime||!mime.startsWith('video/'))throw new Error('Choose an MP4, WebM or MOV video.');
    duration=await videoDuration(f.file);setPct(0);
    media_path=await uploadObject(f.file,mime,me.id,p=>setPct(p)).promise;
   }
   if(!media_path)throw new Error('Choose a video to upload.');
   return demo.save({id:f.id,title:f.title,category:f.category,lang:f.lang,sort:f.sort,active:f.active,media_path,duration});
  },onSuccess:()=>{setForm(null);setPct(null);refresh();},onError:e=>{setPct(null);setErr(e instanceof Error?e.message:'Could not save.');}});
 const list=q.data??[];const shown=filter==='all'?list:list.filter(v=>v.category===filter);
 const catOptions=[{value:'general',label:'How to use OJASSS'},...cats.map(c=>({value:c.value as string,label:c.label}))];
 const used=[...new Set(list.map(v=>v.category))];
 const set=<K extends keyof Form>(k:K,v:Form[K])=>setForm(f=>({...f,[k]:v}));
 return <div className="ab ad">
  <div className="ab-top">
   <div className="ab-title"><span className="ab-logo"><Video size={16}/></span><div><h1>Demo videos <span className="nav-new-tag">NEW</span></h1><p>How-to videos per category, in Telugu and English</p></div></div>
   <div className="ad-topbtns"><button type="button" className="ab-btn" onClick={()=>setPreview({lang:'en',cat:'all'})}><Play size={13}/>Preview</button><button type="button" className="ab-btn ok" onClick={()=>{setErr('');setForm({...blank});}}><Plus size={13}/>Add video</button></div>
  </div>

  {form&&<section className="ab-card">
   <div className="ab-head"><h2>{form.id?'Edit demo video':'New demo video'}</h2></div>
   <div className="ab-form">
    <label className="ab-f">Title<input className="ab-in" maxLength={90} value={form.title??''} onChange={e=>set('title',e.target.value)} placeholder="e.g. How to join One Chance"/></label>
    <label className="ab-f">Category<select className="ab-in" value={form.category} onChange={e=>set('category',e.target.value)}>{catOptions.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
    <label className="ab-f">Language<select className="ab-in" value={form.lang} onChange={e=>set('lang',e.target.value as 'en'|'te')}><option value="en">English</option><option value="te">తెలుగు (Telugu)</option></select></label>
    <label className="ab-f">Order<input className="ab-in" type="number" value={form.sort??0} onChange={e=>set('sort',Number(e.target.value))}/></label>
    <div className="ab-f ad-file">Video
     <button type="button" className="ad-drop" onClick={()=>fileRef.current?.click()}><Upload size={16}/><span>{form.file?form.file.name:form.media_path?'Replace video (keeps current if none chosen)':'Choose MP4 / WebM / MOV'}</span></button>
     <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={e=>set('file',e.currentTarget.files?.[0])}/>
     {pct!==null&&<div className="ad-bar"><i style={{width:`${Math.round(pct*100)}%`}}/><span>{Math.round(pct*100)}%</span></div>}
    </div>
    <label className="ad-check"><input type="checkbox" checked={form.active!==false} onChange={e=>set('active',e.target.checked)}/>Visible to users</label>
    {err&&<p className="ab-err">{err}</p>}
    <div className="ab-actions"><button type="button" className="ab-btn ok" disabled={save.isPending||!form.title?.trim()} onClick={()=>{setErr('');save.mutate(form);}}>{save.isPending?'Saving…':'Save'}</button><button type="button" className="ab-btn" disabled={save.isPending} onClick={()=>setForm(null)}>Cancel</button></div>
   </div>
  </section>}

  <section className="ab-card">
   <div className="ab-head"><h2>Videos</h2><span>{list.length}</span></div>
   {used.length>0&&<div className="ad-chips"><button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All · {list.length}</button>{used.map(c=><button type="button" key={c} aria-pressed={filter===c} onClick={()=>setFilter(c)}>{demoCatLabel(c,cats)} · {list.filter(v=>v.category===c).length}</button>)}</div>}
   {!list.length&&!q.isLoading&&<p className="ab-empty">No demo videos yet. Add one per category; users see them under “Watch demo videos”.</p>}
   <div className="ab-list">{shown.map(v=><div key={v.id} className={cn('ab-row',!v.active&&'ad-off')}>
    <button type="button" className="ad-thumb" aria-label={`Preview ${v.title}`} onClick={()=>setPreview({lang:v.lang,cat:v.category})}><video src={(mediaUrl(v.media_path)??'')+'#t=0.5'} preload="metadata" muted playsInline/><Play size={12} fill="currentColor"/>{v.duration>0&&<small>{fmt(v.duration)}</small>}</button>
    <div className="ab-main"><b>{v.title}</b><span>{demoCatLabel(v.category,cats)} · <em className={'ad-lang is-'+v.lang}>{v.lang==='te'?'తెలుగు':'EN'}</em> · #{v.sort}</span></div>
    <button type="button" className="ab-icon" aria-label={v.active?'Hide from users':'Show to users'} onClick={()=>toggle.mutate(v)}>{v.active?<Eye size={14}/>:<EyeOff size={14}/>}</button>
    <button type="button" className="ab-icon" aria-label="Edit" onClick={()=>{setErr('');setForm({...v});window.scrollTo({top:0,behavior:'smooth'});}}><Pencil size={14}/></button>
    <button type="button" className="ab-icon ab-danger" aria-label="Delete" onClick={()=>{if(confirm(`Delete "${v.title}"?`))del.mutate(v.id);}}><Trash2 size={14}/></button>
   </div>)}</div>
  </section>
  {preview&&<DemoPlayer lang={preview.lang} setLang={l=>setPreview(p=>p&&{...p,lang:l})} initialCategory={preview.cat} onClose={()=>setPreview(null)}/>}
 </div>;
}
