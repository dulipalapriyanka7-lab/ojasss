// Local visual QA only; not imported into the production application.
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AuthProvider} from './hooks/useAuth';
import {ThemeProvider} from './hooks/useTheme';
import {ToastProvider} from './components/ui/Toast';
import {AppShell} from './components/layout/AppShell';
import HomePage from './pages/HomePage';
import './styles/index.css';
import './styles/engagement-refinement.css';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ThemeProvider><AuthProvider><ToastProvider><MemoryRouter initialEntries={['/']}><AppShell><HomePage/></AppShell></MemoryRouter></ToastProvider></AuthProvider></ThemeProvider></QueryClientProvider>);
