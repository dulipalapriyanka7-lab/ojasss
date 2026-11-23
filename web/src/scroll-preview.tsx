// Local playback verification only. Excluded from production entry points.
import {createRoot} from 'react-dom/client';
import {useInfiniteQuery,QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {AuthProvider} from './hooks/useAuth';
import {ToastProvider} from './components/ui/Toast';
import {VideoFeed} from './components/feed/VideoFeed';
import type {PostCard} from './api';
import './styles/index.css';
import './styles/engagement-refinement.css';
const items=Array.from({length:8},(_,index)=>({id:'scroll-qa-'+index,kind:'video',author_id:'qa-author',author_username:'qa_creator',author_display_name:'QA Creator',category:'entertainment',media_path:`qa/clip-${index}.mp4`,thumbnail_path:'qa/cover.png',width:360,height:640,duration_ms:2000,created_at:'2026-11-11T00:00:00Z',status:'published',hot_count:1,shares_count:0,comments_count:0,bookmarks_count:0,votes_count:0,caption:'Playback QA',hashtags:[]} as unknown as PostCard));
function Preview(){const query=useInfiniteQuery({queryKey:['scroll-qa'],queryFn:async()=>items,initialPageParam:0,getNextPageParam:()=>undefined});return <div style={{'--feed-height':'100svh'} as React.CSSProperties}><VideoFeed query={query} emptyTitle="Empty" emptyDescription="No clips"/></div>;}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AuthProvider><ToastProvider><Preview/></ToastProvider></AuthProvider></MemoryRouter></QueryClientProvider>);
