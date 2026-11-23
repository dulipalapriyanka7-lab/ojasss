import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Megaphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { reference } from '@/api';
import { env } from '@/lib/env';
import { platform } from '@/lib/platform';
const ANNOUNCEMENT_SEEN_KEY='ojasss-last-seen-announcement';

/** Header indicator for new admin announcements. It does not alter navigation or feed controls. */
export function AnnouncementHeaderIcon(){
  const announcements=useQuery({
    queryKey:['announcements'], queryFn:reference.announcements,
    staleTime:15_000, refetchInterval:30_000, refetchOnMount:'always',
    enabled:env.configured||env.mysql,
  });
  const latest=[...(announcements.data??[])].sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at))[0];
  const [seen,setSeen]=useState(()=>localStorage.getItem(ANNOUNCEMENT_SEEN_KEY)??'');
  const isNew=!!latest&&latest.id!==seen;
  const open=()=>{if(!latest)return;setSeen(latest.id);try{localStorage.setItem(ANNOUNCEMENT_SEEN_KEY,latest.id);}catch{/* local state remains */}};
  return <Link to="/updates?tab=announcements" onClick={open} className="announcement-header-icon" aria-label={isNew?'New announcement':'Announcements'}><Megaphone aria-hidden size={17}/>{isNew&&<span aria-label="New announcement" className="announcement-header-dot"/>}</Link>;
}

/** A compact public announcement. Personal tasks stay in the Updates screen. */
export function AnnouncementBanner() {
  // This is intentionally public: an active announcement must be visible to
  // visitors, signed-in members, and the Android web view alike.  A short
  // refresh interval also makes an admin publish/edit visible promptly.
  const announcements = useQuery({
    queryKey: ['announcements'], queryFn: reference.announcements,
    staleTime: 15_000, refetchInterval: 30_000, refetchOnMount: 'always',
    enabled: env.configured || env.mysql,
  });
  const announcement=useMemo(()=>[...(announcements.data??[])].sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at))[0], [announcements.data]);
  if (!announcement) return null;
  const announcementAction = announcement.cta_url?.startsWith('https://') ? <button type="button" onClick={() => platform.openExternal(announcement.cta_url!)} className="feed-notice-action">{announcement.cta_label||'View'} <ChevronRight size={14} aria-hidden /></button> : announcement.cta_url?.startsWith('/') ? <Link to={announcement.cta_url} className="feed-notice-action">{announcement.cta_label||'View'} <ChevronRight size={14} aria-hidden /></Link> : <Link to="/updates?tab=announcements" className="feed-notice-action">View <ChevronRight size={14} aria-hidden /></Link>;
  return <aside id="feed-announcement" aria-label="Active announcement" className="feed-notice feed-notice-announcement" role="status">
    <div className="feed-notice-icon"><Megaphone aria-hidden size={17} /></div>
    <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">Announcement · {announcement.title}</p><p className="truncate text-[11px] text-fg-2">{announcement.message}</p></div>
    {announcementAction}
  </aside>;
}
