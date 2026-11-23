import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,renderHook} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {usePostActions} from './usePostActions';
import {posts,type PostCard} from '@/api';
import {platform} from '@/lib/platform';
const error=vi.hoisted(()=>vi.fn());
vi.mock('./useAuth',()=>({useAuth:()=>({me:null})}));
vi.mock('@/components/ui/Toast',()=>({useToast:()=>({error})}));
vi.mock('@/api',()=>({posts:{ctaClick:vi.fn()},bookmarks:{},engagements:{},follows:{},reference:{}}));
vi.mock('@/lib/platform',()=>({platform:{openExternal:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('opens the action during the tap even when click tracking is pending',()=>{
 vi.mocked(posts.ctaClick).mockReturnValue(new Promise(()=>{}));
 const card={id:'video',cta_url:'https://wa.me/919876543210'} as PostCard;
 const {result}=renderHook(()=>usePostActions(card),{wrapper:({children})=><MemoryRouter>{children}</MemoryRouter>});
 result.current.openCta();
 expect(platform.openExternal).toHaveBeenCalledExactlyOnceWith(card.cta_url);
 expect(posts.ctaClick).toHaveBeenCalledExactlyOnceWith('video');
 expect(vi.mocked(platform.openExternal).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(posts.ctaClick).mock.invocationCallOrder[0]);
});
it('does not open invalid action URLs',()=>{
 const {result}=renderHook(()=>usePostActions({id:'video',cta_url:'javascript:alert(1)'} as PostCard),{wrapper:({children})=><MemoryRouter>{children}</MemoryRouter>});
 result.current.openCta();expect(platform.openExternal).not.toHaveBeenCalled();expect(posts.ctaClick).not.toHaveBeenCalled();expect(error).toHaveBeenCalled();
});
