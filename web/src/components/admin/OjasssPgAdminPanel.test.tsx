import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({role:'admin',status:vi.fn(),save:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({me:{role:mocks.role}})}));
vi.mock('@/api/ojasssPg',()=>({ojasssPg:{status:mocks.status,save:mocks.save}}));
vi.mock('@/components/ui/Toast',()=>({useToast:()=>({success:vi.fn(),error:vi.fn()})}));
import {OjasssPgAdminPanel} from './OjasssPgAdminPanel';
const status={name:'OJASSS PG',provider:'youpi',status:'setup_pending',gateway_url:'',merchant_id:'',secret_saved:false,saved_at:null,payments_active:false};
function show(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><OjasssPgAdminPanel/></QueryClientProvider>);}
beforeEach(()=>{mocks.role='admin';mocks.status.mockReset().mockResolvedValue(status);mocks.save.mockReset().mockResolvedValue({...status,secret_saved:true,saved_at:'saved',status:'details_saved'});});afterEach(cleanup);
it('saves setup while clearing the typed secret and keeping checkout inactive',async()=>{show();const url=await screen.findByLabelText('Hosted gateway URL');fireEvent.change(url,{target:{value:'https://pay.example.com'}});fireEvent.change(screen.getByLabelText('Merchant ID / public key'),{target:{value:'merchant-123'}});fireEvent.change(screen.getByLabelText('Webhook signing secret'),{target:{value:'test-secret-with-at-least-32-characters'}});fireEvent.click(screen.getByRole('button',{name:'Save setup'}));await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith({gateway_url:'https://pay.example.com',merchant_id:'merchant-123',webhook_secret:'test-secret-with-at-least-32-characters'}));await waitFor(()=>expect(screen.getByLabelText('Webhook signing secret')).toHaveValue(''));expect(screen.getByText('Details saved')).toBeVisible();expect(screen.getByText(/Payment checkout stays inactive/)).toBeVisible();});
it('does not fetch or expose configuration to a moderator',()=>{mocks.role='moderator';show();expect(screen.queryByText('OJASSS PG')).not.toBeInTheDocument();expect(mocks.status).not.toHaveBeenCalled();});
