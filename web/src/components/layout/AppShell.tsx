

import { useQuery } from '@tanstack/react-query';
import {
  Bell, Bookmark, Store, Gamepad2, Plus, Home, IndianRupee, LogIn, MessageCircle, Monitor, Moon, PlusSquare, Settings, Shield, Sun, User, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import {platform} from '@/lib/platform';
import {preloadScreen} from '@/lib/preloadScreen';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { notifications } from '@/api';
import { useMonsterGameStatus } from '@/api/monsterGame';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationStream } from '@/hooks/useRealtime';
import { useTheme, type ThemePref } from '@/hooks/useTheme';
import { cn, useOnline } from '@/lib/utils';
import { CountryPrompt } from '@/components/CountryPrompt';
import { AccountTypePrompt } from '@/components/AccountTypePrompt';
import { PageLoader } from '../ui/Feedback';
import { Avatar, Logo } from '../ui/Misc';
import { useToast } from '../ui/Toast';
import { AnnouncementBanner, AnnouncementHeaderIcon } from './AnnouncementBanner';
import { FeatureTour } from './FeatureTour';
import { Dialog } from '../ui/Overlay';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** live players in Monster Fight (green pill) */
  live?: number;
  end?: boolean;
  auth?: boolean;
}

function useUnread(enabled: boolean) {
  return useQuery({
    queryKey: ['unread'],
    queryFn: notifications.unreadCounts,
    enabled,
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-on-brand ring-2 ring-surface tabular">
      <span className="sr-only">, </span>{n > 99 ? '99+' : n}<span className="sr-only"> unread</span>
    </span>
  );
}

const THEMES: Array<{ v: ThemePref; icon: LucideIcon; label: string }> = [
  { v: 'light', icon: Sun, label: 'Light theme' },
  { v: 'dark', icon: Moon, label: 'Dark theme' },
  { v: 'system', icon: Monitor, label: 'System theme' },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex rounded-full bg-surface-2 p-1', className)}>
      {THEMES.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={pref === v}
          aria-label={label}
          title={label}
          onClick={() => setPref(v)}
          className={cn('flex size-8 items-center justify-center rounded-full transition-colors', pref === v ? 'bg-surface text-fg shadow-soft' : 'text-fg-3 hover:text-fg')}
        >
          <Icon aria-hidden size={16} />
        </button>
      ))}
    </div>
  );
}

function SideNav({ items }: { items: NavItem[] }) {
  const { me, isStaff } = useAuth();
  return (
    <aside
      aria-label="Primary"
      className="sticky top-0 hidden h-svh shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[76px] lg:w-[248px]"
    >
      <Link to="/" className="flex h-[72px] items-center px-5 lg:px-6" aria-label="OJASSS home">
        {/* One logo; the wordmark only shows when the sidebar is wide. (cn is plain clsx, so
            toggling display utilities on the wrapper doesn't override its inline-flex.) */}
        <Logo textClassName="hidden lg:inline" />
      </Link>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            title={it.label}
            className={({ isActive }) => cn(
              'group flex h-12 items-center gap-3.5 rounded-xl px-3 text-[15px] font-medium transition-colors md:justify-center lg:justify-start',
              isActive ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-2/70 hover:text-fg',
            )}
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <it.icon aria-hidden size={23} strokeWidth={isActive ? 2.4 : 1.9} className={cn(isActive && 'text-brand')} />
                  <Badge n={it.badge} />
                </span>
                <span className={cn('md:sr-only lg:not-sr-only', isActive && 'font-semibold')}>{it.label}</span>
              </>
            )}
          </NavLink>
        ))}
        {isStaff && (
          <NavLink
            to="/admin"
            title="Admin"
            className={({ isActive }) => cn(
              'mt-2 flex h-12 items-center gap-3.5 rounded-xl border border-dashed px-3 text-[15px] font-medium transition-colors md:justify-center lg:justify-start',
              isActive ? 'border-viral/40 bg-viral-soft text-viral' : 'border-line text-fg-2 hover:bg-surface-2',
            )}
          >
            <Shield aria-hidden size={22} />
            <span className="md:sr-only lg:not-sr-only">Admin</span>
          </NavLink>
        )}
      </nav>
      <div className="flex flex-col gap-3 border-t border-line p-3">
        <ThemeSwitcher className="hidden self-start lg:inline-flex" />
        {me ? (
          <Link to="/settings" className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2 md:justify-center lg:justify-start" title="Settings">
            <Avatar path={me.avatar_path} name={me.display_name || me.username} size={36} />
            <span className="min-w-0 md:hidden lg:block">
              <span className="block truncate text-sm font-semibold">{me.display_name || me.username}</span>
              <span className="block truncate text-xs text-fg-3">@{me.username}</span>
            </span>
            <Settings aria-hidden size={18} className="ml-auto text-fg-3 md:hidden lg:block" />
          </Link>
        ) : (
          <Link to="/login" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-gradient text-sm font-semibold text-on-brand">
            <LogIn aria-hidden size={18} />
            <span className="md:sr-only lg:not-sr-only">Sign in</span>
          </Link>
        )}
      </div>
    </aside>
  );
}

