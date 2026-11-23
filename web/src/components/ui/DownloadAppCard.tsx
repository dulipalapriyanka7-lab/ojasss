import {ArrowDownToLine,Smartphone} from 'lucide-react';
import {cn} from '@/lib/utils';
export const APK_DOWNLOAD='/downloads/OJASSS-WebView-1.0.32.apk';
export function DownloadAppCard({variant='default'}:{variant?:'default'|'profile'}){
 return <a href={APK_DOWNLOAD} download="OJASSS-WebView-1.0.32.apk" className={cn('app-download-card',variant==='profile'&&'profile-download-card')} aria-label="Download OJASSS Android app">
  <span className="app-download-icon"><Smartphone size={22}/></span>
  <span className="min-w-0 flex-1"><strong>OJASSS for Android <em className="app-new-tag">NEW</em></strong><span>WebView edition · v1.0.32</span></span>
  {variant==='profile'?<span className="profile-download-button"><ArrowDownToLine aria-hidden size={17}/><b>Download</b></span>:<ArrowDownToLine aria-hidden size={20} className="shrink-0"/>}
 </a>;
}

