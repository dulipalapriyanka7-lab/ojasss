import type { PostCard } from '@/api/types';

export function postExpiry(post: Pick<PostCard, 'category' | 'created_at' | 'expires_at' | 'source_category'>): number | null {
  if(post.expires_at){const deadline=Date.parse(post.expires_at);if(Number.isFinite(deadline))return deadline;}
  const category=post.source_category??post.category;
  if (category !== 'news' && category !== 'part_time_jobs') return null;
  const created=Date.parse(post.created_at);
  return Number.isFinite(created)?created+48*60*60*1000:null;
}

export function remainingTime(expires: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((expires - now) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
}
