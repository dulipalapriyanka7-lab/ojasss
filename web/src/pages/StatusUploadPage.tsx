import {useRef,useState} from 'react';
import {Camera,CheckCircle2,ImagePlus,Loader2,Send} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {statuses} from '@/api';
import {uploadObject} from '@/api/upload';
import {Page} from '@/components/layout/AppShell';
import {Button} from '@/components/ui/Button';
import {Field,Select,Textarea} from '@/components/ui/Field';
import {useToast} from '@/components/ui/Toast';
import {useAuth} from '@/hooks/useAuth';
import {sniffFile,type SniffedMime} from '@/lib/media';
import {useSeo} from '@/lib/seo';

export default function StatusUploadPage(){
 useSeo({title:'Add status',noindex:true});const {me}=useAuth(),toast=useToast(),navigate=useNavigate();const input=useRef<HTMLInputElement>(null);const [file,setFile]=useState<File|null>(null),[mime,setMime]=useState<SniffedMime|null>(null),[preview,setPreview]=useState(''),[caption,setCaption]=useState(''),[visibility,setVisibility]=useState<'public'|'followers'>('public'),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0);
 const choose=async(selected?:File)=>{if(!selected)return;const detected=await sniffFile(selected);if(!detected||(!detected.startsWith('image/')&&!detected.startsWith('video/'))){toast.error('Choose a JPG, PNG, WebP, MP4, MOV or WebM file.');return;}if(selected.size>100*1024*1024){toast.error('Choose media smaller than 100 MB.');return;}setFile(selected);setMime(detected);setPreview(URL.createObjectURL(selected));};
 const publish=async()=>{if(!file||!mime||!me)return;setBusy(true);try{const upload=uploadObject(file,mime,me.id,setProgress);const path=await upload.promise;await statuses.create({mediaPath:path,caption:caption.trim(),visibility});toast.success('Status shared for 12 hours.');navigate(`/profile/${me.username}`);}catch(error){toast.error(error);}finally{setBusy(false);}};
 return <Page width="sm" className="status-upload-page"><header className="mb-5"><span className="status-upload-mark"><Send size={22}/></span><h1>Add Status</h1><p>Share a moment that disappears after 12 hours.</p></header><input ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" capture="environment" className="sr-only" onChange={e=>void choose(e.target.files?.[0])}/>{!file?<button type="button" onClick={()=>input.current?.click()} className="status-picker"><span><ImagePlus size={32}/></span><b>Add photo or video</b><small>Camera or gallery · temporary status only</small></button>:<div className="status-preview">{mime?.startsWith('video/')?<video src={preview} controls playsInline className="size-full object-contain"/>:<img src={preview} alt="Status preview" className="size-full object-contain"/>}<button type="button" onClick={()=>input.current?.click()} className="status-change">Change</button></div>}<div className="mt-5 space-y-4"><Field label="Caption (optional)">{p=><Textarea {...p} value={caption} maxLength={280} onChange={e=>setCaption(e.target.value)} placeholder="Write something…"/>}</Field><Field label="Who can see this?">{p=><Select {...p} value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)}><option value="public">Everyone</option><option value="followers">People respecting you</option></Select>}</Field><Button className="w-full" size="lg" disabled={!file} loading={busy} onClick={()=>void publish()} leading={busy?<Loader2/>:<CheckCircle2/>}>Share status</Button>{busy&&<p className="text-center text-xs text-fg-3">Uploading {Math.round(progress*100)}%</p>}</div><div className="status-upload-note"><Camera size={16}/><span>Statuses are separate from permanent posts. They expire automatically.</span></div></Page>;
}
