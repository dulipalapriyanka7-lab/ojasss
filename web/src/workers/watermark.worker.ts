import {Input,ALL_FORMATS,BlobSource,Output,Mp4OutputFormat,BufferTarget,Conversion,Quality} from 'mediabunny';
self.onmessage=async e=>{
 let input:Input|undefined;let logo:ImageBitmap|undefined;
 try{
  input=new Input({formats:ALL_FORMATS,source:new BlobSource(e.data.source)});const track=await input.getPrimaryVideoTrack();if(!track)throw new Error('No video track.');
  const originalW=await track.getDisplayWidth(),originalH=await track.getDisplayHeight();const scale=Math.min(1,1920/Math.max(originalW,originalH));const w=Math.max(2,Math.round(originalW*scale/2)*2),h=Math.max(2,Math.round(originalH*scale/2)*2);
  const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable.');logo=await createImageBitmap(e.data.logo);
  const mark=logo;const font=Math.max(14,Math.round(Math.min(w,h)*.035)),pad=Math.round(font*.65),icon=font*2.1;const username='@'+String(e.data.username).slice(0,32);
  const target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const conversion=await Conversion.init({input,output,tracks:'primary',video:{codec:'avc',width:w,height:h,fit:'contain',forceTranscode:true,quality:new Quality({bitrate:4000000}),process:sample=>{
   sample.draw(ctx,0,0,w,h);ctx.font=`600 ${font}px sans-serif`;const textWidth=Math.max(ctx.measureText(username).width,ctx.measureText('OJASSS').width);const boxW=Math.min(w-pad*2,textWidth+icon+pad*3),boxH=icon+pad*2;const x=pad,y=h-boxH-pad;
   const maxText=Math.max(1,boxW-icon-pad*3);ctx.fillStyle='rgba(8,6,15,.72)';ctx.beginPath();ctx.roundRect(x,y,boxW,boxH,pad);ctx.fill();ctx.drawImage(mark,x+pad,y+pad,icon,icon);ctx.fillStyle='#fff';ctx.textBaseline='top';ctx.fillText('OJASSS',x+icon+pad*2,y+pad,maxText);ctx.font=`500 ${Math.round(font*.85)}px sans-serif`;ctx.fillText(username,x+icon+pad*2,y+pad+font*1.2,maxText);return canvas;
  }},audio:{}});
  if(!conversion.isValid||conversion.discardedTracks.length)throw new Error('This video format cannot be downloaded on this device. Try an updated Chrome browser.');
  conversion.onProgress=p=>self.postMessage({progress:p});await conversion.execute();if(!target.buffer)throw new Error('No video produced.');self.postMessage({blob:new Blob([target.buffer],{type:'video/mp4'})});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:'Could not prepare video.'});}finally{logo?.close();input?.dispose();}
};
