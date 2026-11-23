import {useEffect, useRef, useState} from 'react';
import {rpc} from '@/api/client';

type Poll={me:string;peers:{id:string;username:string}[];signals:{from:string;type:'offer'|'answer'|'ice'|'bye';data:unknown}[]};
const ICE:RTCConfiguration={iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]};

/** Peer-to-peer voice between players who turned their mic on. Signalling goes through the OJASSS API. */
export function useGameVoice(enabled:boolean){
 const [peers,setPeers]=useState<{id:string;username:string;connected:boolean}[]>([]);
 const [muted,setMuted]=useState(false);const [error,setError]=useState('');
 const stream=useRef<MediaStream|null>(null);const conns=useRef(new Map<string,RTCPeerConnection>());const audios=useRef(new Map<string,HTMLAudioElement>());
 useEffect(()=>{stream.current?.getAudioTracks().forEach(t=>{t.enabled=!muted;});},[muted]);
 useEffect(()=>{
  if(!enabled)return;
  let stop=false;let me='';
  const send=(to:string,type:string,data:unknown)=>rpc('monster_game_voice_signal',{to,type,data}).catch(()=>{});
  const close=(id:string)=>{conns.current.get(id)?.close();conns.current.delete(id);const a=audios.current.get(id);if(a){a.srcObject=null;a.remove();}audios.current.delete(id);};
  const connect=(id:string)=>{
   let pc=conns.current.get(id);if(pc)return pc;
   pc=new RTCPeerConnection(ICE);conns.current.set(id,pc);
   stream.current?.getTracks().forEach(t=>pc!.addTrack(t,stream.current!));
   pc.onicecandidate=e=>{if(e.candidate)void send(id,'ice',e.candidate.toJSON());};
   pc.ontrack=e=>{let a=audios.current.get(id);if(!a){a=new Audio();a.autoplay=true;audios.current.set(id,a);}a.srcObject=e.streams[0];void a.play().catch(()=>{});};
   pc.onconnectionstatechange=()=>{if(pc!.connectionState==='failed'||pc!.connectionState==='closed')close(id);setPeers(p=>p.map(x=>x.id===id?{...x,connected:pc!.connectionState==='connected'}:x));};
   return pc;
  };
  (async()=>{
   try{stream.current=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}
   catch{setError('Microphone permission was blocked. Allow it in your browser or app settings.');return;}
   let first=true;
   while(!stop){
    try{
     const r=await rpc<Poll>('monster_game_voice_poll',first?{on:true}:{});first=false;me=r.me;
     for(const s of r.signals){
      if(s.type==='bye'){close(s.from);continue;}
      const pc=connect(s.from);
      if(s.type==='offer'){await pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);const ans=await pc.createAnswer();await pc.setLocalDescription(ans);void send(s.from,'answer',ans);}
      else if(s.type==='answer'&&pc.signalingState==='have-local-offer')await pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
      else if(s.type==='ice'){try{await pc.addIceCandidate(s.data as RTCIceCandidateInit);}catch{/* late candidate */}}
     }
     const ids=new Set(r.peers.map(p=>p.id));
     for(const id of [...conns.current.keys()])if(!ids.has(id))close(id);
     for(const p of r.peers)if(!conns.current.has(p.id)&&me<p.id){const pc=connect(p.id);const off=await pc.createOffer();await pc.setLocalDescription(off);void send(p.id,'offer',off);}
     setPeers(r.peers.map(p=>({...p,connected:conns.current.get(p.id)?.connectionState==='connected'})));
    }catch{/* keep polling */}
    await new Promise(res=>setTimeout(res,1200));
   }
  })();
  return()=>{stop=true;for(const id of [...conns.current.keys()]){void send(id,'bye',null);close(id);}
   void rpc('monster_game_voice_poll',{on:false}).catch(()=>{});stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setPeers([]);};
 },[enabled]);
 return {peers,muted,setMuted,error};
}
