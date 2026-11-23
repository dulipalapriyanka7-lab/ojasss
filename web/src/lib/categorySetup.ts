import type {Me} from '@/api';
export function categorySetupTarget(me:Pick<Me,'onboarded'|'category_preferences'|'city'> & {id?:string}|null|undefined,pathname:string,search=''):string|null {
 let chosen=false;try{chosen=!!me?.id&&sessionStorage.getItem('ojasss-category-session:'+me.id)==='chosen';}catch{/* Keep selection available when storage is blocked. */}
 if(!me?.onboarded||chosen||/^\/(categories|my-city|onboarding|login|register|forgot-password|reset-password|auth|google-sign-in)(\/|$)/.test(pathname))return null;
 // New sign-ins pick their city first, then categories.
 let skipCity=false;try{skipCity=!!sessionStorage.getItem('ojasss.citySkip');}catch{/* storage */}
 if(!me.city&&!skipCity)return '/my-city';
 return '/categories?next='+encodeURIComponent(pathname+search);
}
