import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ChevronLeft, ChevronRight, Flame, MessageCircle, Plus, Send, X} from 'lucide-react';
import {motion} from 'motion/react';
import {useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {messages,statuses, type StatusStory} from '@/api';
import {Avatar} from '@/components/ui/Misc';
import {Dialog} from '@/components/ui/Overlay';
import {Skeleton} from '@/components/ui/Feedback';
import {mediaUrl} from '@/lib/media';
import {timeAgo} from '@/lib/format';
import {useAuth} from '@/hooks/useAuth';
import {useToast} from '@/components/ui/Toast';
import {StatusHotBurst} from './StatusHotBurst';

export function StatusStories(){
 const navigate=useNavigate();
 const {me}=useAuth();const toast=useToast(),qc=useQueryClient();const stories=useQuery({queryKey:['status-stories'],queryFn:()=>statuses.list(),staleTime:30_000,refetchInterval:60_000});const [open,setOpen]=useState<StatusStory|null>(null);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const items=stories.data??[];const storyAt=(change:number)=>{if(!open)return;const i=items.findIndex(x=>x.id===open.id);setOpen(items[(i+change+items.length)%items.length]??open);};
 const hot=async()=>{if(!open||open.user_id===me?.id||busy)return;setBusy(true);try{const update=await statuses.toggleHot(open.id);setOpen({...open,...update});qc.setQueryData<StatusStory[]>(['status-stories'],old=>old?.map(item=>item.id===open.id?{...item,...update}:item));}catch(error){toast.error(error);}finally{setBusy(false);}};
 const send=async()=>{if(!open||!message.trim()||open.user_id===me?.id||busy)return;setBusy(true);try{const conversation=await messages.open(open.user_id);await messages.send(conversation,`Reply to your status: ${message.trim()}`);setMessage('');toast.success('Message sent');}catch(error){toast.error(error);}finally{setBusy(false);}};
 return <section aria-label="Status stories" className="profile-stories mb-4"><div className="profile-story-row">
   {me&&<Link to="/status/new" className="profile-story-add" aria-label="Add a new 12-hour status"><span className="profile-story-add-icon"><Plus size={20}/></span><span>Add Status</span></Link>}
   {stories.isPending&&Array.from({length:5},(_,i)=><div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1"><Skeleton className="size-14 rounded-full"/><Skeleton className="h-3 w-12"/></div>)}
   {items.map(story=><button key={story.id} type="button" onClick={()=>navigate(`/status/view/${story.id}`)} className="profile-story-item" aria-label={`View ${story.profile.display_name||story.profile.username}'s status`}><Avatar path={story.profile.avatar_path} name={story.profile.display_name||story.profile.username} size={58} status/><span className="truncate">{story.user_id===me?.id?'My Status':story.profile.display_name||story.profile.username}</span></button>)}
 </div>
 <Dialog open={!!open} onClose={()=>setOpen(null)} title="Status" hideTitle size="md" className="status-viewer-sheet">
  <StatusHotBurst key={`${open?.id}-${open?.hot_count}`} active={!!open?.my_hot}/>
  {open&&<div className="status-viewer"><div className="status-progress"><span style={{width:'100%'}}/></div><div className="status-viewer-head"><Avatar path={open.profile.avatar_path} name={open.profile.display_name||open.profile.username} size={34} status/><div><b>{open.profile.display_name||open.profile.username}</b><p>{timeAgo(open.created_at)}</p></div><button type="button" onClick={()=>setOpen(null)} aria-label="Close status"><X size={20}/></button></div><div className="status-media">{open.mime_type.startsWith('video/')?<video src={mediaUrl(open.media_path)??undefined} autoPlay playsInline controls className="size-full object-contain"/>:<img src={mediaUrl(open.media_path)??undefined} alt={open.caption||'Status'} className="size-full object-contain"/>}</div>{open.caption&&<p className="status-caption">{open.caption}</p>}<div className="status-actions"><form className="status-reply" onSubmit={e=>{e.preventDefault();void send();}}><input aria-label="Reply to this status" value={message} maxLength={800} disabled={open.user_id===me?.id||busy} onChange={e=>setMessage(e.target.value)} placeholder={open.user_id===me?.id?'Your status':'Send message'}/><button aria-label="Send message" disabled={!message.trim()||busy||open.user_id===me?.id}><Send size={18}/></button></form><motion.button type="button" aria-label={open.my_hot?'Remove Hot':'Send Hot'} disabled={open.user_id===me?.id||busy} onClick={()=>void hot()} className={open.my_hot?'status-hot is-hot':'status-hot'} whileTap={{scale:.92}}><Flame size={22}/><motion.span key={open.hot_count} initial={{scale:1.45,opacity:.5}} animate={{scale:1,opacity:1}} transition={{type:'spring',damping:16,stiffness:360}}>{open.hot_count}</motion.span></motion.button><button type="button" className="status-speak" aria-label="Message this creator" disabled={open.user_id===me?.id||busy} onClick={()=>document.querySelector<HTMLInputElement>('.status-reply input')?.focus()}><MessageCircle size={22}/></button></div><button type="button" aria-label="Previous status" className="status-nav status-nav-left" onClick={()=>storyAt(-1)}><ChevronLeft/></button><button type="button" aria-label="Next status" className="status-nav status-nav-right" onClick={()=>storyAt(1)}><ChevronRight/></button></div>}
 </Dialog></section>;
}
