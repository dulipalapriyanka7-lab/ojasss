// Local verification entry; not imported by the production application.
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import ExplorePage from './pages/ExplorePage';
import {AuthProvider} from './hooks/useAuth';
import './styles/index.css';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><AuthProvider><ExplorePage/></AuthProvider></BrowserRouter></QueryClientProvider>);
