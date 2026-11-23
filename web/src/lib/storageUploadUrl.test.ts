import {expect,it} from 'vitest';
import {storageUploadUrl} from './storageUploadUrl';
it('keeps Hostinger image upload filenames in the query instead of the route',()=>{
 const value=new URL(storageUploadUrl('https://ojasss.com/api','media','owner/file.png',true));
 expect(value.pathname).toBe('/api/storage-upload');expect(value.searchParams.get('path')).toBe('owner/file.png');expect(value.searchParams.get('bucket')).toBe('media');
});
it('preserves the Supabase storage endpoint',()=>{expect(storageUploadUrl('https://example.supabase.co','media','owner/file.mp4',false)).toBe('https://example.supabase.co/storage/v1/object/media/owner/file.mp4');});
