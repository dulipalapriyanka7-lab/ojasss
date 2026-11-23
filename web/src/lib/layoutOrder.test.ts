import { describe, expect, it } from 'vitest';
import { orderedItems } from './layoutOrder';
import { CATEGORIES } from './constants';
describe('Home positions',()=>{
 it('matches the reference category order and retains Public Complaint',()=>{expect(CATEGORIES.map(c=>c.value)).toEqual(['one_chance','entertainment','technology','education','gaming','lifestyle','horror_stories','music_dance','world_education','business_promotion','part_time_jobs','full_time_jobs','news','public_complaint']);});
 it('keeps every category when an older saved order omits new categories',()=>{const sorted=orderedItems(CATEGORIES,['news','entertainment']);expect(sorted.slice(0,2).map(c=>c.value)).toEqual(['news','entertainment']);expect(new Set(sorted.map(c=>c.value)).size).toBe(CATEGORIES.length);});
});
