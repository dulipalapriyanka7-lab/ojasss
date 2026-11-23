// Isolated UI verification only; not imported by the production application.
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useState} from 'react';
import {AuthProvider} from './hooks/useAuth';
import {ToastProvider} from './components/ui/Toast';
import OneChancePage from './pages/OneChancePage';
import {EngagementGuide,ViralProgress} from './components/post/EngagementRail';
import type {PostCard} from './api';
import './styles/index.css';
const qc=new QueryClient();
qc.setQueryData(['one-chance',undefined],{eligible:true,membership:null,requests:[],occupied_positions:[],packages:[{id:'qa',name:'Viral Fast Entry',price_paise:1000,duration_days:7,placement:'featured',position:0,description:'Verified early entry for your eligible Viral videos.'}]});
const post={hot_count:5,shares_count:8,is_viral:false} as PostCard;
function Preview(){const [open,setOpen]=useState(false);return <><OneChancePage/><div className="mx-auto max-w-lg p-4"><ViralProgress post={post}/><button onClick={()=>setOpen(true)}>Open guide</button></div><EngagementGuide post={post} own={false} open={open} onClose={()=>setOpen(false)}/></>;}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={qc}><BrowserRouter><AuthProvider><ToastProvider><Preview/></ToastProvider></AuthProvider></BrowserRouter></QueryClientProvider>);
