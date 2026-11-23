import {Smartphone} from 'lucide-react';
import {platform} from '@/lib/platform';
import {env} from '@/lib/env';
export function androidPostIntent(postId:string,site:string):string {
 const url=new URL('/post/'+encodeURIComponent(postId),site);
 return `intent://${url.host}${url.pathname}#Intent;scheme=https;package=com.ojasss.app;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
}
export function OpenInAppButton({postId}:{postId:string}){
 if(platform.isAndroidApp()||!/Android/i.test(navigator.userAgent))return null;
 return <a href={androidPostIntent(postId,env.siteUrl)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-gradient px-4 text-xs font-semibold text-white"><Smartphone size={15} aria-hidden/>Open video in OJASSS app</a>;
}
