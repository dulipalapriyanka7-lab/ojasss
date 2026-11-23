import {expect,it} from 'vitest';
import {notificationDestination} from './notificationLink';
it('preserves the exact notification screen and moves legacy links to the main app',()=>{
 expect(notificationDestination('/post/abc?speak=reply','https://ojasss.com')).toBe('https://ojasss.com/post/abc?speak=reply');
 expect(notificationDestination('https://new.ojasss.com/messages/abc','https://ojasss.com')).toBe('https://ojasss.com/messages/abc');
});
it('refuses unrelated sites and executable links',()=>{
 for(const value of ['https://evil.example/post/abc','javascript:alert(1)','https://user:secret@ojasss.com/'])expect(notificationDestination(value,'https://ojasss.com')).toBeNull();
});
