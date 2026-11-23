import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import LeaderboardPage from '@/pages/LeaderboardPage';
import {discovery} from '@/api/discovery';
import {posts} from '@/api';
import {DownloadAppCard,APK_DOWNLOAD} from '@/components/ui/DownloadAppCard';
vi.mock('@/components/layout/AppShell',()=>({Page:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock('@/api/discovery',()=>({discovery:{leaderboard:vi.fn()}}));
vi.mock('@/api',()=>({posts:{feed:vi.fn()}}));
beforeEach(()=>{vi.mocked(discovery.leaderboard).mockResolvedValue({period:'weekly',start:'2026-10-26',end:'2026-11-02',closed:false,timezone:'Asia/Kolkata',entries:[]});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
function open(){return render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><LeaderboardPage/></QueryClientProvider></MemoryRouter>);}
it('shows a clearly labelled sample preview only while no Viral videos exist',async()=>{vi.mocked(posts.feed).mockResolvedValue([]);open();expect(await screen.findByRole('region',{name:'Leaderboard demo'},{timeout:15000})).toBeVisible();expect(screen.getByText('DEMO')).toBeVisible();expect(screen.getByText(/Sample scores only/)).toBeVisible();expect(screen.getByRole('button',{name:'Reset view'})).toBeVisible();});
it('replaces the preview with the real empty-voting state as soon as a Viral video exists',async()=>{vi.mocked(posts.feed).mockResolvedValue([{id:'real-viral'}] as never);open();expect(await screen.findByText('No votes in this period yet.')).toBeVisible();expect(screen.queryByText('DEMO')).not.toBeInTheDocument();});
it('provides an APK download with a clear app card label',()=>{render(<DownloadAppCard/>);expect(screen.getByRole('link',{name:'Download OJASSS Android app'})).toHaveAttribute('href',APK_DOWNLOAD);expect(screen.getByRole('link')).toHaveAttribute('download',APK_DOWNLOAD.split('/').at(-1));});

