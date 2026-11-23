export function formatCtaDestination(kind:string|undefined,value:string):string {
 const clean=value.trim();
 if(kind==='phone')return 'tel:'+clean.replace(/\s/g,'');
 if(kind==='email')return 'mailto:'+clean;
 if(kind==='whatsapp')return 'https://wa.me/'+clean.replace(/[^0-9]/g,'');
 return clean;
}
export function allowedCtaDestination(value:string|null|undefined):value is string {
 if(!value)return false;
 if(/^tel:\+?[0-9]{7,16}$/.test(value)||/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))return true;
 try{const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}
}
