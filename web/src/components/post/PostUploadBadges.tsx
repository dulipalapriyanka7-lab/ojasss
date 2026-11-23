import {useEffect,useState} from 'react';
import type {PostCard} from '@/api';
import {postExpiry,remainingTime} from '@/lib/postExpiry';
export function PostUploadBadges({post}:{post:PostCard}){
 const expires=postExpiry(post);const[now,setNow]=useState(Date.now);
 useEffect(()=>{if(expires===null)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[expires]);
 if(!post.content_origin&&expires===null)return null;
 return <div className="post-upload-badges mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-white">{post.content_origin==='copy_paste'&&<span className="rounded-full border border-white/20 bg-gradient-to-r from-purple-500/40 to-pink-500/30 px-2 py-1 backdrop-blur-md">Copy-Paste</span>}{post.content_origin==='new_content'&&<span className="rounded-full border border-emerald-200/25 bg-gradient-to-r from-emerald-500/45 via-teal-500/35 to-cyan-500/35 px-2 py-1 backdrop-blur-md">New Content</span>}{expires!==null&&<time dateTime={new Date(expires).toISOString()} aria-label="Time remaining" className="post-expiry-timer rounded-full border border-amber-300/25 bg-black/35 px-2 py-1 tabular-nums backdrop-blur-md">{remainingTime(expires,now)} left</time>}</div>;
}
