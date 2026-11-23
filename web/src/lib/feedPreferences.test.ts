import { beforeEach, describe, expect, it } from 'vitest';
import { readAutoScroll, saveAutoScroll } from './feedPreferences';
beforeEach(()=>localStorage.clear());
describe('auto-scroll preference',()=>{it('starts off and remembers an explicit toggle',()=>{expect(readAutoScroll()).toBe(false);saveAutoScroll(true);expect(readAutoScroll()).toBe(true);saveAutoScroll(false);expect(readAutoScroll()).toBe(false);});});
