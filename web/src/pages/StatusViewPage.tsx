import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useEffect,useRef,useState} from 'react';
import {useNavigate,useParams,Link} from 'react-router-dom';
import {Flame,Send,X,ChevronLeft,ChevronRight,Pencil,Trash2,Check} from 'lucide-react';
import './status-actions.css';
import {statuses,messages,type StatusStory} from '@/api';
import {Avatar} from '@/components/ui/Misc';
import {StatusHotBurst} from '@/components/profile/StatusHotBurst';
import {useAuth} from '@/hooks/useAuth';
import {useToast} from '@/components/ui/Toast';
import {mediaUrl} from '@/lib/media';
import {timeAgo} from '@/lib/format';
export default function StatusViewPage(){
 const {statusId}=useParams(),navigate=useNavigate(),{me}=useAuth(),toast=useToast(),qc=useQueryClient();
 const query=useQuery({queryKey:['status-stories'],queryFn:()=>statuses.list()});
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[burst,setBurst]=useState(0);
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[confirmDelete,setConfirmDelete]=useState(false);
 const items=query.data??[],index=items.findIndex(x=>x.id===statusId),story=items[index];
 const move=(step:number)=>{const next=items[index+step];if(next){setMessage('');navigate(`/status/view/${next.id}`,{replace:true});}};
 const close=()=>navigate('/profile');
 const hot=async()=>{if(!story||busy||story.user_id===me?.id)return;setBusy(true);try{const result=await statuses.toggleHot(story.id);qc.setQueryData<StatusStory[]>(['status-stories'],old=>old?.map(x=>x.id===story.id?{...x,...result}:x));if(result.my_hot)setBurst(n=>n+1);}catch(e){toast.error(e);}finally{setBusy(false);}};
 // Story timer: images run 6 s, videos follow their own playback; pauses while editing or confirming.
 const [progress,setProgress]=useState(0);const videoRef=useRef<HTMLVideoElement>(null);const paused=editing||confirmDelete||message.length>0;
 useEffect(()=>{setProgress(0);},[story?.id]);
 useEffect(()=>{if(!story||paused)return;const isVideo=story.mime_type.startsWith('video/');let last=performance.now();const id=window.setInterval(()=>{const t=performance.now();if(isVideo){const v=videoRef.current;if(v&&v.duration>0)setProgress(Math.min(1,v.currentTime/v.duration));}else setProgress(p=>Math.min(1,p+(t-last)/6000));last=t;},50);return()=>window.clearInterval(id);},[story,paused]);
 useEffect(()=>{if(progress<1||!story)return;if(index<items.length-1)move(1);else close();},[progress]);
 const staff=['admin','moderator','super_admin'].includes((me as {role?:string}|null)?.role??'');
 const saveEdit=async()=>{if(!story||busy)return;setBusy(true);try{await statuses.update(story.id,draft.trim());qc.setQueryData<StatusStory[]>(['status-stories'],old=>old?.map(x=>x.id===story.id?{...x,caption:draft.trim()}:x));setEditing(false);toast.success('Status updated');}catch(e){toast.error(e);}finally{setBusy(false);}};
 const removeStory=async()=>{if(!story||busy)return;setBusy(true);try{await statuses.remove(story.id);qc.setQueryData<StatusStory[]>(['status-stories'],old=>old?.filter(x=>x.id!==story.id));await qc.invalidateQueries({queryKey:['me']});toast.success('Status deleted');close();}catch(e){toast.error(e);}finally{setBusy(false);setConfirmDelete(false);}};
 const send=async()=>{if(!story||!message.trim()||busy)return;setBusy(true);try{const id=await messages.open(story.user_id);await messages.send(id,`Reply to your status: ${message.trim()}`);setMessage('');toast.success('Message sent');}catch(e){toast.error(e);}finally{setBusy(false);}};
 return <main className="status-route-screen"><div className="status-route-stage">{!story?<div className="status-route-empty"><p>{query.isPending?'Loading status…':'This status has expired or is unavailable.'}</p><button onClick={close}>Back to profile</button></div>:<>
 <div className="status-route-progress">{items.map((x,i)=><span key={x.id} className="status-timer-seg"><i style={{width:(i<index?100:i===index?progress*100:0)+'%'}}/></span>)}</div>
 <header className="status-route-header"><Link to={`/profile/${story.profile.username}`}><Avatar size={34} path={story.profile.avatar_path} name={story.profile.display_name||story.profile.username}/><span><b>{story.profile.display_name||story.profile.username}</b><small>{timeAgo(story.created_at)}</small></span></Link><button aria-label="Close status" onClick={close}><X size={23}/></button></header>
 <div className="status-route-media">{story.mime_type.startsWith('video/')?<video ref={videoRef} key={story.id} onEnded={()=>setProgress(1)} src={mediaUrl(story.media_path)??undefined} autoPlay playsInline controls/>:<img src={mediaUrl(story.media_path)??undefined} alt={story.caption||'Status'}/>}</div>
 {(story.user_id===me?.id||staff)&&<div className="status-glass-actions"><button type="button" className="status-glass-btn is-danger" onClick={()=>setConfirmDelete(true)} disabled={busy}><Trash2 size={13} aria-hidden/>Delete</button></div>}
 {editing?<form className="status-glass-edit" onSubmit={e=>{e.preventDefault();void saveEdit();}}><input autoFocus maxLength={280} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a caption…" aria-label="Status caption"/><button type="submit" className="status-glass-btn is-primary" disabled={busy}><Check size={13} aria-hidden/>Save</button><button type="button" className="status-glass-btn" onClick={()=>setEditing(false)}>Cancel</button></form>:(story.caption||story.user_id===me?.id||staff)&&<p className="status-route-caption status-caption-row"><span>{story.caption||<em className="opacity-70">Add a caption</em>}</span>{(story.user_id===me?.id||staff)&&<button type="button" className="status-caption-pencil" aria-label="Edit caption" onClick={()=>{setDraft(story.caption??'');setEditing(true);}} disabled={busy}><Pencil size={12} aria-hidden/></button>}</p>}
 {confirmDelete&&<div className="status-glass-confirm" role="alertdialog" aria-label="Delete status"><p>Delete this status? This can’t be undone.</p><div><button type="button" className="status-glass-btn" onClick={()=>setConfirmDelete(false)}>Cancel</button><button type="button" className="status-glass-btn is-danger" onClick={()=>void removeStory()} disabled={busy}><Trash2 size={13} aria-hidden/>Delete</button></div></div>}
 <div className="status-route-controls"><button aria-label="Previous status" disabled={index===0} onClick={()=>move(-1)}><ChevronLeft size={18}/></button><button aria-label="Next status" disabled={index===items.length-1} onClick={()=>move(1)}><ChevronRight size={18}/></button></div>
 <footer className="status-route-footer"><form onSubmit={e=>{e.preventDefault();void send();}}><input aria-label="Message the status creator" placeholder={story.user_id===me?.id?'Your status':'Send message…'} value={message} onChange={e=>setMessage(e.target.value)} disabled={busy||story.user_id===me?.id}/><button aria-label="Send message" disabled={busy||!message.trim()||story.user_id===me?.id}><Send size={20}/></button></form><button className={story.my_hot?'is-hot':''} aria-label="React Hot" onClick={()=>void hot()} disabled={busy||story.user_id===me?.id}><Flame size={25}/><small>{story.hot_count}</small></button></footer>
 {burst>0&&<StatusHotBurst key={burst} active/>}
 </>}</div></main>;
}
