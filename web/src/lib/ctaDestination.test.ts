import {expect,it} from 'vitest';
import {allowedCtaDestination,formatCtaDestination} from './ctaDestination';
it('turns upload contact fields into usable call, email and WhatsApp links',()=>{
 expect(formatCtaDestination('phone','+91 9876543210')).toBe('tel:+919876543210');
 expect(formatCtaDestination('email','team@example.com')).toBe('mailto:team@example.com');
 expect(formatCtaDestination('whatsapp','+91 9876543210')).toBe('https://wa.me/919876543210');
 expect(formatCtaDestination('url','https://example.com/item?a=1')).toBe('https://example.com/item?a=1');
});
it('accepts supported actions and refuses unsafe destinations',()=>{
 for(const value of ['tel:+919876543210','mailto:team@example.com','https://wa.me/919876543210'])expect(allowedCtaDestination(value)).toBe(true);
 for(const value of ['javascript:alert(1)','https://name:secret@example.com','//example.com','+919876543210'])expect(allowedCtaDestination(value)).toBe(false);
});