function BottomNav({ items, immersive }: { items: NavItem[]; immersive: boolean }) {
  const location=useLocation();const inOneChance=location.pathname==='/'&&new URLSearchParams(location.search).get('category')==='one_chance';
  const [feedFooterHidden,setFeedFooterHidden]=useState(true);
  useEffect(()=>{if(immersive&&feedFooterHidden)document.documentElement.dataset.feedFooterHidden='true';else delete document.documentElement.dataset.feedFooterHidden;return()=>{delete document.documentElement.dataset.feedFooterHidden;};},[immersive,feedFooterHidden]);
  useEffect(()=>{const listener=(event:Event)=>setFeedFooterHidden((event as CustomEvent<{hidden:boolean}>).detail.hidden);window.addEventListener('ojasss:feed-footer',listener);return()=>window.removeEventListener('ojasss:feed-footer',listener);},[]);
  if(/^\/messages\/[^/]+\/?$/.test(location.pathname))return null;
  const hidden=immersive&&feedFooterHidden;
  return <nav aria-label="Primary" aria-hidden={hidden||undefined} inert={hidden} data-feed-overlay={immersive||undefined} data-feed-overlay-hidden={hidden||undefined} data-theme={immersive?'dark':undefined} className="premium-bottom-nav fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 mx-auto max-w-lg rounded-3xl border border-line bg-surface/90 p-1 shadow-float backdrop-blur-2xl md:hidden"><ul className="flex h-14 items-stretch">
    {items.map(item=><li key={item.to} className="flex min-w-0 flex-1"><NavLink to={item.to} end={item.end} aria-label={item.label} onPointerEnter={()=>preloadScreen(item.to)} onFocus={()=>preloadScreen(item.to)} onTouchStart={()=>preloadScreen(item.to)} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-medium transition-colors">{({isActive:routerActive})=>{const isActive=item.to.startsWith('/?')?inOneChance:item.to==='/'?routerActive&&!inOneChance:routerActive;return item.to==='/upload'?<><span className="flex size-11 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-[0_6px_20px_-8px_#EC2C83]"><Plus aria-hidden size={27}/></span><span className="sr-only">Create</span></>:<><span className={cn('relative flex h-8 w-11 items-center justify-center rounded-xl transition-colors',item.to==='/?category=one_chance'?'one-chance-shine text-white':isActive?'bg-brand-gradient text-white':'text-fg-3')}><item.icon aria-hidden size={21} strokeWidth={isActive?2.3:1.8}/><Badge n={item.badge}/>{!!item.live&&<span className="nav-live-pill" aria-label={item.live+' playing now'}><i aria-hidden/>{item.live>999?Math.floor(item.live/100)/10+'k':item.live}</span>}</span><span aria-hidden className={isActive?'text-fg':'text-fg-3'}>{item.label}</span></>;}}</NavLink></li>)}
  </ul></nav>;
}

function MobileTopBar({ unread }: { unread: number }) {
  const { me, isStaff } = useAuth();
  return (
    <header className="glass sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line px-4 pt-safe md:hidden">
      <Link to="/" aria-label="OJASSS home" className="profile-header-brand"><img src="/brand/mark.png" alt="" width="24" height="24"/><span>OJASSS</span></Link>
      <div className="flex items-center gap-1">
        <AnnouncementHeaderIcon />
        {isStaff && (
          <Link to="/admin" aria-label="Admin" className="flex size-11 items-center justify-center rounded-full text-viral hover:bg-surface-2">
            <Shield aria-hidden size={18} />
          </Link>
        )}
        {me && (
          <Link to="/earnings" aria-label="Earnings" className="flex size-11 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2">
            <IndianRupee aria-hidden size={18} />
          </Link>
        )}
        <Link to={me ? '/notifications' : '/login'} aria-label="Notifications" className="relative flex size-11 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2">
          <span className="relative"><Bell aria-hidden size={18} /><Badge n={unread} /></span>
        </Link>
      </div>
    </header>
  );
}

function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[150] bg-warning px-4 py-1.5 text-center text-xs font-semibold text-black pt-safe">
      You are offline — showing what was already loaded.
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {

  const { me, session } = useAuth();
  const game = useMonsterGameStatus();
  const location = useLocation();
  useEffect(()=>{if(location.pathname==='/')return;const frame=requestAnimationFrame(()=>platform.send({type:'ui_ready'}));return()=>cancelAnimationFrame(frame);},[location.pathname]);
  const navigate = useNavigate();
  const toast = useToast();
  const unread = useUnread(!!session);
  const episodeUnlocks = useQuery({queryKey:['episode-unlock-prompt'],queryFn:()=>notifications.list(null,true,20),enabled:!!session,staleTime:20_000,refetchInterval:60_000});
  const [dismissedEpisodeUnlock,setDismissedEpisodeUnlock]=useState('');
  const episodeUnlock=episodeUnlocks.data?.find(item=>item.type==='episode_unlock'&&item.id!==dismissedEpisodeUnlock)??null;
  const closeEpisodeUnlock=()=>{if(!episodeUnlock)return;setDismissedEpisodeUnlock(episodeUnlock.id);void notifications.markRead([episodeUnlock.id]);};

  useNotificationStream(me?.id ?? null, (n) => {
    if (n.type === 'message' && location.pathname.startsWith('/messages')) return;
    toast.info(n.title, n.link ? { label: 'View', onClick: () => navigate(n.link!) } : undefined);
  });


  const immersive = location.pathname === '/' || /^\/post\/[^/]+\/?$/.test(location.pathname);
  const chatting = /^\/messages\/[^/]+\/?$/.test(location.pathname);
  const communityChat=location.pathname==='/messages/one-chance-leaders';const ownHeader=location.pathname.startsWith('/tickets')||location.pathname.startsWith('/premiere')||location.pathname.startsWith('/real-estate');const noAnnounce=ownHeader||location.pathname.startsWith('/discover');
  const profileTo = me ? `/profile/${me.username}` : '/login';
  const counts = unread.data ?? { notifications: 0, messages: 0 };
  const gameItems: NavItem[] = (game.data?.can_play||(game.data as {entry_required?:boolean}|undefined)?.entry_required)
    ? [{ to: '/games', label: 'Games', icon: Gamepad2, live: game.data?.live_players ?? 0 }]
    : [];

  const desktopItems: NavItem[] = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/explore', label: 'Business', icon: Store },
    { to: '/upload', label: 'Upload', icon: PlusSquare },
    { to: '/messages', label: 'Messages', icon: MessageCircle, badge: Number(counts.messages) },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: Number(counts.notifications) },
    { to: '/earnings', label: 'Earnings', icon: IndianRupee },
    { to: '/saved', label: 'Saved', icon: Bookmark },
    ...gameItems,
    { to: profileTo, label: 'Profile', icon: User },
  ];
  const mobileItems: NavItem[] = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/explore', label: 'Business', icon: Store },
    { to: '/upload', label: 'Create', icon: Plus },
    { to: '/?category=one_chance', label: 'One Chance', icon: Sparkles },
    ...gameItems,
    { to: profileTo, label: 'Profile', icon: User },
  ];

  return (
    <div className="flex min-h-svh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[300] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-float">
        Skip to content
      </a>
      <OfflineBar />
      <FeatureTour />
      <CountryPrompt />
      <AccountTypePrompt />
      <Dialog open={!!episodeUnlock} onClose={closeEpisodeUnlock} title="Your episode is unlocked" description={episodeUnlock?.body} size="sm" className="ojass-glass-sheet" footer={<><button type="button" onClick={closeEpisodeUnlock} className="btn btn-secondary">Later</button><Link to={episodeUnlock?.link??'/upload?episode=1'} onClick={closeEpisodeUnlock} className="btn btn-primary">Upload next episode</Link></>}><div className="episode-unlock-popup"><Sparkles aria-hidden size={22}/><div><b>Audience goal reached</b><p>15 viewers unlocked this episode. Keep the story moving with your next upload.</p></div></div></Dialog>
      <div data-feed-navigation className="contents"><SideNav items={desktopItems} /></div>
      <div className="flex min-w-0 flex-1 flex-col">
        {!immersive&&!communityChat&&!ownHeader && <MobileTopBar unread={Number(counts.notifications)} />}
        {!immersive&&!communityChat&&!noAnnounce && <AnnouncementBanner />}
        <main id="main" tabIndex={-1} className={cn('min-w-0 flex-1 outline-none', !immersive && !chatting && 'pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-0')}>
          <Suspense fallback={<PageLoader />}>{children ?? <Outlet />}</Suspense>
        </main>
      </div>
      {<div data-feed-navigation className="contents"><BottomNav items={mobileItems} immersive={immersive} /></div>}
    </div>
  );
}

/** Centered content column used by most in-app pages. */
export function Page({ children, className, width = 'md' }: { children: ReactNode; className?: string; width?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const max = { sm: 'max-w-xl', md: 'max-w-3xl', lg: 'max-w-5xl', xl: 'max-w-7xl' }[width];
  return <div className={cn('mx-auto w-full px-4 py-5 sm:px-6 md:py-8 lg:px-8', max, className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-fg-3 sm:text-[15px]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
