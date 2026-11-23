import {useCategoryLabel} from '@/hooks/useCategories';
import {CalendarDays,Globe2,Languages,MapPin,Music2,Flame,Mic,Send,Eye,ExternalLink,ShieldCheck,Copy} from 'lucide-react';
import type {PostCard} from '@/api';
import {COUNTRIES,languageLabel} from '@/lib/constants';
import {usePlaceLabel} from '@/lib/location';
import {dateTime,count} from '@/lib/format';
import {mediaUrl} from '@/lib/media';
import {Dialog} from '../ui/Overlay';
import {Button,ButtonLink} from '../ui/Button';
import {CreatorRow,Caption,CtaButton} from './PostMeta';
export function PostDetailsSheet({post,open,onClose}:{post:PostCard;open:boolean;onClose:()=>void}){
  const categoryLabel=useCategoryLabel();
 const place=usePlaceLabel(open?post.location:null);const image=mediaUrl(post.thumbnail_path??(post.kind==='poster'?post.media_path:null));
 const facts=[{label:'Uploaded',value:dateTime(post.created_at),icon:CalendarDays},{label:'Language',value:languageLabel(post.language),icon:Languages},{label:'Country',value:COUNTRIES.find(c=>c.value===post.country)?.label??post.country,icon:Globe2},...(post.location?[{label:'Location',value:place,icon:MapPin}]:[])];
 return <Dialog open={open} onClose={onClose} title="Behind this post" size="md" className="ojass-glass-sheet" footer={<><Button variant="ghost" size="sm" onClick={onClose}>Close</Button><ButtonLink size="sm" to={'/post/'+post.id} onClick={onClose} leading={<ExternalLink size={14}/>}>Open full post</ButtonLink></>}>
  <div className="speak-glass-banner mb-4"><img src={image??'/brand/mark.png'} alt="" className="relative h-12 w-10 shrink-0 rounded-lg bg-white/10 object-cover"/><div className="relative min-w-0"><p className="text-xs font-medium text-white/90">{categoryLabel(post.category)}</p><p className="truncate text-sm font-semibold">{post.kind==='video'?'A story in motion':'A moment worth sharing'}</p></div></div>
  <CreatorRow post={post}/><div className="mt-4 rounded-2xl border border-line bg-surface-2/50 p-3"><Caption text={post.caption} clamp={4}/></div>
  <div className="my-4 grid grid-cols-4 gap-1.5">{[{icon:Flame,label:'Fires',value:post.hot_count},{icon:Mic,label:'Voices',value:post.comments_count},{icon:Send,label:'Shares',value:post.shares_count},{icon:Eye,label:'Views',value:post.views_count}].map(({icon:Icon,label,value})=><div key={label} className="rounded-xl border border-line bg-surface-2/50 px-1 py-2 text-center"><Icon aria-hidden size={14} className="mx-auto mb-1 text-brand-ink"/><p className="text-sm font-semibold">{count(value)}</p><p className="text-[11px] text-fg-3">{label}</p></div>)}</div>
  <dl className="space-y-3">{facts.filter(f=>f.value).map(({label,value,icon:Icon})=><div key={label} className="flex items-start gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon size={15}/></span><div className="min-w-0"><dt className="text-xs text-fg-3">{label}</dt><dd className="break-words text-sm font-medium">{value}</dd></div></div>)}</dl>
  {post.content_origin&&<p className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-fg-2">{post.content_origin==='new_content'?<ShieldCheck size={15}/>:<Copy size={15}/>}{post.content_origin==='new_content'?'Marked as New Content by the creator':'Marked as Copy-Paste Content'}</p>}
  {post.audio_title&&<p className="mt-3 flex items-center gap-2 text-sm text-fg-2"><Music2 size={16} className="shrink-0"/><span>{post.audio_title}</span></p>}{post.repost_source&&<a href={post.repost_source} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-ink"><ExternalLink size={15}/>View original source</a>}{post.has_cta&&<div className="mt-3"><CtaButton post={post}/></div>}
 </Dialog>;
}
