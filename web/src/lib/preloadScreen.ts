const loaded=new Map<string,Promise<unknown>>();
export function preloadScreen(destination:string):void{
 const path=destination.split('?')[0];
 const key=path.startsWith('/profile')?'/profile':path;
 const imports:Record<string,()=>Promise<unknown>>={
  '/upload':()=>import('@/pages/UploadPage'),
  '/profile':()=>import('@/pages/ProfilePage'),
  '/messages':()=>import('@/pages/MessagesPage'),
  '/explore':()=>import('@/pages/ExplorePage'),
  '/one-chance':()=>import('@/pages/OneChancePage'),
 };
 const load=imports[key];if(!load||loaded.has(key))return;
 loaded.set(key,load().catch(()=>{loaded.delete(key);}));
}
