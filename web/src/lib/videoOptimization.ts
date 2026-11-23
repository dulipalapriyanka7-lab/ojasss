import type {VideoQuality} from './videoEncodingPlan';
export {videoEncodingPlan,type VideoQuality} from './videoEncodingPlan';
export interface PreparedVideo{blob:Blob;mime:'video/mp4'|'video/webm'|'video/quicktime';width:number;height:number;quality:VideoQuality;optimized:boolean;note:string;}
export function prepareVideo(file:File,quality:VideoQuality,metadata:{width:number;height:number;durationMs:number;mime:'video/mp4'|'video/webm'|'video/quicktime'},onProgress:(progress:number)=>void,signal:AbortSignal):Promise<PreparedVideo>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
  const original=():PreparedVideo=>({blob:file,...metadata,quality:'original',optimized:false,note:'Original quality kept. HD compression is unavailable on this device.'});
  let worker:Worker;
  try{worker=new Worker(new URL('../workers/videoOptimizer.worker.ts',import.meta.url),{type:'module'});}catch{resolve(original());return;}
  const finish=()=>{worker.terminate();signal.removeEventListener('abort',abort);};
  const abort=()=>{finish();reject(new DOMException('Cancelled','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  const fallback=()=>{finish();resolve(original());};
  worker.onmessage=e=>{if(typeof e.data.progress==='number'){onProgress(e.data.progress);return;}if(e.data.result){finish();resolve(e.data.result as PreparedVideo);}else fallback();};
  worker.onerror=e=>{e.preventDefault();fallback();};
  try{worker.postMessage({file,quality,metadata});}catch{fallback();}
 });
}
