export type VideoQuality='hd'|'fast'|'original';
export function videoEncodingPlan(width:number,height:number,quality:VideoQuality){
 const edge=quality==='fast'?1280:1920,short=quality==='fast'?720:1080;
 const scale=quality==='original'?1:Math.min(1,edge/Math.max(width,height),short/Math.min(width,height));
 return {width:Math.max(2,Math.floor(width*scale/2)*2),height:Math.max(2,Math.floor(height*scale/2)*2),bitrate:quality==='fast'?2_500_000:6_000_000};
}
