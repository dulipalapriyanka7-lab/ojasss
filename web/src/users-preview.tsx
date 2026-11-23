// Local verification entry; not imported by the production application.
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {admin} from './api/admin';
import {AuthProvider} from './hooks/useAuth';
import AdminUsers from './pages/admin/AdminUsers';
import './styles/index.css';
import './pages/admin/users-slim.css';
const names=[['jhonny basha','user_basha','jhonny@example.com'],['Sai charan Chicken shop','ramya_sweet_girl','ramya.sweet.girl.long.email@example.com'],['Vv','ojasss_admin',null],['doondi','doondi','d@example.com']];
(admin as any).users=async()=>names.map(([d,u,e],i)=>({id:'id'+i,username:u,display_name:d,email:e,avatar_path:null,role:i===2?'admin':'user',status:i===3?'suspended':'active',is_verified:i<2,followers_count:3,posts_count:4,created_at:'2026-11-20T00:00:00Z',last_active_at:null,open_reports:i,approved_paise:12000,paid_paise:5000,available_paise:0,total_count:4,competition_rank:i===3?1:null,viral_videos:i,one_chance_videos:i*2}));
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><AuthProvider><main className="adm-slim mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8"><AdminUsers/></main></AuthProvider></BrowserRouter></QueryClientProvider>);
