// Local layout verification only; not imported in the production app.
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ProfileTaskProgress} from './pages/MemberProgram';
import './styles/index.css';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><div className="mx-auto max-w-xl p-4"><ProfileTaskProgress/></div></BrowserRouter></QueryClientProvider>);
