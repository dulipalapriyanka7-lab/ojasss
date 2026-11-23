import { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BriefcaseBusiness, Check, ChevronRight, Clapperboard, Ghost, GraduationCap, Music2, Newspaper, Play, Sparkles, Store, Target, TrendingUp, Trophy } from 'lucide-react';
import type { Category } from '@/api';
import { discovery } from '@/api/discovery';
import { useAuth, meKey } from '@/hooks/useAuth';
import { useCategories } from '@/hooks/useCategories';
import { Dialog } from '../ui/Overlay';
import { cn } from '@/lib/utils';
import './feed-preferences.css';
import { DemoBanner } from '../demo/DemoVideos';

const featured = [
  { id: 'part_time_jobs', name: 'Part Time Jobs', note: '(48hrs)', icon: BriefcaseBusiness, color: '#ffae59' },
  { id: 'entertainment', name: 'Entertainment', icon: Clapperboard, color: '#ff6ab3' },
  { id: 'one_chance', name: 'One Chance', note: 'Weekly Winners Viral Videos', icon: Trophy, color: '#ffc247' },
  { id: 'horror_stories', name: 'Horror Stories', icon: Ghost, color: '#d690ff' },
  { id: 'music_dance', name: 'Music & Dance', icon: Music2, color: '#ff76c9' },
  { id: 'world_education', name: 'World Education', icon: GraduationCap, color: '#a89aff' },
  { id: 'business_promotion', name: 'Business Promotion & E-Commerce', icon: Store, color: '#ffad70' },
  { id: 'news', name: 'News Reporter', note: '(48hrs)', icon: Newspaper, color: '#d0a2ff' },
] as const;
type Feature = 'Business Promotion & E-Commerce' | 'Business' | 'Daily Hunt';

function NeonWaves() {
  const id = useId();
  return <svg className="pref-waves" viewBox="0 0 440 840" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={id}><stop stopColor="#6614ff" stopOpacity=".1"/><stop offset=".31" stopColor="#a900ff"/><stop offset=".63" stopColor="#f000cc"/><stop offset="1" stopColor="#ff981a"/></linearGradient></defs>
    <g fill="none" stroke={`url(#${id})`}>
      <path d="M-25 162C29 98 47 52 181-17M-30 122C25 79 71 34 133-22" opacity=".5"/>
      <path d="M-40 779C40 730 101 865 220 810S354 793 474 704M-30 801C67 755 117 884 245 821S348 807 462 754"/>
      <path d="M-40 779C40 730 101 865 220 810S354 793 474 704" className="pref-wave-glow"/>
    </g>
  </svg>;
}

