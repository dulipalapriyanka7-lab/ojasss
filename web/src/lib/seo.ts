import { useEffect } from 'react';
import { env } from './env';

export interface SeoProps {
  title?: string;
  description?: string;
  /** Path (e.g. /post/123) — becomes the canonical URL on ojasss.com. */
  path?: string;
  image?: string | null;
  type?: 'website' | 'profile' | 'video.other' | 'article';
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | null;
}

const DEFAULT_DESCRIPTION =
  'OJASSS — watch, create and earn with short videos and posters. Made in India for creators, businesses and citizens.';

function setMeta(attr: 'name' | 'property', key: string, value: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!value) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/** Client-side head management. Crawlers get server-rendered OG for /post/:id (post-og function). */
export function useSeo({ title, description, path, image, type = 'website', noindex, jsonLd }: SeoProps) {
  useEffect(() => {
    const fullTitle = title ? `${title} · OJASSS` : 'OJASSS — Short videos & posters';
    const desc = description || DEFAULT_DESCRIPTION;
    const url = `${env.siteUrl}${path ?? location.pathname}`;
    const img = image || `${env.siteUrl}/icons/icon-512.png`;
    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', img);
    setMeta('property', 'og:type', type);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', img);

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = url;

    const id = 'ojasss-jsonld';
    document.getElementById(id)?.remove();
    if (jsonLd) {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = id;
      s.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(s);
    }
  }, [title, description, path, image, type, noindex, jsonLd]);
}
