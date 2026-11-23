import {it,expect,beforeEach} from 'vitest';
import {categorySetupTarget} from './categorySetup';
import {androidPostIntent} from '@/components/post/OpenInAppButton';
beforeEach(()=>sessionStorage.clear());
it('opens categories after login even with saved preferences and preserves shared video',()=>{
 expect(categorySetupTarget({id:'member',onboarded:true,category_preferences:{selected:[],show_all:true}},'/post/abc','?source=share')).toBe('/categories?next=%2Fpost%2Fabc%3Fsource%3Dshare');
});
it('asks once per login and asks again after logout clears the choice marker',()=>{
 const me={id:'member',onboarded:true};sessionStorage.setItem('ojasss-category-session:member','chosen');expect(categorySetupTarget(me,'/')).toBeNull();sessionStorage.removeItem('ojasss-category-session:member');expect(categorySetupTarget(me,'/')).toBe('/categories?next=%2F');
});
it('does not interrupt profile setup, sign-in or the category page',()=>{
 expect(categorySetupTarget({onboarded:false},'/')).toBeNull();expect(categorySetupTarget({onboarded:true},'/categories')).toBeNull();expect(categorySetupTarget({onboarded:true},'/auth/callback')).toBeNull();
});
it('opens the exact reel in Android with a matching web fallback',()=>{const link=androidPostIntent('video-id','https://new.ojasss.com');expect(link).toContain('intent://new.ojasss.com/post/video-id#Intent;scheme=https;package=com.ojasss.app;');expect(link).toContain('S.browser_fallback_url=https%3A%2F%2Fnew.ojasss.com%2Fpost%2Fvideo-id');});
