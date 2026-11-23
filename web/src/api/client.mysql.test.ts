import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/env',()=>({env:{configured:true,mysql:true,supabaseUrl:'https://example.test/api',supabaseAnonKey:'public-test-key'}}));
vi.mock('@/lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})},functions:{invoke:()=>{throw new Error('MySQL must use its own endpoint');}}}}));
import {invoke} from './client';
afterEach(()=>vi.unstubAllGlobals());
it('publishes to the exact MySQL endpoint with the current session',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'post',status:'published'}),{status:200}));vi.stubGlobal('fetch',fetcher);
 await expect(invoke('create-post',{caption:'Test'})).resolves.toEqual({id:'post',status:'published'});
 expect(fetcher).toHaveBeenCalledWith('https://example.test/api/functions/v1/create-post',expect.objectContaining({method:'POST',headers:expect.objectContaining({Authorization:'Bearer test-session'}),body:'{"caption":"Test"}'}));
});
it('preserves actionable upload validation messages',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:'INVALID_MEDIA',message:'Upload the media first.'}}),{status:422})));
 await expect(invoke('create-post',{})).rejects.toMatchObject({code:'INVALID_MEDIA',message:'Upload the media first.'});
});
it('identifies a hosting route failure without the generic missing-content message',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>Not found</html>',{status:404})));
 await expect(invoke('create-post',{})).rejects.toMatchObject({message:'The upload service could not be reached. Refresh this page and try again.'});
});
