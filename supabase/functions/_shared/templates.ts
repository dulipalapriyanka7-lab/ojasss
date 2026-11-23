// HTML generation for crawlers (Open Graph) and transactional emails. All user content is escaped.
import { escapeHtml } from './http.ts';

export interface OgPost {
  id: string;
  kind: 'video' | 'poster';
  caption: string;
  category: string;
  author_username: string;
  author_display_name: string;
  media_path: string;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  hot_count: number;
  speak_count: number;
  viral_count: number;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  entertainment: 'Entertainment',
  business_promotion: 'Business Promotion',
  public_complaint: 'Public Complaint',
  news: 'News',
  part_time_jobs: 'Part-Time Jobs',
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c;
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Open Graph / Twitter card page for https://ojasss.com/post/:id. */
export function postOgHtml(post: OgPost | null, siteUrl: string, mediaBase: string): string {
  const url = post ? `${siteUrl}/post/${post.id}` : siteUrl;
  const creator = post ? post.author_display_name || `@${post.author_username}` : '';
  const title = post
    ? `${creator} on OJASSS${post.caption ? `: “${truncate(post.caption, 70)}”` : ''}`
    : 'OJASSS — Short videos & posters';
  const description = post
    ? `${categoryLabel(post.category)} · ${post.hot_count} HOT · ${post.speak_count} SPEAK · ${post.viral_count} VIRAL. Watch on OJASSS.`
    : 'Watch, create and earn with short videos and posters on OJASSS.';
  const imagePath = post ? (post.kind === 'poster' ? post.media_path : post.thumbnail_path) : null;
  const image = imagePath ? `${mediaBase}/${imagePath.split('/').map(encodeURIComponent).join('/')}` : `${siteUrl}/og-default.png`;
  const e = escapeHtml;

  const video = post?.kind === 'video'
    ? `<meta property="og:video" content="${e(`${mediaBase}/${post.media_path}`)}">
<meta property="og:video:type" content="video/mp4">${post.width && post.height ? `
<meta property="og:video:width" content="${post.width}">
<meta property="og:video:height" content="${post.height}">` : ''}`
    : '';

  const ld = post
    ? JSON.stringify({
        '@context': 'https://schema.org',
        '@type': post.kind === 'video' ? 'VideoObject' : 'ImageObject',
        name: truncate(post.caption || title, 100),
        description,
        thumbnailUrl: image,
        uploadDate: post.created_at,
        contentUrl: `${mediaBase}/${post.media_path}`,
        author: { '@type': 'Person', name: creator, url: `${siteUrl}/profile/${post.author_username}` },
        publisher: { '@type': 'Organization', name: 'OJASSS', url: siteUrl },
      }).replace(/</g, '\\u003c')
    : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<link rel="canonical" href="${e(url)}">
<meta property="og:site_name" content="OJASSS">
<meta property="og:type" content="${post?.kind === 'video' ? 'video.other' : 'website'}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
<meta property="og:image" content="${e(image)}">
${video}
<meta name="twitter:card" content="${post?.kind === 'video' ? 'player' : 'summary_large_image'}">
<meta name="twitter:site" content="@ojasss">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${e(image)}">
${ld ? `<script type="application/ld+json">${ld}</script>` : ''}
<meta http-equiv="refresh" content="0; url=${e(url)}">
</head><body><a href="${e(url)}">${e(title)}</a></body></html>`;
}

export function deletionOtpEmail(code: string): { subject: string; html: string; text: string } {
  const subject = 'Your OJASSS account deletion code';
  const text = `Your OJASSS account deletion verification code is ${code}.

It expires in 15 minutes and can be used once. If you did not request account deletion, ignore this email — your account is safe and nothing will change.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:24px;color:#14131a">
<h1 style="font-size:20px;margin:0 0 16px">Confirm account deletion</h1>
<p style="margin:0 0 16px">Use this code to confirm your OJASSS account deletion request:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:0 0 16px">${escapeHtml(code)}</p>
<p style="margin:0 0 8px;color:#5b5868">The code expires in 15 minutes and can be used once.</p>
<p style="margin:0;color:#5b5868">If you did not request this, ignore this email — nothing will change.</p>
</div>`;
  return { subject, html, text };
}

export interface ComplaintEmailInput {
  post_id: string;
  subcategory: string;
  description: string;
  location: string;
  legal_assistance_requested: boolean;
  created_at: string;
  author_username: string;
  authority: { name: string; department: string };
}

export function complaintForwardEmail(c: ComplaintEmailInput, siteUrl: string): { subject: string; html: string; text: string } {
  const e = escapeHtml;
  const link = `${siteUrl}/post/${c.post_id}`;
  const subject = `Public complaint forwarded via OJASSS — ${c.subcategory.replace(/_/g, ' ')} — ${truncate(c.location, 60)}`;
  const disclaimer =
    'This complaint was submitted by an OJASSS user. OJASSS forwards it as received and has not independently verified the allegations. OJASSS is not a party to the complaint.';
  const text = `To: ${c.authority.name}${c.authority.department ? `, ${c.authority.department}` : ''}

A member of the public submitted the following complaint on OJASSS and asked for it to be forwarded to your office.

Type: ${c.subcategory.replace(/_/g, ' ')}
Location: ${c.location}
Submitted: ${c.created_at}
Submitted by: @${c.author_username}
Legal assistance requested: ${c.legal_assistance_requested ? 'Yes' : 'No'}

Description (as submitted by the user):
${c.description}

Public post: ${link}

${disclaimer}`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:auto;padding:24px;color:#14131a">
<p style="margin:0 0 16px">To: <strong>${e(c.authority.name)}</strong>${c.authority.department ? `, ${e(c.authority.department)}` : ''}</p>
<p style="margin:0 0 16px">A member of the public submitted the following complaint on OJASSS and asked for it to be forwarded to your office.</p>
<table style="border-collapse:collapse;margin:0 0 16px">
<tr><td style="padding:4px 12px 4px 0;color:#5b5868">Type</td><td>${e(c.subcategory.replace(/_/g, ' '))}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#5b5868">Location</td><td>${e(c.location)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#5b5868">Submitted</td><td>${e(c.created_at)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#5b5868">Submitted by</td><td>@${e(c.author_username)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#5b5868">Legal assistance requested</td><td>${c.legal_assistance_requested ? 'Yes' : 'No'}</td></tr>
</table>
<h2 style="font-size:16px;margin:0 0 8px">Description (as submitted by the user)</h2>
<p style="white-space:pre-wrap;margin:0 0 16px">${e(c.description)}</p>
<p style="margin:0 0 16px"><a href="${e(link)}">View the public post</a></p>
<p style="font-size:12px;color:#5b5868;border-top:1px solid #e5e3ec;padding-top:12px;margin:0">${e(disclaimer)}</p>
</div>`;
  return { subject, html, text };
}
