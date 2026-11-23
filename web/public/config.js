// OJASSS runtime configuration — edit on the server after deploying, no rebuild needed.
// Supabase → Project Settings → API. Both values are PUBLIC by design (access is enforced by
// database security rules). NEVER put the service_role key here.
// Leave a value empty to use the one the site was built with (web/.env*).
window.OJASSS_CONFIG = {
  backend: 'mysql',
  mapsEmbedApiKey: 'AIzaSyBlWnvEWoiqvEFucqHY6cSyaouogmXlj4o',
  supabaseUrl: window.location.origin + '/api',
  supabaseAnonKey: 'ojasss-mysql-public-browser-client',
};
