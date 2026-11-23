import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError } from '@/api/client';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import App from './App';
import './styles/index.css';
import './styles/profile-refinement.css';
import './styles/competition.css';
import './styles/task-notice.css';
import './styles/live-metrics.css';
import './styles/rank-polish.css';
import './styles/metal-ranks.css';
import './styles/group-chat.css';
import './styles/rank-glass.css';
import './styles/weekly-premium.css';
import './styles/engagement-refinement.css';

function onSessionExpired(e: unknown) {
  if (e instanceof ApiError && e.kind === 'session_expired') void supabase.auth.signOut();
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onSessionExpired }),
  mutationCache: new MutationCache({ onError: onSessionExpired }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) => error instanceof ApiError && error.retryable && failures < 2,
      retryDelay: (n) => Math.min(8000, 800 * 2 ** n),
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MotionConfig reducedMotion="user">
            <ToastProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ToastProvider>
          </MotionConfig>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Offline shell only (no API or private data is cached). Not registered inside the Android app.
if ('serviceWorker' in navigator && import.meta.env.PROD && !/\bOjasssAndroid\//.test(navigator.userAgent)) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
