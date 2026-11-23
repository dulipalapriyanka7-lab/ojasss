import {useQuery} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import {posts,type PostCard} from '@/api';
import {useAuth} from '@/hooks/useAuth';
import {Dialog} from '@/components/ui/Overlay';
import {Button,ButtonLink} from '@/components/ui/Button';
import {Clock3} from 'lucide-react';
import {dateTime} from '@/lib/format';

export function ViralEntryNotice() {
  const {me}=useAuth();
  const [post,setPost]=useState<PostCard|null>(null);
  const query=useQuery({queryKey:['viral-entry-notice',me?.id],queryFn:()=>posts.byUser(me!.id,'video',{limit:50}),enabled:!!me,refetchInterval:15000});
  useEffect(()=>{
    if(!me || !query.data || post) return;
    const now=Date.now();
    const next=query.data.find(video=>video.one_chance_ready && video.viral_at
      && Date.parse(video.viral_at)>now-5*60_000
      && !localStorage.getItem('viral-entry-seen:'+me.id+':'+video.id));
    if(next){
      localStorage.setItem('viral-entry-seen:'+me.id+':'+next.id,'1');
      setPost(next);
    }
  },[me,post,query.data]);
  return <Dialog open={!!post} onClose={()=>setPost(null)} title="Your video is in One Chance"
    footer={<><Button variant="secondary" onClick={()=>setPost(null)}>Done</Button>
      {post && <ButtonLink to={`/post/${post.id}`} onClick={()=>setPost(null)}>View video</ButtonLink>}</>}>
    {post?.one_chance_voting_until && <p className="flex items-center gap-2 text-sm"><Clock3 size={17}/>Voting closes {dateTime(post.one_chance_voting_until)}.</p>}
  </Dialog>;
}
