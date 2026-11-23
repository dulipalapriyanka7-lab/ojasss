// Local verification of the actual Settings page; excluded from production imports.
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AuthProvider} from './hooks/useAuth';
import {ThemeProvider} from './hooks/useTheme';
import {ToastProvider} from './components/ui/Toast';
import SettingsPage from './pages/SettingsPage';
import './styles/index.css';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><ThemeProvider><AuthProvider><ToastProvider><SettingsPage/></ToastProvider></AuthProvider></ThemeProvider></BrowserRouter></QueryClientProvider>);
