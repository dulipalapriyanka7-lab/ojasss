import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,cleanup,fireEvent,waitFor,act,screen} from '@testing-library/react';
import {VideoPlayer} from '@/components/post/MediaView';
import type {PostCard} from '@/api';
const events=vi.hoisted(()=>({resume:null as null|((event:{type:string})=>void)}));
vi.mock('@/lib/platform',()=>({platform:{on:(callback:typeof events.resume)=>{events.resume=callback;return ()=>{};}}}));
vi.mock('@/api',()=>({posts:{recordView:vi.fn(async()=>{})}}));
const post={id:'video',media_path:'owner/video.mp4',thumbnail_path:null,caption:'Test playback',author_username:'creator'} as PostCard;
let play=vi.fn<()=>Promise<void>>();
beforeEach(()=>{play=vi.fn<()=>Promise<void>>().mockResolvedValue(undefined);vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(play);vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function open(){render(<VideoPlayer post={post} active muted onToggleMute={()=>{}} preload="auto"/>);}
it('restarts the active video on browser restoration and native app resume',async()=>{open();await waitFor(()=>expect(play).toHaveBeenCalled());const first=play.mock.calls.length;fireEvent(window,new Event('pageshow'));await waitFor(()=>expect(play.mock.calls.length).toBeGreaterThan(first));const next=play.mock.calls.length;act(()=>events.resume?.({type:'resume'}));await waitFor(()=>expect(play.mock.calls.length).toBeGreaterThan(next));});
it('does not show a manual pause when the initial autoplay request was interrupted',async()=>{play.mockRejectedValueOnce(new DOMException('backgrounded','AbortError'));open();await waitFor(()=>expect(play).toHaveBeenCalled());expect(screen.getByRole('button',{name:'Pause video'})).toBeVisible();fireEvent(window,new Event('pageshow'));await waitFor(()=>expect(play.mock.calls.length).toBeGreaterThan(1));});
