import {mediaUrl} from './media';
import {env} from './env';
import {supabase} from './supabase';
import type {PostCard} from '@/api';
export async function watermarkedDownload(post:PostCard,progress:(n:number)=>void,signal:AbortSignal):Promise<string>{
 const [{data},source,logo]=await Promise.all([supabase.auth.getSession(),fetch(mediaUrl(post.media_path)!,{signal}).then(r=>{if(!r.ok)throw new Error('This video is unavailable.');return r.blob();}),fetch('/brand/mark.png',{signal}).then(r=>r.blob())]);
 if(!data.session)throw new Error('Please sign in to download videos.');
 const blob=await new Promise<Blob>((resolve,reject)=>{
  const worker=new Worker(new URL('../workers/watermark.worker.ts',import.meta.url),{type:'module'});
  const finish=()=>{worker.terminate();signal.removeEventListener('abort',abort);};const abort=()=>{finish();reject(new DOMException('Cancelled','AbortError'));};
  if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
  worker.onmessage=e=>{if(e.data.progress!==undefined)progress(e.data.progress*.85);else{finish();if(e.data.blob)resolve(e.data.blob);else reject(new Error(e.data.error));}};
  worker.onerror=()=>{finish();reject(new Error('Video downloads are unavailable on this device. Try an updated Chrome browser.'));};
  worker.postMessage({source,logo,username:post.author_username});
 });
 progress(.9);const response=await fetch(`${env.supabaseUrl}/video-download?post=${encodeURIComponent(post.id)}`,{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'video/mp4'},body:blob,signal});
 const result=await response.json().catch(()=>({}));if(!response.ok||typeof result.url!=='string')throw new Error(result.message||'Could not prepare the download.');progress(1);return result.url;
}
