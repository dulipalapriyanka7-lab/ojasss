// Vercel Routing Middleware: serve server-rendered Open Graph HTML for /post/:id to social
// crawlers (WhatsApp, Facebook, X, LinkedIn, Telegram, Slack, Discord, Google), so shared
// links show the actual post. Humans get the SPA. Runs at the edge; no secrets involved.
export const config = { matcher: '/post/:id*' };

const BOT = /(facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|pinterest|skypeuripreview|googlebot|bingbot|applebot|redditbot|embedly|quora link preview|vkshare|w3c_validator)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function middleware(request: Request): Promise<Response | undefined> {
  if (!BOT.test(request.headers.get('user-agent') ?? '')) return undefined;
  const id = new URL(request.url).pathname.split('/')[2] ?? '';
  const api = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!UUID.test(id) || !api) return undefined;
  const res = await fetch(`${api}/functions/v1/post-og?id=${id}`, { headers: { accept: 'text/html' } });
  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': res.headers.get('cache-control') ?? 'public, max-age=300' },
  });
}