export function CategoryWelcome({edit,onClose,fullPage=false,openCategory}:{edit:boolean;onClose:()=>void;fullPage?:boolean;openCategory?:(category:Category)=>void}) {
  const categories = useCategories();
  const {me}=useAuth();
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState<Category[]>([]);
  const [all,setAll]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [feature,setFeature]=useState<Feature|null>(null);
  const [expanded,setExpanded]=useState(false);

  useEffect(()=>{
    if(!me || (!edit && me.category_preferences)) return;
    setSelected(me.category_preferences?.selected??[]);
    setAll(me.category_preferences?.show_all??false);
    setOpen(true);
  },[me?.id,edit]);

  const available = new Map(categories.map(category=>[category.value,category]));
  const valid = selected.filter(id=>id!=='one_chance' && available.has(id));
  const jobs = (['part_time_jobs','full_time_jobs'] as const).filter(id=>available.has(id));
  const extras = categories.filter(category=>category.value==='business_promotion'||!featured.some(item=>item.id===category.value));
  const toggle = (id:Category)=>setSelected(previous=>previous.includes(id)?previous.filter(other=>other!==id):[...previous,id]);
  const save = async()=>{
    if (!me || busy || (!all && !valid.length)) return;
    setError('');
    setBusy(true);
    try {
      const profile=await discovery.savePreferences(valid,all);
      qc.setQueriesData({queryKey:meKey},profile);
      await qc.invalidateQueries({queryKey:['feed']});
      try { sessionStorage.setItem('ojasss-category-session:'+me.id,'chosen'); } catch { /* Saved on the server. */ }
      setOpen(false);
      onClose();
    } catch {
      setError('Could not save your preferences. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const shortcut=(id:Category,title:string,Icon:typeof Newspaper,color:string,note?:string)=>{
    const content=<><Icon color={color} size={20} aria-hidden="true"/><span><strong>{title}</strong>{note&&<small>{note}</small>}</span><ChevronRight size={14} aria-hidden="true"/></>;
    return openCategory
      ? <button type="button" className="pref-card" onClick={()=>openCategory(id)}>{content}</button>
      : <Link className="pref-card" to={`/?category=${id}`}>{content}</Link>;
  };

  const content=<div className="pref-content">
    <NeonWaves/>
    <header className="pref-header">
      <div className="pref-brand"><img src="/brand/mark.png" width="55" height="55" alt=""/>OJASSS</div>
      {fullPage&&<h1>Make it Your <em>Feed</em><Sparkles size={21} aria-hidden="true"/></h1>}
      {fullPage&&<p>Choose what you enjoy. You can change this anytime.</p>}
    </header>
    <DemoBanner/>
    <button type="button" className="pref-recommend" disabled={busy||!jobs.length} onClick={()=>setSelected(previous=>[...new Set([...previous,...jobs])])}>
      <Sparkles size={17} aria-hidden="true"/><b>NEW</b><span>Recommended: Part Time &amp; Full Time Jobs</span><ChevronRight size={16} aria-hidden="true"/>
    </button>
    <div className="pref-grid" aria-label="Choose categories">
      {featured.map(({id,name,icon:Icon,color,...details})=>{
        if(id!=='business_promotion'&&!available.has(id)) return null;
        const note='note' in details?details.note:undefined;
        if(id==='one_chance') return <div key={id}>{shortcut(id,name,Icon,color,note)}</div>;
        const coming=false; // Business Promotion & E-Commerce is live
        const active=selected.includes(id);
        return <button key={id} type="button" className={cn('pref-card',active&&!coming&&'pref-selected')} disabled={busy}
          aria-pressed={coming?undefined:active} onClick={()=>toggle(id)}>
          <Icon color={color} size={21} aria-hidden="true"/><span><strong>{name}</strong>{note&&<small>{note}</small>}{coming&&<span className="pref-soon">Coming Soon</span>}</span>
          {active&&!coming&&<Check size={17} className="pref-check" aria-hidden="true"/>}
        </button>;
      })}
    </div>
    <div className="pref-grid pref-features">
      {([{name:'Business',icon:TrendingUp,tone:'amber'},{name:'Daily Hunt',icon:Target,tone:'violet'}] as const).map(({name,icon:Icon,tone})=>
        <button key={name} type="button" className={`pref-card pref-${tone}`} onClick={()=>setFeature(name)}>
          <Icon size={22} aria-hidden="true"/><span><strong>{name}</strong><span className="pref-soon">Coming Soon</span></span>
        </button>)}
    </div>
    {extras.length>0&&<>
      <button type="button" className="pref-expand" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide more categories':'More categories'} <ChevronRight size={14} aria-hidden="true"/></button>
      {expanded&&<div className="pref-grid">{extras.map(c=><button type="button" key={c.value} disabled={busy} className={cn('pref-card',selected.includes(c.value)&&'pref-selected')} aria-pressed={selected.includes(c.value)} onClick={()=>toggle(c.value)}><c.icon size={21} aria-hidden="true"/><span><strong>{c.label}</strong></span>{selected.includes(c.value)&&<Check size={17} className="pref-check" aria-hidden="true"/>}</button>)}</div>}
    </>}
    <label className="pref-all"><input type="checkbox" checked={all} disabled={busy} onChange={event=>setAll(event.target.checked)}/>I want to see all categories</label>
    <p className="pref-hint">Leave this off to see only your selected categories in For You.</p>
    {error&&<p role="alert" className="pref-error">{error}</p>}
    <button type="button" className="pref-submit" disabled={busy||(!all&&!valid.length)} onClick={()=>void save()}>
      <span><Play size={15} fill="currentColor" aria-hidden="true"/></span><b>{busy?'Saving…':'Show My Videos'}</b><ChevronRight size={21} aria-hidden="true"/>
    </button>
    <nav className="pref-grid pref-shortcuts" aria-label="Quick access">
      {available.has('news')&&shortcut('news','My News Reporter Videos',Newspaper,'#d0a2ff','(48hrs)')}
      {available.has('part_time_jobs')&&shortcut('part_time_jobs','My Part Time Jobs',BriefcaseBusiness,'#ffae59','(48hrs)')}
    </nav>
    <Dialog open={!!feature} onClose={()=>setFeature(null)} title={feature??''} size="sm" className="pref-coming-dialog">
      <p className="pref-soon">Coming Soon</p>
      <p className="mt-3 text-sm text-fg-2">{feature==='Daily Hunt'?'Daily challenges will be available here when Daily Hunt launches.':'This section will be available when the feature launches.'}</p>
      <button type="button" className="pref-submit mt-4" onClick={()=>setFeature(null)}>Close</button>
    </Dialog>
  </div>;
  if(fullPage) return <main className="pref-page">{content}</main>;
  return <Dialog open={open} onClose={()=>{if(!busy&&me?.category_preferences){setOpen(false);onClose();}}} title="Make it your feed" description="Choose what you enjoy. You can change this anytime." className="pref-coming-dialog">{content}</Dialog>;
}
