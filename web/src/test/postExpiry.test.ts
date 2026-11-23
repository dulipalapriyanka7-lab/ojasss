import { describe, expect, it } from 'vitest';
import { postExpiry, remainingTime } from '@/lib/postExpiry';

describe('48-hour posts', () => {
  const created_at = '2026-10-26T10:00:00.000Z';
  it('uses upload time for News Reporter and Part Time only', () => {
    for (const category of ['news', 'part_time_jobs'] as const) expect(postExpiry({category, created_at})).toBe(Date.parse('2026-10-28T10:00:00Z'));
    expect(postExpiry({category:'business_promotion',created_at})).toBeNull();
  });
  it('uses the server expiry without extending it', () => {
    expect(postExpiry({category:'news',created_at,expires_at:'2026-10-28T10:00:00Z'})).toBe(Date.parse('2026-10-28T10:00:00Z'));
  });
  it('preserves the server deadline after a viral post moves to One Chance',()=>{expect(postExpiry({category:'one_chance',created_at,expires_at:'2026-10-28T10:00:00Z'})).toBe(Date.parse('2026-10-28T10:00:00Z'));});
  it('retains the original category deadline after viral promotion',()=>{expect(postExpiry({category:'one_chance',source_category:'news',created_at})).toBe(Date.parse('2026-10-28T10:00:00Z'));});
  it('ignores invalid timestamps',()=>{expect(postExpiry({category:'news',created_at:'invalid'})).toBeNull();});
  it('counts down to zero and never displays negative time', () => {
    expect(remainingTime(172800000,0)).toBe('48:00:00');
    expect(remainingTime(1000,0)).toBe('00:00:01');
    expect(remainingTime(0,1000)).toBe('00:00:00');
  });
});
