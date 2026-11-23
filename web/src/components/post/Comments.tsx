import {useInfiniteQuery,useQueryClient} from '@tanstack/react-query';
import {Mic} from 'lucide-react';
import {useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {comments,type Comment} from '@/api';
import {useAuth} from '@/hooks/useAuth';
import {patchPost} from '@/hooks/usePostActions';
import {cn} from '@/lib/utils';
import {Button} from '../ui/Button';
import {EmptyState,ErrorState,Skeleton} from '../ui/Feedback';
import {Dialog} from '../ui/Overlay';
import {useToast} from '../ui/Toast';
import {ReportDialog} from './ReportDialog';
import {VoiceCard} from './VoiceCard';
import {VoiceComposer,type VoiceComposerHandle} from './VoiceComposer';
export function CommentsPanel({postId,commentsCount,className}:{postId:string;commentsCount:number;className?:string}){
 const {me}=useAuth(),qc=useQueryClient(),toast=useToast();const key=['comments',postId];const [reporting,setReporting]=useState<string|null>(null);const [replyTarget,setReplyTarget]=useState<{voice:Comment;rootId:string}|null>(null);const [sending,setSending]=useState(false);const composer=useRef<VoiceComposerHandle|null>(null);
 const reply=(voice:Comment,rootId:string)=>{if(sending){toast.info('Please wait for your current voice to finish sending.');return;}setReplyTarget({voice,rootId});composer.current?.replyTo('@'+voice.author.username);};
 const cancelReply=()=>{if(replyTarget)composer.current?.clearMention('@'+replyTarget.voice.author.username);setReplyTarget(null);};
 const q=useInfiniteQuery({queryKey:key,queryFn:({pageParam})=>comments.list(postId,pageParam,20),initialPageParam:null as string|null,getNextPageParam:last=>last.length===20?last[last.length-1].id:undefined});
 const added=()=>patchPost(postId,{comments_count:commentsCount+1});
 const remove=async(voice:Comment)=>{const result=await comments.remove(voice.id);patchPost(postId,{comments_count:Math.max(0,commentsCount-result.removed_count)});await Promise.all([qc.invalidateQueries({queryKey:key}),qc.invalidateQueries({queryKey:['voice-replies']})]);if(replyTarget&&(voice.id===replyTarget.voice.id||voice.id===replyTarget.rootId))cancelReply();toast.success('Your voice was removed');};
 return <div className={cn('flex min-h-0 flex-col',className)}>
  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
   {q.isPending?<ul className="space-y-5 py-2" aria-label="Loading voices">{Array.from({length:5},(_,i)=><li key={i} className="flex gap-3"><Skeleton className="size-9 rounded-full"/><div className="flex-1 space-y-2"><Skeleton className="h-3 w-28"/><Skeleton className="h-3 w-4/5"/></div></li>)}</ul>:q.isError?<ErrorState error={q.error} onRetry={()=>void q.refetch()} compact/>:!q.data.pages.flat().length?<EmptyState icon={Mic} title="Be the first voice" description="Have a thought? Say it your way." compact/>:<ul className="space-y-4 py-2">{q.data.pages.flat().map(c=><VoiceCard key={c.id} voice={c} onReply={reply} replyingToId={replyTarget?.voice.id} onRemove={remove} onReport={setReporting}/>)}{q.hasNextPage&&<li className="flex justify-center pt-1"><Button variant="ghost" size="sm" loading={q.isFetchingNextPage} onClick={()=>void q.fetchNextPage()}>More voices</Button></li>}</ul>}
  </div>
  {me?<div className="mt-2 shrink-0"><VoiceComposer ref={composer} key={me.id} inputId={'speak-compose-'+postId} guide label={replyTarget?'Reply':'Say it'} mention={replyTarget?'@'+replyTarget.voice.author.username:''} placeholder={replyTarget?'Reply to '+replyTarget.voice.author.username+'…':"What's on your mind?"} onCancel={replyTarget?cancelReply:undefined} onBusyChange={setSending} onSend={async(body,language,mediaPath)=>{await comments.add(postId,body,replyTarget?.rootId??null,language,{mediaPath,replyToId:replyTarget?.voice.id??null});added();setReplyTarget(null);await Promise.all([qc.invalidateQueries({queryKey:key}),qc.invalidateQueries({queryKey:['voice-replies']})]);}}/></div>:<p className="mt-3 border-t border-line pt-3 text-center text-sm text-fg-3"><Link to={'/login?next=/post/'+postId} className="font-semibold text-brand-ink hover:underline">Sign in</Link> to add your voice.</p>}
  <ReportDialog open={!!reporting} onClose={()=>setReporting(null)} targetType="comment" targetId={reporting??''}/>
 </div>;
}
export function CommentsSheet({open,onClose,postId,commentsCount}:{open:boolean;onClose:()=>void;postId:string;commentsCount:number}){return <Dialog open={open} onClose={onClose} title={`Speak · ${commentsCount} ${commentsCount===1?'voice':'voices'}`} size="md" className="speak-conversation-sheet h-[min(680px,78dvh)] sm:h-[min(720px,85svh)]">{open&&<CommentsPanel postId={postId} commentsCount={commentsCount} className="h-full"/>}</Dialog>;}
