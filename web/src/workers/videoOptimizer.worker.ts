import {Input,ALL_FORMATS,BlobSource,Output,Mp4OutputFormat,BufferTarget,Conversion,canEncodeVideo,Quality} from 'mediabunny';
import {videoEncodingPlan,type VideoQuality} from '../lib/videoEncodingPlan';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(data:unknown)=>void};
scope.onmessage=async event=>{
 const {file,quality,metadata}=event.data as {file:File;quality:VideoQuality;metadata:{width:number;height:number;durationMs:number;mime:'video/mp4'|'video/webm'|'video/quicktime'}};
 let input:Input|undefined;
 try{
  input=new Input({formats:ALL_FORMATS,source:new BlobSource(file)});
  const track=await input.getPrimaryVideoTrack();if(!track)throw new Error('No video');
  const width=await track.getDisplayWidth(),height=await track.getDisplayHeight();
  const plan=videoEncodingPlan(width,height,quality);
  const bitrate=Math.round(file.size*8/Math.max(1,metadata.durationMs/1000));
  const resize=plan.width!==width||plan.height!==height;
  const compress=quality!=='original'&&(resize||bitrate>plan.bitrate*1.12);
  if(compress&&!await canEncodeVideo('avc',{width:plan.width,height:plan.height,bitrate:plan.bitrate}))throw new Error('HD encoder unavailable');
  const target=new BufferTarget();
  const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const conversion=await Conversion.init({input,output,tracks:'primary',video:compress?{codec:'avc',width:plan.width,height:plan.height,fit:'contain',quality:new Quality({bitrate:plan.bitrate}),forceTranscode:true,keyFrameInterval:2}:{},audio:{}});
  // Never publish a conversion that silently dropped the original soundtrack.
  if(!conversion.isValid||conversion.discardedTracks.length)throw new Error('Cannot preserve all tracks');
  conversion.onProgress=progress=>scope.postMessage({progress});
  await conversion.execute();if(!target.buffer)throw new Error('No output');
  const blob=new Blob([target.buffer],{type:'video/mp4'});
  if(compress&&blob.size>=file.size){scope.postMessage({result:{blob:file,mime:metadata.mime,width,height,quality:'original',optimized:false,note:'Your video is already compact. Original quality kept.'}});return;}
  const saving=Math.max(0,Math.round((1-blob.size/file.size)*100));
  scope.postMessage({result:{blob,mime:'video/mp4',width:compress?plan.width:width,height:compress?plan.height:height,quality,optimized:true,note:saving>1?`${saving}% smaller · ready for faster playback`:'Playback optimized · original detail preserved'}});
 }catch{scope.postMessage({fallback:true});}finally{input?.dispose();}
};
