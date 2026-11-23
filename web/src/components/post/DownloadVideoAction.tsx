import {useEffect,useRef,useState} from 'react';
import {Download,X} from 'lucide-react';
import type {PostCard} from '@/api';
import {watermarkedDownload} from '@/lib/watermarkedDownload';
import {platform} from '@/lib/platform';
import {useAuth} from '@/hooks/useAuth';
import {useNavigate} from 'react-router-dom';
export function DownloadVideoAction({post}:{post:PostCard}){
 const {me}=useAuth();const navigate=useNavigate();
 const [progress,setProgress]=useState<number|null>(null),[url,setUrl]=useState(''),[error,setError]=useState('');const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{controller.current?.abort();setUrl('');setProgress(null);setError('');},[post.id]);
 const start=async()=>{if(!me){navigate('/login?next='+encodeURIComponent(location.pathname));return;}const abort=new AbortController();controller.current=abort;setProgress(0);setError('');try{setUrl(await watermarkedDownload(post,setProgress,abort.signal));}catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Download unavailable.');}finally{if(!abort.signal.aborted)setProgress(null);}};
 return <div>{url?<a className="post-option-row text-brand-ink" href={url} download onClick={e=>{if(platform.isAndroidApp()){e.preventDefault();platform.openExternal(url);}}}><Download size={19}/><span>Save watermarked video</span></a>:<div className="flex items-center"><button type="button" className="post-option-row" disabled={progress!==null} onClick={()=>void start()}><Download size={19}/><span>{progress===null?'Download video':`Preparing video · ${Math.round(progress*100)}%`}</span></button>{progress!==null&&<button type="button" aria-label="Cancel download" className="flex size-11 shrink-0 items-center justify-center" onClick={()=>{controller.current?.abort();setProgress(null);}}><X size={18}/></button>}</div>}<p className="px-3 pb-2 text-xs text-fg-3" role="status">{error||(url?'Ready to save · OJASSS logo + creator username':'Includes OJASSS logo + creator username')}</p></div>;
}
