import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronRight, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import { rpc } from '@/api/client';
import { Avatar } from '@/components/ui/Misc';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';

type FirePage = {
  profiles: { id: string; username: string; display_name: string; avatar_path: string | null }[];
  has_more: boolean;
};

export function FireProfiles({postId, total, onClose}: {postId:string; total:number; onClose:()=>void}) {
  const fires = useInfiniteQuery({
    queryKey:['post-fires',postId,total],
    queryFn:({pageParam})=>rpc<FirePage>('list_post_fires',{p_post_id:postId,p_offset:pageParam}),
    initialPageParam:0,
    getNextPageParam:(last,_,offset)=>last.has_more?offset+30:undefined,
    staleTime:0,
  });
  const profiles = [...new Map(fires.data?.pages.flatMap(page=>page.profiles).map(profile=>[profile.id,profile])).values()];
  return <Drawer open onClose={onClose} className="fire-profiles-sheet" title="Who gave Fires" description="People who reacted to this post.">
    <div className="fire-profiles-summary mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
      <span className="fire-profiles-emblem grid size-8 place-items-center rounded-lg"><Flame size={17} aria-hidden/></span> {total} {total===1?'Fire':'Fires'}
    </div>
    {fires.isPending && <p role="status" className="py-4 text-sm text-fg-2">Loading profiles…</p>}
    {fires.isError && !fires.data && <Button variant="secondary" onClick={()=>void fires.refetch()}>Couldn’t load profiles. Retry</Button>}
    {fires.isSuccess && !profiles.length && <p className="py-4 text-sm text-fg-2">No profiles to show yet.</p>}
    {profiles.length>0 && <ul className="fire-profiles-list divide-y divide-line rounded-xl border border-line">
      {profiles.map(profile=><li key={profile.id}>
        <Link className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-orange-500/10 focus-visible:outline-2" to={'/profile/'+encodeURIComponent(profile.username)} onClick={onClose}>
          <Avatar size={34} className="ring-1 ring-orange-400/35" path={profile.avatar_path} name={profile.display_name||profile.username}/>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{profile.display_name||profile.username}</span>
            <span className="block truncate text-xs text-fg-2">@{profile.username}</span>
          </span>
          <ChevronRight size={16} aria-hidden className="shrink-0 text-orange-500"/>
        </Link>
      </li>)}
    </ul>}
    {fires.hasNextPage && <Button className="mt-3" variant="secondary" loading={fires.isFetchingNextPage} onClick={()=>void fires.fetchNextPage()}>
      {fires.isFetchNextPageError?'Retry loading more':'Show more'}
    </Button>}
  </Drawer>;
}
