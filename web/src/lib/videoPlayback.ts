/** Autoplay failures must never overwrite the viewer's deliberate pause choice. */
export async function tryVideoPlayback(video:HTMLVideoElement,isCurrent:()=>boolean,onBlocked:()=>void,onMuted:()=>void):Promise<void>{
 try{await video.play();}catch(error){
  if(!isCurrent()||(error as DOMException)?.name==='AbortError')return;
  if(!video.muted){video.muted=true;onMuted();try{await video.play();}catch(retry){if(isCurrent()&&(retry as DOMException)?.name!=='AbortError')onBlocked();}}
  else onBlocked();
 }
}
