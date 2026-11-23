import {useAuth} from '@/hooks/useAuth';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {CategoryWelcome} from '@/components/feed/CategoryWelcome';
import {discovery} from '@/api/discovery';
vi.mock('@/api/discovery',()=>({discovery:{savePreferences:vi.fn()}}));
vi.mock('@/hooks/useAuth',()=>({meKey:['me'],useAuth:vi.fn(()=>({me:{id:'member',username:'member'}}))}));
vi.mock('@/components/ui/Toast',()=>({useToast:()=>({success:vi.fn(),error:vi.fn()})}));
beforeEach(()=>{vi.mocked(useAuth).mockReturnValue({me:{id:'member',username:'member'}} as never);sessionStorage.clear();vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
it('requires a selection and saves a category-only feed with all disabled',async()=>{
 const qc=new QueryClient();qc.setQueryData(['me','member'],{id:'member'});vi.mocked(discovery.savePreferences).mockResolvedValue({id:'member',category_preferences:{selected:['part_time_jobs'],show_all:false}} as never);
 render(<QueryClientProvider client={qc}><CategoryWelcome openCategory={()=>{}} edit={false} onClose={()=>{}}/></QueryClientProvider>);
 expect(screen.getByRole('button',{name:'Show My Videos'})).toBeDisabled();expect(screen.getByRole('checkbox')).not.toBeChecked();
 await userEvent.click(screen.getByRole('button',{name:/^Part Time Jobs/}));await userEvent.click(screen.getByRole('button',{name:'Show My Videos'}));
 await waitFor(()=>expect(discovery.savePreferences).toHaveBeenCalledWith(['part_time_jobs'],false));expect(qc.getQueryData(['me','member'])).toMatchObject({category_preferences:{selected:['part_time_jobs'],show_all:false}});
 await waitFor(()=>expect(sessionStorage.getItem('ojasss-category-session:member')).toBe('chosen'));
});
it('allows all categories through the explicit bottom checkbox',async()=>{
 const qc=new QueryClient();vi.mocked(discovery.savePreferences).mockResolvedValue({id:'member',category_preferences:{selected:[],show_all:true}} as never);
 render(<QueryClientProvider client={qc}><CategoryWelcome openCategory={()=>{}} edit={false} onClose={()=>{}}/></QueryClientProvider>);
 expect(screen.getByRole('button',{name:/Recommended: Part Time/})).toBeInTheDocument();await userEvent.click(screen.getByRole('checkbox'));await userEvent.click(screen.getByRole('button',{name:'Show My Videos'}));await waitFor(()=>expect(discovery.savePreferences).toHaveBeenCalledWith([],true));
});
it('keeps saved choices selected when the category page is opened again',async()=>{
 vi.mocked(useAuth).mockReturnValue({me:{id:'member',username:'member',category_preferences:{selected:['full_time_jobs'],show_all:false}}} as never);
 const qc=new QueryClient();const {rerender}=render(<QueryClientProvider client={qc}><CategoryWelcome openCategory={()=>{}} edit={false} onClose={()=>{}}/></QueryClientProvider>);
 expect(screen.queryByRole('dialog',{name:'Make it your feed'})).not.toBeInTheDocument();
 rerender(<QueryClientProvider client={qc}><CategoryWelcome openCategory={()=>{}} edit onClose={()=>{}}/></QueryClientProvider>);
 await userEvent.click(screen.getByRole('button',{name:'More categories'}));expect(screen.getByRole('button',{name:'Full Time Jobs'})).toHaveAttribute('aria-pressed','true');
});

it('renders first-login choices as a full page without a video overlay',()=>{render(<QueryClientProvider client={new QueryClient()}><CategoryWelcome openCategory={()=>{}} edit fullPage onClose={()=>{}}/></QueryClientProvider>);expect(screen.getByRole('main')).toBeVisible();expect(screen.getByRole('heading',{level:1,name:'Make it Your Feed'})).toBeVisible();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByRole('checkbox')).toBeVisible();});
