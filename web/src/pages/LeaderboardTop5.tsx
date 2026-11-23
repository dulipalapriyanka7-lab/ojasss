import {Link} from 'react-router-dom';
import {Check, Clock, Crown, Eye, Heart, Lock, Trophy, Video} from 'lucide-react';
import type {CompetitionEntry} from '@/api/competition';
import {Avatar} from '@/components/ui/Misc';
import {LiveMetric} from '@/components/profile/LiveMetric';
import './leaderboard-top5.css';

const TIERS=[{name:'GOLD',c:'#f5c542'},{name:'SILVER',c:'#d6dbe3'},{name:'PLATINUM',c:'#38d6ff'},{name:'EMERALD',c:'#2fd47f'},{name:'BRONZE',c:'#e08a3c'}];
const hm=(s:number)=>{const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`:`${m}m`;};

function Lau(){return <svg viewBox="0 0 22 40"><path d="M16 38C6 32 3 20 8 4" fill="none" stroke="currentColor" strokeWidth="1.6"/>{[8,15,22,29].map((y,i)=>{const x=i<2?5+i:7+i;return <ellipse key={y} cx={x} cy={y} rx="2.6" ry="5" fill="currentColor" transform={`rotate(-30 ${x} ${y})`}/>;})}</svg>;}

function Wreath({rank,c}:{rank:number;c:string}){
 return <span className="t5-wreath" style={{'--tc':c} as React.CSSProperties}>
  {rank<=3&&<Crown className="t5-crown" aria-hidden size={26} fill="currentColor" strokeWidth={1.2}/>}
  {rank<=3&&<svg className="t5-laurel" viewBox="0 0 60 50" aria-hidden><g fill="currentColor">{[0,1,2,3].map(i=><g key={i}><ellipse cx={9+i*1.2} cy={40-i*9} rx="3.2" ry="6" transform={`rotate(${-35+i*12} ${9+i*1.2} ${40-i*9})`}/><ellipse cx={51-i*1.2} cy={40-i*9} rx="3.2" ry="6" transform={`rotate(${35-i*12} ${51-i*1.2} ${40-i*9})`}/></g>)}</g></svg>}
  <b>{rank}</b>
 </span>;
}

export function Top5Board({groups,targets,unit,onTabs}:{groups:CompetitionEntry[][];targets:number[];unit:string;onTabs?:React.ReactNode}){
 return <section className="t5" aria-label="Top 5 creators this week">
  {onTabs}
  <div className="t5-title"><span className="t5-lau l" aria-hidden><Lau/></span><Trophy className="t5-trophy" aria-hidden size={40} fill="currentColor" strokeWidth={1.2}/><div><h2>Top 5 Creators This Week</h2><p>Rank • Videos • Votes • Views • Active Time</p></div><span className="t5-lau r" aria-hidden><Lau/></span></div>
  <div className="t5-list">{TIERS.map((t,i)=>{const e=groups[i]?.[0];const style={'--tc':t.c} as React.CSSProperties;
   return <article key={t.name} className={'t5-card'+(e?'':' is-empty')} style={style}>
    <Wreath rank={i+1} c={t.c}/>
    {e?<><Link to={'/profile/'+e.username} className="t5-av"><Avatar size={52} path={e.avatar_path} name={e.display_name||e.username}/></Link>
     <div className="t5-info"><Link to={'/profile/'+e.username} className="t5-name">@{e.username}</Link>
      <div className="t5-met"><span><Heart className="hrt" fill="currentColor" aria-label="Votes"/><LiveMetric value={e.votes}/></span><span><Eye aria-label="Views"/><LiveMetric value={e.views}/></span><span><Video aria-label="Videos"/>{e.video_count}</span><span><Clock aria-label="Active time"/>{hm(e.seconds)}</span></div></div></>
     :<div className="t5-info"><span className="t5-lock"><Lock size={14}/>Reach {targets[i]} {unit} to unlock</span></div>}
    <span className="t5-pill">{t.name}</span>
   </article>;})}</div>
  <div className="t5-strip">{TIERS.map((t,i)=>{const done=!!groups[i]?.length;return <div key={t.name} style={{'--tc':t.c} as React.CSSProperties}>
   <span className="t5-medal"><i/><b>{i+1}</b></span><strong>{t.name}</strong>
   {done?<small className="ok"><Check size={14} strokeWidth={3}/>Unlocked</small>:<small>Reach {targets[i]}<br/>{unit}</small>}
  </div>;})}</div>
 </section>;
}

export function TopUsersBar({entries,total,onMore}:{entries:CompetitionEntry[];total:number;onMore:()=>void}){
 if(!total)return null;
 return <div className="t5-more"><span className="t5-stack">{entries.slice(0,3).map(e=><Avatar key={e.user_id} size={52} path={e.avatar_path} name={e.display_name||e.username}/>)}</span><b>{total} top users</b><button type="button" onClick={onMore}>View more →</button></div>;
}
