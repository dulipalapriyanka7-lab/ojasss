import {messages,posts} from '@/api';
import {LeaderboardDemo} from '@/components/feed/LeaderboardDemo';
import {useEffect,useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link,useNavigate} from 'react-router-dom';
import {MessageCircle,Trophy,Vote,Eye} from 'lucide-react';
import {discovery} from '@/api/discovery';
import {Page} from '@/components/layout/AppShell';
import {ErrorState,Skeleton} from '@/components/ui/Feedback';
import {Avatar} from '@/components/ui/Misc';
import {useToast} from '@/components/ui/Toast';
import {count} from '@/lib/format';
import './leaderboard-tiers.css';

const TIERS=[{key:'gold',name:'Gold'},{key:'silver',name:'Silver'},{key:'emerald',name:'Emerald'},{key:'platinum',name:'Platinum'},{key:'bronze',name:'Bronze'}] as const;
type Entry={post:import('@/api').PostCard;votes:number;rank:number};
function Crest({rank}:{rank:number}){return <svg viewBox="0 0 64 72" className="lt-crest" aria-hidden><defs><linearGradient id={`lt-c${rank}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--lt-hi)"/><stop offset=".45" stopColor="var(--lt-mid)"/><stop offset="1" stopColor="var(--lt-lo)"/></linearGradient></defs><path d="M32 2 60 14v22c0 17-12 28-28 34C16 64 4 53 4 36V14Z" fill={`url(#lt-c${rank})`} stroke="rgba(255,255,255,.55)" strokeWidth="1.5"/><path d="M32 8 54 18v18c0 13-9 22-22 27C19 58 10 49 10 36V18Z" fill="none" stroke="rgba(0,0,0,.18)"/><text x="32" y="44" textAnchor="middle" className="lt-crest-num">{rank}</text></svg>;}
function LeaderTiers({entries}:{entries:Entry[]}){
 const top=TIERS.map((t,i)=>({t,rank:i+1,e:entries.find(x=>x.rank===i+1)}));const rest=entries.filter(x=>x.rank>5);
 return <><ol className="lt-stack">{top.map(({t,rank,e})=><li key={t.key} className={`lt-card lt-${t.key}`}>{e?<Link to={'/post/'+e.post.id} className="lt-inner"><Crest rank={rank}/><span className="lt-avatar"><Avatar path={e.post.author_avatar_path} name={e.post.author_display_name||e.post.author_username} size={44}/></span><span className="lt-body"><span className="lt-tier">{t.name} · Position {rank}</span><b className="lt-name">{e.post.author_display_name||'@'+e.post.author_username}</b><span className="lt-stats"><span><Vote size={12}/>{count(e.votes)}</span><span><Eye size={12}/>{count(e.post.views_count)}</span></span></span></Link>:<div className="lt-inner lt-empty"><Crest rank={rank}/><span className="lt-body"><span className="lt-tier">{t.name} · Position {rank}</span><b className="lt-name">Open position</b><span className="lt-stats">Get votes on a Viral video to claim it</span></span></div>}</li>)}</ol>
 {!!rest.length&&<ol className="lt-rest">{rest.map(e=><li key={e.post.id}><Link to={'/post/'+e.post.id}><span className="lt-rest-rank">{e.rank}</span><Avatar path={e.post.author_avatar_path} name={e.post.author_display_name||e.post.author_username} size={34}/><span className="min-w-0 flex-1 truncate text-sm font-semibold">@{e.post.author_username}</span><span className="lt-rest-votes"><Vote size={12}/>{count(e.votes)}</span></Link></li>)}</ol>}</>;
}

function weeklyLeft(){const now=new Date();const end=new Date(now);const day=(now.getDay()+6)%7;end.setDate(now.getDate()-day+7);end.setHours(0,0,0,0);const seconds=Math.max(0,Math.floor((end.getTime()-now.getTime())/1000));return `${String(Math.floor(seconds/86400)).padStart(2,'0')}d ${String(Math.floor(seconds%86400/3600)).padStart(2,'0')}h ${String(Math.floor(seconds%3600/60)).padStart(2,'0')}m`;}

export default function LeaderboardPage(){
 const navigate=useNavigate(),toast=useToast();const [now,setNow]=useState(Date.now());
 const query=useQuery({queryKey:['leaderboard','weekly'],queryFn:()=>discovery.leaderboard('weekly'),staleTime:30000,refetchInterval:30000});
 const eligible=useQuery({queryKey:['one-chance-demo-eligibility'],queryFn:()=>posts.feed({mode:'for_you',category:'one_chance',limit:1}),enabled:query.isSuccess&&query.data.entries.length===0,staleTime:30000});
 useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),60000);return()=>window.clearInterval(id);},[]);
 const timer=useMemo(()=>weeklyLeft(),[now]);
 const join=async()=>{try{navigate(`/messages/${await messages.joinOneChanceChat()}`);}catch(error){toast.error(error);}};
 return <Page><header className="mb-4 flex items-center gap-3"><span className="leaderboard-shine flex size-11 items-center justify-center rounded-2xl"><Trophy size={23}/></span><div className="min-w-0 flex-1"><h1 className="text-xl font-bold">One Chance Leaders</h1><p className="text-xs text-fg-3">Votes decide this week’s positions</p></div><button type="button" onClick={()=>void join()} className="leaderboard-chat-button" aria-label="Open One Chance group chat"><MessageCircle size={16}/><span>Group chat</span></button></header>
 <div className="weekly-leader-timer mb-4"><span className="weekly-leader-timer-dot"/><span>Weekly voting closes in</span><b>{timer}</b></div>
 <p className="mb-4 text-xs text-fg-3">One vote per member per Viral video. Equal votes are ordered by the earliest Viral time.</p>
 {query.isPending?<Skeleton className="h-40 rounded-2xl"/>:query.isError?<ErrorState error={query.error} onRetry={()=>void query.refetch()}/>:!query.data.entries.length?(eligible.isPending?<Skeleton className="h-40 rounded-2xl"/>:eligible.isError?<ErrorState error={eligible.error} onRetry={()=>void eligible.refetch()} compact/>:eligible.data.length===0?<LeaderboardDemo/>:<LeaderTiers entries={[]}/>):<LeaderTiers entries={query.data.entries}/>}
 </Page>;
}
