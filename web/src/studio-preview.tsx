// Isolated verification of the actual Upload page. Not imported in production.
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AuthProvider} from './hooks/useAuth';
import {ToastProvider} from './components/ui/Toast';
import UploadPage from './pages/UploadPage';
import './styles/index.css';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><AuthProvider><ToastProvider><UploadPage/></ToastProvider></AuthProvider></BrowserRouter></QueryClientProvider>);
