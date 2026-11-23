// GET /functions/v1/post-og?id=<postId>
// Serves Open Graph / Twitter card HTML for social crawlers. The web host rewrites
// crawler requests for https://ojasss.com/post/:id here (see web/vercel.json).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { env, siteUrl } from '../_shared/clients.ts';
import { postOgHtml, type OgPost } from '../_shared/templates.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? url.pathname.split('/').pop() ?? '';
  const supabaseUrl = env('SUPABASE_URL')!;
  const mediaBase = `${supabaseUrl}/storage/v1/object/public/media`;

  let post: OgPost | null = null;
  if (UUID_RE.test(id)) {
    // Anonymous client: only publicly visible posts are returned by get_post.
    const anon = createClient(supabaseUrl, env('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const { data } = await anon.rpc('get_post', { p_post_id: id });
    post = (Array.isArray(data) && data[0]) || null;
  }

  return new Response(postOgHtml(post, siteUrl(), mediaBase), {
    status: post ? 200 : 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': post ? 'public, max-age=300, s-maxage=600' : 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
