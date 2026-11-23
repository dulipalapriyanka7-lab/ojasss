import {AnimatePresence,motion} from 'motion/react';
import {Bell,Check,ChevronLeft,ChevronRight,Flame,Mic,Plus,ShieldCheck,Sparkles} from 'lucide-react';
import {useEffect,useState} from 'react';
import {useAuth} from '@/hooks/useAuth';
import {Dialog} from '@/components/ui/Overlay';
import {Button} from '@/components/ui/Button';

const TOUR_VERSION='v1';
const steps=[
 {icon:Sparkles,title:'Your personal feed',text:'Swipe up to watch the next video. Pick categories, country and language to shape what you see.',tone:'from-fuchsia-500 to-violet-600'},
 {icon:Plus,title:'Create with confidence',text:'Use Create to upload a video or poster. Choose New Content or Copy-Paste Content before publishing.',tone:'from-orange-400 to-pink-500'},
 {icon:Flame,title:'Fires, Speak and Viral',text:'Give Fires, share and Speak your mind. At 10 Fires and 10 Shares, a video becomes Viral and enters One Chance automatically.',tone:'from-amber-400 to-rose-500'},
 {icon:Mic,title:'Speak your mind',text:'Tap the mic beside a video to share text or voice. Replies, reactions and media stay together in one conversation.',tone:'from-cyan-400 to-blue-600'},
 {icon:Bell,title:'Updates, tasks and rewards',text:'The header announcement icon opens updates. Your assigned tasks, progress and benefits are always available in your profile and earnings.',tone:'from-violet-500 to-fuchsia-600'},
 {icon:ShieldCheck,title:'You are ready',text:'Respect creators, keep content original, and use One Chance only after your video is Viral. You can start exploring now.',tone:'from-emerald-400 to-teal-600'},
] as const;

export function FeatureTour(){
 const {me}=useAuth();const [step,setStep]=useState(0),[open,setOpen]=useState(false);
 useEffect(()=>{if(!me?.onboarded)return;try{setOpen(localStorage.getItem(`ojasss-feature-tour-${TOUR_VERSION}:${me.id}`)!=='done');}catch{setOpen(true);}},[me?.id,me?.onboarded]);
 const close=()=>{try{if(me)localStorage.setItem(`ojasss-feature-tour-${TOUR_VERSION}:${me.id}`,'done');}catch{/* tour may appear again if storage is unavailable */}setOpen(false);};
 const current=steps[step],Icon=current.icon;
 return <Dialog open={open} onClose={close} title={`Welcome to OJASSS · ${step+1} of ${steps.length}`} description="A quick guide to the main features" size="sm" className="feature-tour-sheet" footer={<><Button variant="ghost" onClick={close}>Skip tour</Button>{step>0&&<Button variant="secondary" aria-label="Previous tour step" onClick={()=>setStep(value=>value-1)} leading={<ChevronLeft size={16}/>}>Back</Button>}<Button onClick={()=>step===steps.length-1?close():setStep(value=>value+1)} trailing={step===steps.length-1?<Check size={16}/>:<ChevronRight size={16}/>}>{step===steps.length-1?'Start exploring':'Next'}</Button></>}><div className="feature-tour-progress" aria-label={`Tour step ${step+1} of ${steps.length}`}>{steps.map((_,index)=><i key={index} className={index<=step?'is-active':''}/>)}</div><AnimatePresence mode="wait"><motion.section key={current.title} initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-16}} transition={{duration:.2,ease:[.22,1,.36,1]}} className="feature-tour-card"><span className={`feature-tour-icon bg-gradient-to-br ${current.tone}`}><Icon size={25}/></span><div><h3>{current.title}</h3><p>{current.text}</p></div></motion.section></AnimatePresence><p className="mt-4 text-center text-[11px] text-fg-3">This guide appears once for each new account.</p></Dialog>;
}
