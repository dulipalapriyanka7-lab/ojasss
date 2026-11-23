import {useEffect,useRef,useState} from 'react';
import {platform} from '@/lib/platform';
interface Recognition {
 lang:string;continuous:boolean;interimResults:boolean;
 onresult:((e:{resultIndex:number;results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>})=>void)|null;
 onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;
 start():void;stop():void;abort():void;
}
type SpeechWindow=Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
export function speechLocale(language:string):string {
 const regions:Record<string,string>={en:'en-IN',te:'te-IN',hi:'hi-IN',ta:'ta-IN',kn:'kn-IN',ml:'ml-IN',mr:'mr-IN',gu:'gu-IN',bn:'bn-IN',pa:'pa-IN',ur:'ur-IN',or:'or-IN',as:'as-IN',zh:'zh-CN',ar:'ar-SA',pt:'pt-BR',es:'es-ES',fr:'fr-FR'};
 return regions[language]??language;
}
interface VoiceSession {stop:()=>void;cancel:()=>void;}
export function useVoiceTyping(language:string,onText:(text:string)=>void){
 const [listening,setListening]=useState(false),[finishing,setFinishing]=useState(false),[interim,setInterim]=useState(''),[error,setError]=useState('');
 const session=useRef<VoiceSession|null>(null),callback=useRef(onText);callback.current=onText;
 useEffect(()=>()=>session.current?.cancel(),[]);
 const start=()=>{
  session.current?.cancel();setError('');setInterim('');setFinishing(false);setListening(true);
  let active=true,wanted=true,pendingFinish=false,running=false;
  let restart:number|undefined,finishTimer:number|undefined,capTimer:number|undefined;
  let nativeId:string|null=null,recognition:Recognition|null=null,unsubscribe=()=>{};
  const segments:string[]=[];let partial='';
  const preview=()=>[...segments,partial.trim()].filter(Boolean).join(' ');
  const paint=()=>{if(active)setInterim(preview());};
  const addFinal=(text:string)=>{if(text.trim())segments.push(text.trim());partial='';paint();};
  const dispose=()=>{
   if(!active)return;active=false;wanted=false;window.clearTimeout(restart);window.clearTimeout(finishTimer);window.clearTimeout(capTimer);unsubscribe();
   if(nativeId)platform.send({type:'speech_cancel',requestId:nativeId});
   if(recognition){recognition.onend=null;recognition.onresult=null;recognition.onerror=null;recognition.abort();}
   if(session.current===controller)session.current=null;
  };
  const finish=(message?:string)=>{
   if(!active)return;const text=preview();dispose();setListening(false);setFinishing(false);setInterim('');setError(message??(text?'':'No words were recognized. Please try again.'));
   if(text)callback.current(text);
  };
  const controller:VoiceSession={
   stop(){
    if(!active||pendingFinish)return;pendingFinish=true;wanted=false;window.clearTimeout(restart);setFinishing(true);
    if(!running){finish();return;}
    finishTimer=window.setTimeout(()=>finish(),2500);
    if(nativeId)platform.send({type:'speech_stop',requestId:nativeId});else recognition?.stop();
   },
   cancel(){dispose();setListening(false);setFinishing(false);setInterim('');},
  };
  session.current=controller;
  if(platform.isAndroidApp()){
   const requestId=crypto.randomUUID();nativeId=requestId;
   let started=false;
   const begin=()=>{if(!active||!wanted||running)return;if(started)nativeId=crypto.randomUUID();started=true;running=true;platform.send({type:'speech_start',requestId:nativeId,language:speechLocale(language)});};
   capTimer=window.setTimeout(()=>finish('Update the OJASSS APK to use voice typing, or use your keyboard microphone.'),2500);
   unsubscribe=platform.on(e=>{
    if(!active||(e.type!=='speech_capabilities'&&e.type!=='speech_result'&&e.type!=='speech_partial')||e.requestId!==(e.type==='speech_capabilities'?requestId:nativeId))return;
    window.clearTimeout(capTimer);
    if(e.type==='speech_capabilities'){
     if(started)return;
     if(!e.internal){finish('Install OJASSS 1.0.4 or newer to record inside the app.');return;}
     if(!e.available){finish('Speech recognition is unavailable on this phone. You can use your keyboard microphone.');return;}
     begin();return;
    }
    if(e.type==='speech_partial'){if(running){partial=e.text;paint();}return;}
    if(!running)return;
    running=false;
    if(e.text)addFinal(e.text);
    if(pendingFinish){finish(e.error&&e.error!=='cancelled'&&!e.error.startsWith('No speech detected')?e.error:undefined);return;}
    if(wanted&&(!e.error||e.error.startsWith('No speech detected'))){if(partial)addFinal(partial);restart=window.setTimeout(begin,250);return;}
    finish(e.error&&e.error!=='cancelled'?e.error:undefined);
   });
   platform.send({type:'speech_capabilities',requestId});return;
  }
  const Speech=(window as SpeechWindow).SpeechRecognition??(window as SpeechWindow).webkitSpeechRecognition;
  if(!Speech){finish('Voice typing is unavailable in this browser. Try Chrome or your keyboard microphone.');return;}
  const begin=()=>{
   if(!active||!wanted||running)return;
   const r=new Speech();recognition=r;r.lang=speechLocale(language);r.continuous=true;r.interimResults=true;
   const offset=segments.length;
   const current=()=>active&&recognition===r&&running;
   r.onresult=e=>{
    if(!current())return;
    // Browser results are a cumulative snapshot, including revisions of earlier words.
    // Replace this recognition cycle's text instead of appending repeated callbacks.
    const finals:string[]=[],draft:string[]=[];
    for(let i=0;i<e.results.length;i++){const result=e.results[i];const text=result[0].transcript.trim();if(text)(result.isFinal?finals:draft).push(text);}
    segments.splice(offset,segments.length-offset,...finals);partial=draft.join(' ');paint();
   };
   r.onerror=e=>{
    if(!current())return;if(e.error==='no-speech'){if(pendingFinish)finish();return;}
    finish(e.error==='not-allowed'?'Microphone permission was denied. Allow microphone access to use voice typing.':e.error==='language-not-supported'?'This language is unavailable in your speech service. Choose another language or type your message.':'Voice typing stopped. Check your connection and try again.');
   };
   r.onend=()=>{if(!current())return;running=false;r.onresult=null;r.onerror=null;r.onend=null;if(pendingFinish){finish();return;}if(wanted){if(partial)addFinal(partial);restart=window.setTimeout(begin,250);}};
   running=true;try{r.start();}catch{finish('Could not start voice typing. Please try again.');}
  };
  begin();
 };
 return {listening,finishing,interim,error,start,stop:()=>session.current?.stop(),cancel:()=>session.current?.cancel()};
}
