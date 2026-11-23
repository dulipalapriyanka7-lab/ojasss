import {useQuery} from '@tanstack/react-query';
import {MessageCircle, Mic, MicOff, Send, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {rpc} from '@/api/client';
import {useGameVoice} from './useGameVoice';
import {Avatar} from '@/components/ui/Misc';
import './game-room.css';

type Room={players:{id:string;username:string;avatar_path:string|null}[];messages:{id:string;username:string;text:string;created_at:string}[]};
const KEY='ojasss.gameMic';
const readPref=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
const savePref=(v:'on'|'off')=>{try{localStorage.setItem(KEY,v);}catch{/* private mode */}};

/** Slim overlay on the running game: live count, optional voice (mic off unless the player turns it on) and text chat. */
export function GameRoomChat(){
 const [open,setOpen]=useState(false);const [text,setText]=useState('');const [busy,setBusy]=useState(false);
 const [mic,setMic]=useState(()=>readPref()==='on');const [ask,setAsk]=useState(()=>readPref()===null);
 const voice=useGameVoice(mic);
 const q=useQuery({queryKey:['monster-room'],queryFn:()=>rpc<Room>('monster_game_room'),refetchInterval:open?3000:10000,retry:false});
 const seen=useRef(0);const [unread,setUnread]=useState(0);const list=useRef<HTMLDivElement>(null);
 const msgs=q.data?.messages??[];
 useEffect(()=>{if(open){seen.current=msgs.length;setUnread(0);list.current?.scrollTo({top:1e6});}else setUnread(Math.max(0,msgs.length-seen.current));},[msgs.length,open]);
 const send=async()=>{const t=text.trim();if(!t||busy)return;setBusy(true);try{await rpc('monster_game_chat_send',{text:t});setText('');await q.refetch();}finally{setBusy(false);}};
 const setMicPref=(on:boolean)=>{setMic(on);savePref(on?'on':'off');setAsk(false);};
 if(!q.data)return null;
 const live=q.data.players.length;const talking=voice.peers.filter(p=>p.connected).length;
 return <div className="grc">
  <div className="grc-bar">
   <button type="button" className="grc-chip" onClick={()=>setOpen(o=>!o)} aria-expanded={open} aria-label="Live players and chat"><i className="grc-dot"/><span className="grc-faces">{q.data.players.slice(0,4).map(p=><Avatar key={p.id} size={18} path={p.avatar_path} name={p.username}/>)}</span>{live} live<MessageCircle size={12}/>{unread>0&&!open&&<b className="grc-badge">{unread}</b>}</button>
   <button type="button" className={'grc-chip grc-mic'+(mic&&!voice.muted?' is-on':'')} aria-label={mic?(voice.muted?'Unmute mic':'Mute mic'):'Turn on mic'} onClick={()=>{if(!mic)setMicPref(true);else voice.setMuted(m=>!m);}}>
    {mic&&!voice.muted?<Mic size={12}/>:<MicOff size={12}/>}{mic?(talking?`${talking} talking`:'Voice on'):'Mic off'}
   </button>
  </div>
  {ask&&<div className="grc-ask"><Mic size={14}/><span>Talk with other players? Turn on your mic. You can turn it off anytime.</span><div><button type="button" className="ok" onClick={()=>setMicPref(true)}>Turn on</button><button type="button" onClick={()=>setMicPref(false)}>Not now</button></div></div>}
  {voice.error&&mic&&<div className="grc-ask grc-err"><span>{voice.error}</span><div><button type="button" onClick={()=>setMicPref(false)}>OK</button></div></div>}
  {open&&<div className="grc-panel">
   <div className="grc-top"><span>{live} playing now{mic?` · voice ${voice.peers.length}`:''}</span>{mic&&<button type="button" className="grc-off" onClick={()=>setMicPref(false)}>Leave voice</button>}<button type="button" aria-label="Close chat" onClick={()=>setOpen(false)}><X size={14}/></button></div>
   <div className="grc-online">{q.data.players.map(p=><span key={p.id} title={'@'+p.username}><Avatar size={22} path={p.avatar_path} name={p.username}/><i className={voice.peers.some(v=>v.id===p.id)?'v':''}/><small>{p.username}</small></span>)}</div>
   <div className="grc-list" ref={list}>{msgs.length?msgs.map(m=><p key={m.id}><b>@{m.username}</b> {m.text}</p>):<p className="grc-empty">Say hi to the other players.</p>}</div>
   <form className="grc-form" onSubmit={e=>{e.preventDefault();void send();}}><input value={text} onChange={e=>setText(e.target.value)} maxLength={160} placeholder="Message players…" aria-label="Chat message"/><button type="submit" disabled={busy||!text.trim()} aria-label="Send"><Send size={14}/></button></form>
  </div>}
 </div>;
}
