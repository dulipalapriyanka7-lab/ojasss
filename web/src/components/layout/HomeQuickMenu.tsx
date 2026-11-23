import {useState} from 'react';
import {Link} from 'react-router-dom';
import {MoreHorizontal,PlusSquare,User,MessagesSquare,Bell,Bookmark,Settings,Shield,SlidersHorizontal,Mic} from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {Dialog} from '../ui/Overlay';
import {Button} from '../ui/Button';
export function HomeQuickMenu({onBrowse}:{onBrowse?:()=>void}){
 const {me,isStaff}=useAuth();const [open,setOpen]=useState(false);
 const guideKey='ojasss-home-guide-v3:'+(me?.id??'guest');
 const [guide,setGuide]=useState(()=>{try{return !!me&&localStorage.getItem(guideKey)!=='seen';}catch{return false;}});
 const dismiss=()=>{setGuide(false);try{localStorage.setItem(guideKey,'seen');}catch{/* Keep dismissal in memory. */}};
 const items=[{to:'/upload',label:'Create',icon:PlusSquare},{to:me?'/profile/'+me.username:'/login',label:'My profile',icon:User},{to:'/messages',label:'Messages',icon:MessagesSquare},{to:'/notifications',label:'Notifications',icon:Bell},{to:'/saved',label:'Saved reels',icon:Bookmark},{to:'/settings',label:'Settings',icon:Settings},...(isStaff?[{to:'/admin',label:'Admin',icon:Shield}]:[])];
 return <><button type="button" aria-label="Home menu" aria-expanded={open} onClick={()=>setOpen(true)} className="premium-header-icon"><MoreHorizontal size={18}/></button><Dialog open={open} onClose={()=>setOpen(false)} title="Your OJASSS" size="sm" className="ojass-glass-sheet"><div className="grid grid-cols-2 gap-2">{items.map(({to,label,icon:Icon})=><Link key={to} to={to} onClick={()=>setOpen(false)} className="post-option-row"><Icon size={18}/><span className="text-sm">{label}</span></Link>)}{onBrowse&&<button type="button" className="post-option-row" onClick={()=>{setOpen(false);onBrowse();}}><SlidersHorizontal size={18}/><span className="text-sm">Browse filters</span></button>}</div></Dialog><Dialog open={guide} onClose={dismiss} title="A cleaner Home" size="sm" className="ojass-glass-sheet" footer={<Button size="sm" onClick={dismiss}>Got it</Button>}><div className="speak-glass-banner mb-3"><img src="/brand/mark.png" width="28" height="28" alt="" className="relative size-7 rounded-lg bg-white"/><span className="relative text-sm font-semibold">Your OJASSS shortcuts</span></div><p className="flex items-start gap-2 text-sm text-fg-2"><MessagesSquare size={18} className="shrink-0 text-brand-ink"/>Messages are on the right side. One Chance is in the footer.</p><p className="mt-3 flex items-start gap-2 text-sm text-fg-2"><Mic size={18} className="shrink-0 text-brand-ink"/>Speak → mic → Record. Allow access to turn your voice into text.</p><p className="mt-3 text-xs text-fg-3">Create and Profile are in the footer; more shortcuts are in the Home menu.</p></Dialog></>;
}
