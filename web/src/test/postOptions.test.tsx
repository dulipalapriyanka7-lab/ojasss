import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useState} from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {render as rtlRender,screen,cleanup,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {CreatorRow,PostOptions} from '@/components/post/PostMeta';
import type {PostCard} from '@/api';
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({me:{id:'me'}})}));
vi.mock('@/hooks/usePostActions',()=>({usePublicSettings:()=>({data:{'categories.config':{entertainment:{label:'Entertainment'}}}}),usePostActions:()=>({toggleFollow:vi.fn(),share:vi.fn(),toggleBookmark:vi.fn()})}));
vi.mock('@/lib/location',()=>({usePlaceLabel:(place:string)=>place}));
vi.mock('@/components/ui/Toast',()=>({useToast:()=>({success:vi.fn(),error:vi.fn()})}));
const render=(ui:React.ReactNode)=>rtlRender(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{ui}</QueryClientProvider>);
const post={id:'post',author_id:'creator',author_username:'creator',author_display_name:'Creator',author_avatar_path:null,caption:'A moment from Vijayawada',category:'entertainment',language:'te',country:'IN',location:'Vijayawada',kind:'video',thumbnail_path:null,created_at:new Date().toISOString(),hot_count:2,comments_count:3,shares_count:4,views_count:5,content_origin:'new_content',has_cta:false} as PostCard;
beforeEach(()=>{localStorage.clear();Object.defineProperty(window,'matchMedia',{writable:true,value:()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})});});afterEach(cleanup);
describe('Post options',()=>{
 it('keeps the reel category separate from the username and upload timestamp',()=>{
  render(<MemoryRouter><CreatorRow post={post} compact onDark/></MemoryRouter>);
  const profile=screen.getByRole('link',{name:'Creator, @creator'});
  expect(within(profile).getByText('Entertainment')).toBeVisible();expect(within(profile).getByText('@creator')).toBeVisible();
  expect(profile.querySelector('time')).toHaveAttribute('datetime',post.created_at);expect(profile.querySelector('time')?.textContent).toMatch(/\d{2}-\d{2}/);
  expect(screen.getByRole('button',{name:'Respect'})).toBeEnabled();
 });
 it('shows Respecting for an already respected creator',()=>{render(<MemoryRouter><CreatorRow post={{...post,my_following:true}} compact onDark/></MemoryRouter>);expect(screen.getByRole('button',{name:'Respecting'})).toHaveAttribute('aria-pressed','true');});
 it('toggles and remembers auto-scroll inside the three-dot menu',async()=>{
  const renderMenu=()=>render(<MemoryRouter><PostOptions post={post} open onClose={()=>{}}/></MemoryRouter>);
  renderMenu();expect(screen.getAllByText('NEW')).toHaveLength(2);expect(screen.getByRole('link',{name:/Daily & more challenges/})).toHaveAttribute('href','/challenges');const toggle=screen.getByRole('switch',{name:'Auto-scroll'});expect(toggle).toHaveAttribute('aria-checked','false');
  await userEvent.click(toggle);expect(toggle).toHaveAttribute('aria-checked','true');expect(localStorage.getItem('ojasss-auto-scroll')).toBe('1');
  cleanup();renderMenu();expect(screen.getByRole('switch',{name:'Auto-scroll'})).toHaveAttribute('aria-checked','true');await userEvent.click(screen.getByRole('switch',{name:'Auto-scroll'}));expect(localStorage.getItem('ojasss-auto-scroll')).toBe('0');
 });
 it('opens a separate details sheet with readable region and creator details',async()=>{function Test(){const [open,setOpen]=useState(true);return <MemoryRouter><PostOptions post={post} open={open} onClose={()=>setOpen(false)}/></MemoryRouter>;}render(<Test/>);expect(screen.queryByText('Behind this post')).not.toBeInTheDocument();await userEvent.click(screen.getByRole('button',{name:'Post details'}));await waitFor(()=>expect(screen.getByRole('dialog',{name:'Behind this post'})).toBeVisible());expect(screen.getByText('India')).toBeVisible();expect(screen.getByText('Vijayawada')).toBeVisible();expect(screen.getByText('Marked as New Content by the creator')).toBeVisible();expect(screen.getByRole('link',{name:'Open full post'})).toHaveAttribute('href','/post/post');});
});
