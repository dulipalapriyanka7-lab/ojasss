import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import AdminPushPage from '@/pages/admin/AdminPushPage';
const {invoke}=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/api/client',()=>({invoke}));
vi.mock('@/api/upload',()=>({uploadObject:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({me:{id:'admin'}})}));
vi.mock('@/hooks/useCategories',()=>({useCategories:()=>[{value:'entertainment',label:'Entertainment'}],useCategoryLabel:()=>((id:string)=>id==='entertainment'?'Entertainment':id)}));
vi.mock('@/components/ui/Toast',()=>({useToast:()=>({success:vi.fn(),error:vi.fn()})}));
beforeEach(()=>{invoke.mockReset();invoke.mockImplementation(async(name:string)=>name==='custom-push-history'?[]:name==='custom-push-preview'?{recipients:5,configured:true}:{id:'campaign'});Object.defineProperty(window,'matchMedia',{writable:true,value:()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})});});
afterEach(cleanup);
function mount(){render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AdminPushPage/></QueryClientProvider></MemoryRouter>);}
async function fill(){await userEvent.type(screen.getByRole('textbox',{name:'Title'}),'A new moment');await userEvent.type(screen.getByRole('textbox',{name:'Message'}),'Watch what is new.');await userEvent.selectOptions(screen.getByLabelText('Open category'),'entertainment');}
it('requires review and confirmation before sending to members',async()=>{mount();expect(screen.getByRole('button',{name:'Review & send'})).toBeDisabled();await fill();expect(screen.getByRole('heading',{name:'A new moment'})).toBeVisible();await userEvent.click(screen.getByRole('button',{name:'Review & send'}));await screen.findByRole('dialog',{name:'Send this notification?'});expect(invoke.mock.calls.some(([name])=>name==='custom-push-send')).toBe(false);await userEvent.click(screen.getByRole('button',{name:'Send notification'}));await waitFor(()=>expect(invoke).toHaveBeenCalledWith('custom-push-send',expect.objectContaining({category:'entertainment',delivery:'android',test:false,requestId:expect.any(String)})));});
it('keeps a test limited to the signed-in administrator',async()=>{mount();await fill();await userEvent.click(screen.getByRole('button',{name:'Test on my devices'}));await screen.findByRole('dialog',{name:'Send a test notification?'});expect(invoke).toHaveBeenCalledWith('custom-push-preview',expect.objectContaining({test:true}));await userEvent.click(screen.getByRole('button',{name:'Send test'}));await waitFor(()=>expect(invoke).toHaveBeenCalledWith('custom-push-send',expect.objectContaining({test:true})));});
it('does not send if preview validation fails',async()=>{invoke.mockImplementation(async(name:string)=>{if(name==='custom-push-preview')throw new Error('Choose an available category.');return [];});mount();await fill();await userEvent.click(screen.getByRole('button',{name:'Review & send'}));expect(await screen.findByRole('alert')).toHaveTextContent('Choose an available category.');expect(invoke.mock.calls.some(([name])=>name==='custom-push-send')).toBe(false);});
