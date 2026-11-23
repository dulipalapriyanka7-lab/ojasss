import { describe, expect, it } from 'vitest';
import { mapEmbedUrl } from './UploadLocationMap';
describe('upload location map',()=>{
 it('does not request Google without a location or key',()=>{expect(mapEmbedUrl('', 'key')).toBeNull();expect(mapEmbedUrl('Delhi','')).toBeNull();});
 it('encodes manual places without adding extra parameters',()=>{const url=new URL(mapEmbedUrl('Delhi & zoom=1','key')!);expect(url.searchParams.get('q')).toBe('Delhi & zoom=1');});
 it('converts approximate coordinates and hemispheres',()=>{const url=new URL(mapEmbedUrl('17.39° S, 78.49° W','key')!);expect(url.pathname).toContain('/view');expect(url.searchParams.get('center')).toBe('-17.39,-78.49');});
});
