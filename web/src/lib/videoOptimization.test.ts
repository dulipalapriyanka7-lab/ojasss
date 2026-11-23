import {afterEach,expect,it,vi} from 'vitest';
import {prepareVideo} from './videoOptimization';
afterEach(()=>vi.unstubAllGlobals());
it('keeps the correct original format when device encoding is unavailable',async()=>{
 vi.stubGlobal('Worker',undefined);const file=new File(['original'],'clip.mov',{type:'video/quicktime'});
 const result=await prepareVideo(file,'hd',{width:1080,height:1920,durationMs:1000,mime:'video/quicktime'},()=>{},new AbortController().signal);
 expect(result.blob).toBe(file);expect(result.mime).toBe('video/quicktime');expect(result.optimized).toBe(false);
});
it('cancels before starting an encoder when already aborted',async()=>{
 const controller=new AbortController();controller.abort();const file=new File(['original'],'clip.mp4',{type:'video/mp4'});
 await expect(prepareVideo(file,'hd',{width:1080,height:1920,durationMs:1000,mime:'video/mp4'},()=>{},controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
