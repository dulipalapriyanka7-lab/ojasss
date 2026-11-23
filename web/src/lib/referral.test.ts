import {it,expect,afterEach} from 'vitest';
import {captureReferral,savedReferral,clearReferral} from './referral';
afterEach(()=>localStorage.clear());
it('keeps a normalized invitation across Google signup and clears it after profile setup',()=>{captureReferral(' abcd123456 ');expect(savedReferral()).toBe('ABCD123456');clearReferral();expect(savedReferral()).toBe('');});
