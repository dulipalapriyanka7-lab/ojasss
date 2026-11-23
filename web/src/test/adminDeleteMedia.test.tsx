import type {ReactNode,HTMLAttributes} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,within,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import AdminContent from '@/pages/admin/AdminContent';
import {admin} from '@/api/admin';
vi.mock('motion/react',async()=>{const React=await import('react');return {AnimatePresence:({children}:{children:ReactNode})=>children,motion:{div:React.forwardRef<HTMLDivElement,HTMLAttributes<HTMLDivElement>>((props,ref)=>React.createElement('div',{...Object.fromEntries(Object.entries(props).filter(([key])=>!['initial','animate','exit','transition'].includes(key))),ref}))}};});
const state=vi.hoisted(()=>({isAdmin:true,deleted:false}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({isAdmin:state.isAdmin})}));
vi.mock('@/api/admin',()=>({admin:{posts:vi.fn(async()=>state.deleted?[]:[{id:'test-media',kind:'video',author_username:'creator',caption:'Test-only media',category:'entertainment',language:'en',thumbnail_path:null,views_count:5,hot_count:1,speak_count:0,viral_count:0,open_reports:0,status:'published',created_at:'2026-10-31T00:00:00Z',total_count:1}]),deleteMedia:vi.fn(async()=>{state.deleted=true;return {id:'test-media',deleted:true};}),moderatePost:vi.fn()}}));
vi.mock('@/components/ui/Toast',()=>({useToast:()=>({success:vi.fn(),error:vi.fn()})}));
beforeEach(()=>{state.isAdmin=true;state.deleted=false;vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
function open(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><AdminContent kind="video"/></MemoryRouter></QueryClientProvider>);}
it('requires a reason and exact DELETE confirmation before permanent deletion',async()=>{open();const user=userEvent.setup();await user.click((await screen.findAllByRole('button',{name:'Delete forever'}))[0]);const dialog=screen.getByRole('dialog',{name:'Permanently delete this video?'});const confirm=within(dialog).getByRole('button',{name:'Delete forever'});expect(confirm).toBeDisabled();expect(admin.deleteMedia).not.toHaveBeenCalled();await user.type(within(dialog).getByLabelText(/Reason/),'Uploaded by mistake');await user.type(within(dialog).getByLabelText(/Type DELETE/),'delete');expect(confirm).toBeDisabled();await user.clear(within(dialog).getByLabelText(/Type DELETE/));await user.type(within(dialog).getByLabelText(/Type DELETE/),'DELETE');expect(confirm).toBeEnabled();await user.click(confirm);await waitFor(()=>expect(admin.deleteMedia).toHaveBeenCalledWith('test-media','Uploaded by mistake','DELETE'));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(await screen.findByText('No videos match')).toBeVisible();});
it('hides permanent deletion from moderators',async()=>{state.isAdmin=false;open();await screen.findAllByText('Test-only media');expect(screen.queryByRole('button',{name:'Delete forever'})).not.toBeInTheDocument();});
it('cancel keeps media without making a deletion request',async()=>{open();const user=userEvent.setup();await user.click((await screen.findAllByRole('button',{name:'Delete forever'}))[0]);await user.click(screen.getByRole('button',{name:'Keep media'}));expect(admin.deleteMedia).not.toHaveBeenCalled();await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());});
