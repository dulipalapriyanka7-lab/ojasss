import { describe, expect, it } from 'vitest';
import { ApiError, fromPostgrest, kindForStatus, toApiError } from '@/api/client';
import { count, duration, paiseFromRupeesInput, rupees } from '@/lib/format';
import { sniffBytes } from '@/lib/media';
import { safeInternalPath } from '@/lib/utils';

describe('API error normalisation', () => {
  it('maps PTxxx database errors to HTTP semantics with user-safe messages', () => {
    const e = fromPostgrest({ code: 'PT422', message: 'INSUFFICIENT_BALANCE', details: 'This amount is more than your available balance.' });
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ kind: 'validation', code: 'INSUFFICIENT_BALANCE', status: 422 });
    expect(e.message).toBe('This amount is more than your available balance.');
  });

  it('covers every status the UI must handle', () => {
    expect([400, 401, 403, 404, 409, 422, 429, 500, 503].map(kindForStatus)).toEqual([
      'bad_request', 'unauthenticated', 'forbidden', 'not_found', 'conflict', 'validation', 'rate_limited', 'server', 'unavailable',
    ]);
  });

  it('never leaks raw SQL or internal errors', () => {
    const e = fromPostgrest({ code: 'XX000', message: 'relation "secret_table" does not exist at character 17' });
    expect(e.kind).toBe('server');
    expect(e.message).not.toContain('secret_table');
  });

  it('detects expired sessions and permission errors', () => {
    expect(fromPostgrest({ code: 'PGRST303', message: 'JWT expired' }).kind).toBe('session_expired');
    expect(fromPostgrest({ code: '42501', message: 'permission denied for table earnings' }).kind).toBe('forbidden');
  });

  it('classifies network failures and timeouts as retryable', () => {
    expect(toApiError(new TypeError('Failed to fetch')).retryable).toBe(true);
    expect(toApiError(new DOMException('aborted', 'AbortError')).kind).toBe('timeout');
    expect(new ApiError('validation', 'X', 'x').retryable).toBe(false);
  });
});

describe('money & number formatting', () => {
  it('formats paise as INR without float drift', () => {
    expect(rupees(5000)).toBe('₹50.00');
    expect(rupees(123456789)).toBe('₹12,34,567.89');
  });
  it('parses rupee input into integer paise, rejecting junk and negatives', () => {
    expect(paiseFromRupeesInput('500')).toBe(50000);
    expect(paiseFromRupeesInput('₹1,250.5')).toBe(125050);
    expect(paiseFromRupeesInput('0.1')).toBe(10);
    expect(paiseFromRupeesInput('-5')).toBeNull();
    expect(paiseFromRupeesInput('1.234')).toBeNull();
    expect(paiseFromRupeesInput('abc')).toBeNull();
  });
  it('uses Indian compact notation', () => {
    expect(count(999)).toBe('999');
    expect(count(1500)).toMatch(/1\.5\s?K/i);
    expect(duration(75_000)).toBe('1:15');
  });
});

describe('client-side media sniffing matches the server', () => {
  const b = (...xs: Array<number[] | string>) => {
    const out: number[] = [];
    for (const x of xs) out.push(...(typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : x));
    while (out.length < 16) out.push(0);
    return new Uint8Array(out);
  };
  it('accepts real media and rejects disguised files', () => {
    expect(sniffBytes(b([0, 0, 0, 0x20], 'ftypisom'))).toBe('video/mp4');
    expect(sniffBytes(b([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(sniffBytes(b('MZ'))).toBeNull();
    expect(sniffBytes(b('<svg onload='))).toBeNull();
  });
});

describe('redirect safety', () => {
  it('only allows same-site relative paths (no open redirects)', () => {
    expect(safeInternalPath('/post/123')).toBe('/post/123');
    expect(safeInternalPath('https://evil.example')).toBe('/');
    expect(safeInternalPath('//evil.example')).toBe('/');
    expect(safeInternalPath('/\\evil.example')).toBe('/');
    expect(safeInternalPath(null, '/home')).toBe('/home');
  });
});
