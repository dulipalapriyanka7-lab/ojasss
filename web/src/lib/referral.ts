const KEY='ojasss-referral-intent-v1';
export function normalizeReferral(value:string|null|undefined):string|null{const code=value?.trim().toUpperCase()??'';return /^[A-Z0-9]{6,32}$/.test(code)?code:null;}
export function captureReferral(value:string|null|undefined):string|null{const code=normalizeReferral(value);if(code)try{localStorage.setItem(KEY,JSON.stringify({code,expires:Date.now()+7*86400000}));}catch{/* The referral remains in the current link. */}return code;}
export function savedReferral():string {try{const data=JSON.parse(localStorage.getItem(KEY)??'null');return data&&data.expires>Date.now()?normalizeReferral(data.code)??'':'';}catch{return '';}}
export function clearReferral(){try{localStorage.removeItem(KEY);}catch{/* No saved referral. */}}
