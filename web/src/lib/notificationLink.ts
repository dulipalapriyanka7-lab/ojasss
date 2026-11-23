export function notificationDestination(raw:unknown,origin:string):string|null {
 if(typeof raw!=='string'||!raw)return null;
 try{
  const base=new URL(origin),url=new URL(raw,base);
  if(url.username||url.password||!['http:','https:'].includes(url.protocol))return null;
  if(url.origin!==base.origin&&!['https://ojasss.com','https://new.ojasss.com','https://www.ojasss.com'].includes(url.origin))return null;
  if(url.origin==='https://new.ojasss.com'||url.origin==='https://www.ojasss.com')url.host='ojasss.com';
  return url.href;
 }catch{return null;}
}
