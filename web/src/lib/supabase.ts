import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// The single OJASSS backend client. The Android app loads this same web app, so both
// clients share one session model, one API and one database.
export const supabase: SupabaseClient = createClient(
  env.configured ? env.supabaseUrl : 'http://localhost:54321',
  env.configured ? env.supabaseAnonKey : 'unconfigured-anon-key-placeholder',
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'ojasss-auth',
    },
    realtime: { params: { eventsPerSecond: 10 } },
    global: { headers: { 'x-client-info': 'ojasss-web/1.0' } },
  },
);
