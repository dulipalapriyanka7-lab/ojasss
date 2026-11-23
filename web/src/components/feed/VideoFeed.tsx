import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { Clapperboard } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PostCard } from '@/api';
import { Button, ButtonLink } from '../ui/Button';
import { EmptyState, ErrorState, PageLoader, Spinner } from '../ui/Feedback';
import { FEED_WINDOW, FeedItem } from './FeedItem';
import { postExpiry } from '@/lib/postExpiry';

const MUTE_KEY='ojasss-muted';
function readMuted():boolean {try{return sessionStorage.getItem(MUTE_KEY)!=='0';}catch{return true;}}
const visible=()=>document.visibilityState!=='hidden'&&!document.querySelector('[role="dialog"]');
type ConnectionInfo={saveData?:boolean;effectiveType?:string};
function conserveMobileData(){const connection=(navigator as Navigator&{connection?:ConnectionInfo}).connection;return !!connection?.saveData||connection?.effectiveType==='slow-2g'||connection?.effectiveType==='2g'||connection?.effectiveType==='3g';}

export function VideoFeed({query,emptyTitle,emptyDescription,cleanView=false,autoScroll=false,viralOnly=false}:{
 query:UseInfiniteQueryResult<InfiniteData<PostCard[],unknown>,Error>;
 emptyTitle:string;emptyDescription:string;cleanView?:boolean;autoScroll?:boolean;viralOnly?:boolean;
}) {
 const container=useRef<HTMLDivElement>(null);
 const [active,setActive]=useState(0),[muted,setMuted]=useState(readMuted),[now,setNow]=useState(Date.now);
 const [conserveData,setConserveData]=useState(conserveMobileData);
 const [completed,setCompleted]=useState<string|null>(null);
 const [playingId,setPlayingId]=useState<string|null>(null);
 const [direction,setDirection]=useState(1);
 const activeRef=useRef(0),held=useRef(false),settling=useRef(0);
 const items=useMemo(()=>{const seen=new Set<string>();return(query.data?.pages.flat()??[]).filter(p=>(!viralOnly||(p.one_chance_ready&&p.kind==='video'&&p.is_viral&&p.status==='published'))&&(postExpiry(p)??Infinity)>now&&(seen.has(p.id)?false:(seen.add(p.id),true)));},[query.data,now,viralOnly]);
 const {hasNextPage,isFetchingNextPage,fetchNextPage,isFetchNextPageError}=query;
 const activeId=items[active]?.id;
 useEffect(()=>{const connection=(navigator as Navigator&{connection?:ConnectionInfo&{addEventListener?:(type:string,listener:()=>void)=>void;removeEventListener?:(type:string,listener:()=>void)=>void}}).connection;const sync=()=>setConserveData(conserveMobileData());connection?.addEventListener?.('change',sync);return()=>connection?.removeEventListener?.('change',sync);},[]);
 useEffect(()=>{setCompleted(null);},[activeId,autoScroll]);
 // Expire posts at their deadline, without rebuilding every slide each second.
 useEffect(()=>{
  const expires=items.reduce((next,p)=>Math.min(next,postExpiry(p)??Infinity),Infinity);
  const timer=Number.isFinite(expires)?window.setTimeout(()=>setNow(Date.now()),Math.max(1,expires-Date.now()+25)):undefined;
  const refresh=()=>{if(document.visibilityState==='visible')setNow(Date.now());};
  document.addEventListener('visibilitychange',refresh);
  return()=>{window.clearTimeout(timer);document.removeEventListener('visibilitychange',refresh);};
 },[items]);
 const toggleMute=useCallback(()=>setMuted(m=>{try{sessionStorage.setItem(MUTE_KEY,m?'0':'1');}catch{/* optional */}return !m;}),[]);
 // Read scroll position once per animation frame, so fast swipes mount the next media
 // before IntersectionObserver's old 60% threshold would have activated it.
 useLayoutEffect(()=>{
  const root=container.current;if(!root)return;
  let frame=0,height=root.clientHeight;
  const sync=()=>{frame=0;const next=Math.max(0,Math.min(items.length-1,Math.round(root.scrollTop/Math.max(1,root.clientHeight))));if(next!==activeRef.current){setDirection(next>activeRef.current?1:-1);activeRef.current=next;setActive(next);}};
  const scroll=()=>{settling.current=Date.now()+180;if(!frame)frame=requestAnimationFrame(sync);};
  const resize=()=>{const next=root.clientHeight;if(next!==height){height=next;root.scrollTop=activeRef.current*height;}sync();};
  root.addEventListener('scroll',scroll,{passive:true});
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;observer?.observe(root);
  sync();return()=>{root.removeEventListener('scroll',scroll);observer?.disconnect();cancelAnimationFrame(frame);};
 },[items.length,query.isPending]);
 // Fetch the next page well before the viewer reaches the final clips. This hides
 // round-trip latency on mobile data without mounting additional videos.
 useEffect(()=>{if(items.length&&active>=items.length-6&&hasNextPage&&!isFetchingNextPage&&!isFetchNextPageError)void fetchNextPage();},[active,items.length,hasNextPage,isFetchingNextPage,isFetchNextPageError,fetchNextPage]);
 const go=useCallback((delta:number)=>{
  const root=container.current;if(!root)return;
  const next=Math.max(0,Math.min(items.length-1,activeRef.current+delta));
  root.scrollTo({top:next*root.clientHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 },[items.length]);
 const ended=useCallback((id:string)=>setCompleted(id),[]);
 const playing=useCallback((id:string)=>setPlayingId(id),[]);
 const warmIndex=items[active+direction]?active+direction:active-direction;
 // A finished clip waits for open comments/dialogs and any in-progress swipe. If the
 // next page is still downloading, the same completion resumes when it arrives.
 useEffect(()=>{
  // One Chance always moves on when a video ends, so the loop never freezes on a last frame.
  if(!(autoScroll||viralOnly)||!completed||completed!==activeId)return;
  const advance=()=>{
   if(!visible()||held.current||Date.now()<settling.current)return;
   if(activeRef.current<items.length-1){setCompleted(null);go(1);}
   // One Chance loops: after the last Viral video, reload (so newly Viral videos join) and start again.
   else if(viralOnly&&!hasNextPage&&!isFetchingNextPage){setCompleted(null);void query.refetch();const root=container.current;if(root&&items.length>1)root.scrollTo({top:0,behavior:'instant'});}
  };
  advance();const timer=window.setInterval(advance,250);return()=>clearInterval(timer);
 },[autoScroll,completed,activeId,items.length,go,viralOnly,hasNextPage,isFetchingNextPage,query]);
 // Episode taps inside One Chance scroll to that video in this feed (handled = event cancelled).
 useEffect(()=>{if(!viralOnly)return;const onJump=(e:Event)=>{const id=(e as CustomEvent<{id:string}>).detail?.id;const index=items.findIndex(p=>p.id===id);const root=container.current;if(index<0||!root)return;e.preventDefault();root.scrollTo({top:index*root.clientHeight,behavior:'smooth'});};window.addEventListener('oj-feed-jump',onJump);return()=>window.removeEventListener('oj-feed-jump',onJump);},[viralOnly,items]);
 // Keep the One Chance loop fresh so videos that just went Viral join without a reload.
 useEffect(()=>{if(!viralOnly)return;const timer=window.setInterval(()=>{if(visible())void query.refetch();},60_000);return()=>clearInterval(timer);},[viralOnly,query]);
 // Posters receive eight seconds of actual, visible viewing in auto-scroll mode.
 useEffect(()=>{
  if(!autoScroll||items[active]?.kind!=='poster'||(active===items.length-1&&!hasNextPage))return;
  let elapsed=0,last=performance.now();
  const timer=window.setInterval(()=>{const current=performance.now();if(visible()&&!held.current&&Date.now()>=settling.current)elapsed+=Math.min(current-last,500);last=current;if(elapsed>=8000){clearInterval(timer);setCompleted(activeId??null);}},250);
  return()=>clearInterval(timer);
 },[autoScroll,activeId,active,hasNextPage,items.length]);
 const onKeyDown=(e:React.KeyboardEvent)=>{
  if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))return;
  if(['ArrowDown','j','PageDown'].includes(e.key)){e.preventDefault();go(1);}
  else if(['ArrowUp','k','PageUp'].includes(e.key)){e.preventDefault();go(-1);}
  else if(e.key==='m')toggleMute();
 };
 if(query.isPending)return <div className="flex h-feed items-center justify-center bg-bg" aria-label="Loading feed"><PageLoader label="Loading feed" nativeReady={false}/></div>;
 if(query.isError&&!query.data)return <div className="flex h-feed items-center justify-center px-4"><ErrorState error={query.error} onRetry={()=>void query.refetch()}/></div>;
 if(!items.length)return <div className="flex h-feed items-center justify-center px-4"><EmptyState icon={Clapperboard} title={emptyTitle} description={emptyDescription} action={<>{!viralOnly&&<ButtonLink to="/upload">Create a post</ButtonLink>}<ButtonLink to="/" variant="secondary">Home</ButtonLink></>}/></div>;
 return <div className="relative">
  <div ref={container} tabIndex={0} onKeyDown={onKeyDown} onPointerDown={()=>{held.current=true;}} onPointerUp={()=>{held.current=false;}} onPointerCancel={()=>{held.current=false;}} onPointerLeave={()=>{held.current=false;}}
   aria-label="Feed. Swipe up for the next post, down for the previous post. Use arrow keys or M to mute."
   className="h-feed snap-y snap-mandatory overflow-y-auto overscroll-contain scrollbar-none outline-none [overflow-anchor:none] [-webkit-overflow-scrolling:touch]">
   {items.map((post,index)=>Math.abs(index-active)<=FEED_WINDOW?<FeedItem key={post.id} post={post} index={index} distance={Math.abs(index-active)} preloadNext={index===warmIndex&&!conserveData&&(playingId===activeId||items[active]?.kind==='poster')} muted={muted} onToggleMute={toggleMute} cleanView={cleanView} oneChance={viralOnly} autoScroll={autoScroll&&(index<items.length-1||!!hasNextPage)} onMediaEnded={ended} onMediaPlaying={playing}/>:<section key={post.id} data-index={index} aria-hidden className="h-feed w-full snap-start snap-always md:snap-normal bg-black"/>)}
  </div>
  {active>=items.length-1&&isFetchingNextPage&&<div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center" role="status" aria-label="Loading next posts"><Spinner/></div>}
  {active>=items.length-1&&isFetchNextPageError&&<div className="absolute inset-x-0 bottom-24 flex justify-center"><Button variant="secondary" onClick={()=>void fetchNextPage()}>Retry loading next posts</Button></div>}
 </div>;
}
