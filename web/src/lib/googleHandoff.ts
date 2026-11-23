import {ApiError} from '@/api/client';
import {supabase} from './supabase';
import {platform} from './platform';
import {safeInternalPath} from './utils';
const KEY='ojasss-google-handoff-v1';
interface Pending {flow:string;verifier:string;expiresAt:number;next:string;}
export async function googleRequest(path:string,body:object){const response=await fetch('/api/auth/v1/google/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new ApiError('validation',data.error_code??'GOOGLE_AUTH_FAILED',data.message??'Google sign-in failed.',response.status);return data;}
export async function installGoogleSession(session:{access_token:string;refresh_token:string}){const{error}=await supabase.auth.setSession(session);if(error)throw new ApiError('validation','GOOGLE_AUTH_FAILED',error.message);}
export function pendingGoogleHandoff():Pending|null{try{const raw=localStorage.getItem(KEY);if(!raw)return null;const value=JSON.parse(raw);if(!/^[a-f0-9]{48}$/.test(value.flow)||!/^[a-f0-9]{64}$/.test(value.verifier)||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()){localStorage.removeItem(KEY);return null;}return{...value,next:safeInternalPath(value.next)};}catch{return null;}}
let flight:Promise<void>|null=null;
async function redeem(expectedFlow?:string){const pending=pendingGoogleHandoff();if(!pending){const{data}=await supabase.auth.getSession();if(data.session)return;throw new ApiError('validation','GOOGLE_AUTH_EXPIRED','Start Google sign-in again from the OJASSS app.');}if(expectedFlow&&expectedFlow!==pending.flow)throw new ApiError('validation','GOOGLE_AUTH_MISMATCH','This sign-in belongs to a different request.');
 while(Date.now()<pending.expiresAt){const result=await googleRequest('poll',{flow:pending.flow,verifier:pending.verifier});if(result.ready){await installGoogleSession(result.session);localStorage.removeItem(KEY);await googleRequest('ack',{flow:pending.flow,verifier:pending.verifier}).catch(()=>undefined);return;}await new Promise(resolve=>window.setTimeout(resolve,1500));}
 localStorage.removeItem(KEY);throw new ApiError('validation','GOOGLE_AUTH_TIMEOUT','Google sign-in timed out. Please try again.');
}
export function resumeGoogleHandoff(expectedFlow?:string):Promise<void>{const pending=pendingGoogleHandoff();if(expectedFlow&&pending&&pending.flow!==expectedFlow)return Promise.reject(new ApiError('validation','GOOGLE_AUTH_MISMATCH','This sign-in belongs to a different request.'));if(flight)return flight;flight=redeem(expectedFlow).finally(()=>{flight=null;});return flight;}
export function startGoogleHandoff(next='/'):Promise<void>{
 if(flight)return flight;flight=(async()=>{let pending=pendingGoogleHandoff();if(!pending){const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');const challenge=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),b=>b.toString(16).padStart(2,'0')).join('');const{flow}=await googleRequest('start',{challenge});pending={flow,verifier,expiresAt:Date.now()+300000,next:safeInternalPath(next)};localStorage.setItem(KEY,JSON.stringify(pending));}
 platform.openExternal(location.origin+'/google-sign-in?flow='+encodeURIComponent(pending.flow)+'&next='+encodeURIComponent(pending.next));await redeem(pending.flow);})().finally(()=>{flight=null;});return flight;
}
