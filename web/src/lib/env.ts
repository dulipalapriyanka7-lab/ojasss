import {publicSiteUrl} from './siteUrl';
// Typed access to public build-time configuration. Only VITE_* values reach the browser,
// and none of them are secrets (the anon key is public by design; RLS enforces access).

export type AppEnv = 'development' | 'staging' | 'production';

function read(key: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof v === 'string' ? v.trim() : '';
}

// /config.js (loaded before the app) can override the backend after deployment, so one build
// can be hosted anywhere by editing a file. Empty values fall back to the build-time env.
declare global {
  interface Window {
    OJASSS_CONFIG?: { mapsEmbedApiKey?: unknown; supabaseUrl?: unknown; supabaseAnonKey?: unknown; backend?: 'mysql' | 'supabase' };
  }
}
function runtime(key: 'supabaseUrl' | 'supabaseAnonKey'): string {
  const v = typeof window !== 'undefined' ? window.OJASSS_CONFIG?.[key] : undefined;
  return typeof v === 'string' ? v.trim() : '';
}

const supabaseUrl = (runtime('supabaseUrl') || read('VITE_SUPABASE_URL')).replace(/\/$/, '');
const supabaseAnonKey = runtime('supabaseAnonKey') || read('VITE_SUPABASE_ANON_KEY');

export const env = {
  mysql: typeof window !== 'undefined' && window.OJASSS_CONFIG?.backend === 'mysql',
  supabaseUrl,
  supabaseAnonKey,
  siteUrl: publicSiteUrl(read('VITE_SITE_URL'),typeof window!=='undefined'?window.location.origin:undefined,import.meta.env.PROD),
  appEnv: (['development', 'staging', 'production'].includes(read('VITE_APP_ENV'))
    ? read('VITE_APP_ENV')
    : 'production') as AppEnv,
  supportEmail: read('VITE_SUPPORT_EMAIL') || 'support@ojasss.com',
  /** True when the app has what it needs to talk to the backend. */
  configured: /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(supabaseUrl) && supabaseAnonKey.length > 20,
} as const;

export const MEDIA_BUCKET = 'media';
export const AVATAR_BUCKET = 'avatars';
