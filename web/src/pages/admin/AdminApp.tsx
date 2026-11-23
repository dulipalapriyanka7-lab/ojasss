import './users-slim.css';
import './admin-business.css';
import AdminMemberProgram from '@/pages/MemberProgram';
import CompetitionSettings from './CompetitionSettings';
import {
  ArrowLeft, BarChart3, Briefcase, Clapperboard, ClipboardCheck, Crown, FileClock, Flag, Gauge, Image as ImageIcon, IndianRupee, Megaphone, Menu,
  Scale, Settings, ShieldAlert, Trash2, Users, Wallet, X, BellRing, Gamepad2, type LucideIcon,
  MapPin, Coins, Ticket, Wine, Trophy, Building2, MessageSquareMore,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeSwitcher } from '@/components/layout/AppShell';
import { RequireStaff } from '@/components/layout/Guards';
import { PageLoader } from '@/components/ui/Feedback';
import { Avatar, Logo } from '@/components/ui/Misc';
import WeeklyUsageReport from '@/pages/WeeklyUsage';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/utils';

const AdminBusiness = lazy(() => import('./AdminBusiness'));
const AdminDemoVideos = lazy(() => import('./AdminDemoVideos'));
const AdminCityReport = lazy(() => import('./AdminCityReport'));
const AdminCoins = lazy(() => import('./AdminCoins'));
const AdminTickets = lazy(() => import('./AdminTickets'));
const AdminShows = lazy(() => import('./AdminShows'));
const AdminPubs = lazy(() => import('./AdminPubs'));
const AdminPrizes = lazy(() => import('./AdminPrizes'));
const AdminRealEstate = lazy(() => import('./AdminRealEstate'));
const AdminFeedback = lazy(() => import('./AdminFeedback'));
const AssignTasks = lazy(() => import('./AssignTasksPage'));
const Dashboard = lazy(() => import('./AdminDashboard'));
const Analytics = lazy(() => import('./AdminDashboard').then((m) => ({ default: m.AdminAnalytics })));
const UsersPage = lazy(() => import('./AdminUsers'));
const ContentPage = lazy(() => import('./AdminContent'));
const Complaints = lazy(() => import('./AdminComplaints'));
const Reports = lazy(() => import('./AdminReports'));
const Safety = lazy(() => import('./AdminReports').then((m) => ({ default: m.AdminSafety })));
const Earnings = lazy(() => import('./AdminMoney'));
const Withdrawals = lazy(() => import('./AdminMoney').then((m) => ({ default: m.AdminWithdrawals })));
const SettingsPage = lazy(() => import('./AdminSystem'));
const ViralChallenges = lazy(() => import('./AdminViralChallenges'));
const AdminMonsterGame = lazy(() => import('./AdminMonsterGame'));
const OneChancePromotions = lazy(() => import('@/components/admin/OneChanceAdminPanel').then((m) => ({ default: m.OneChanceAdminPanel })));
const PushPage = lazy(() => import('./AdminPushPage'));
const Announcements = lazy(() => import('./AdminSystem').then((m) => ({ default: m.AdminAnnouncements })));
const Deletion = lazy(() => import('./AdminSystem').then((m) => ({ default: m.AdminDeletion })));
const Logs = lazy(() => import('./AdminSystem').then((m) => ({ default: m.AdminLogs })));
const Inquiries = lazy(() => import('./AdminSystem').then((m) => ({ default: m.AdminInquiries })));

interface Item { to: string; label: string; icon: LucideIcon; adminOnly?: boolean; group: string }

const NAV: Item[] = [
  { to: '/admin', label: 'Dashboard', icon: Gauge, group: 'Overview' },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, group: 'Overview' },
  { to: '/admin/users', label: 'Users', icon: Users, group: 'Community' },
  { to: '/admin/videos', label: 'Videos', icon: Clapperboard, group: 'Community' },
  { to: '/admin/posters', label: 'Posters', icon: ImageIcon, group: 'Community' },
  { to: '/admin/complaints', label: 'Complaints', icon: Scale, group: 'Trust & safety' },
  { to: '/admin/reports', label: 'Reports', icon: Flag, group: 'Trust & safety' },
  { to: '/admin/safety', label: 'Safety', icon: ShieldAlert, group: 'Trust & safety' },
  { to: '/admin/earnings', label: 'Earnings', icon: IndianRupee, adminOnly: true, group: 'Money' },
  { to: '/admin/withdrawals', label: 'Withdrawals', icon: Wallet, adminOnly: true, group: 'Money' },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, group: 'Platform' },
  { to: '/admin/assign-tasks', label: 'Assign Tasks', icon: ClipboardCheck, adminOnly: true, group: 'Platform' },
  { to: '/admin/viral-challenges', label: 'Viral Challenges', icon: Crown, adminOnly: true, group: 'Platform' },
  { to: '/admin/games', label: 'Games', icon: Gamepad2, adminOnly: true, group: 'Platform' },
  { to: '/admin/member-program', label: 'Tasks & withdrawal hours', icon: BellRing, adminOnly: true, group: 'Platform' },
  { to: '/admin/weekly-usage', label: 'Weekly active time', icon: BellRing, adminOnly: true, group: 'Platform' },
  { to: '/admin/competition', label: 'Weekly competition · NEW', icon: Crown, adminOnly: true, group: 'Platform' },
  { to: '/admin/business', label: 'Business & E-Commerce · NEW', icon: Briefcase, group: 'Platform' },
  { to: '/admin/demo-videos', label: 'Demo videos · NEW', icon: Clapperboard, adminOnly: true, group: 'Platform' },
  { to: '/admin/feedback', label: 'User Feedback · NEW', icon: MessageSquareMore, adminOnly: true, group: 'Platform' },
  { to: '/admin/real-estate', label: 'Real Estate · NEW', icon: Building2, adminOnly: true, group: 'Platform' },
  { to: '/admin/prizes', label: 'Leaderboard prizes · NEW', icon: Trophy, adminOnly: true, group: 'Platform' },
  { to: '/admin/pubs', label: 'Pub Events · NEW', icon: Wine, adminOnly: true, group: 'Platform' },
  { to: '/admin/shows', label: 'Premiere show · NEW', icon: Clapperboard, adminOnly: true, group: 'Platform' },
  { to: '/admin/tickets', label: 'Tickets · NEW', icon: Ticket, adminOnly: true, group: 'Platform' },
  { to: '/admin/coins', label: 'Game coins · NEW', icon: Coins, adminOnly: true, group: 'Platform' },
  { to: '/admin/cities', label: 'City report · NEW', icon: MapPin, adminOnly: true, group: 'Platform' },
  { to: '/admin/push', label: 'Custom push', icon: BellRing, adminOnly: true, group: 'Platform' },
  { to: '/admin/one-chance', label: 'One Chance promotions', icon: Crown, adminOnly: true, group: 'Platform' },
  { to: '/admin/inquiries', label: 'Business inquiries', icon: Briefcase, group: 'Platform' },
  { to: '/admin/deletion', label: 'Deletion requests', icon: Trash2, adminOnly: true, group: 'Platform' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, adminOnly: true, group: 'Platform' },
  { to: '/admin/logs', label: 'Admin logs', icon: FileClock, adminOnly: true, group: 'Platform' },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin } = useAuth();
  const items = NAV.filter((i) => isAdmin || i.to === '/admin/business');
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-3">
      {groups.map((g) => (
        <div key={g} className="mb-4">
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-fg-3 uppercase">{g}</p>
          <ul className="space-y-0.5">
            {items.filter((i) => i.group === g).map((i) => (
              <li key={i.to}>
                <NavLink
                  to={i.to}
                  end={i.to === '/admin'}
                  onClick={onNavigate}
                  className={({ isActive }) => cn('flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors', isActive ? 'bg-fg text-bg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg')}
                >
                  <i.icon aria-hidden size={17} />{i.label.endsWith(' · NEW')?<>{i.label.slice(0,-6)}<span className="nav-new-tag">NEW</span></>:i.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function AdminApp() {
  const { me, isAdmin } = useAuth();
  const roleLabel = isAdmin ? 'Admin' : 'Moderator';
  useSeo({ title: roleLabel, noindex: true });
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const current = NAV.find((n) => (n.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(n.to)));

  const brand = (
    <div className="flex h-16 items-center gap-2 border-b border-line px-5">
      <Logo compact />
      <span className="font-display text-lg font-bold">OJASSS</span>
      <span className="rounded-md bg-viral-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-viral uppercase">{roleLabel}</span>
    </div>
  );
  const footer = (
    <div className="space-y-3 border-t border-line p-3">
      <ThemeSwitcher />
      <Link to="/" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-fg-2 hover:bg-surface-2"><ArrowLeft aria-hidden size={16} /> Back to OJASSS</Link>
      {me && (
        <div className="flex items-center gap-2 px-2">
          <Avatar path={me.avatar_path} name={me.display_name || me.username} size={30} />
          <span className="min-w-0 text-xs"><span className="block truncate font-semibold">@{me.username}</span><span className="text-fg-3 capitalize">{me.role}</span></span>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-svh bg-bg">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">{brand}<Nav />{footer}</aside>

      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-[var(--overlay)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} aria-hidden />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Admin navigation"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface pt-safe shadow-float"
            >
              <div className="relative">{brand}<button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full hover:bg-surface-2"><X size={20} /></button></div>
              <Nav onNavigate={() => setDrawer(false)} />
              {footer}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line px-3 pt-safe lg:hidden">
          <button type="button" aria-label="Open admin menu" onClick={() => setDrawer(true)} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2"><Menu size={22} /></button>
          <span className="font-semibold">{current?.label.replace(' · NEW', '') ?? roleLabel}</span>
        </header>
        <main id="main" className="adm-slim mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<PageLoader />}>
            {!isAdmin && !location.pathname.startsWith('/admin/business') ? <Navigate to="/admin/business" replace /> : <Routes>
              <Route index element={<Dashboard />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="videos" element={<ContentPage kind="video" />} />
              <Route path="posters" element={<ContentPage kind="poster" />} />
              <Route path="complaints" element={<Complaints />} />
              <Route path="reports" element={<Reports />} />
              <Route path="safety" element={<Safety />} />
              <Route path="earnings" element={<RequireStaff adminOnly><Earnings /></RequireStaff>} />
              <Route path="withdrawals" element={<RequireStaff adminOnly><Withdrawals /></RequireStaff>} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="assign-tasks" element={<RequireStaff adminOnly><AssignTasks /></RequireStaff>} />
              <Route path="member-program" element={<RequireStaff adminOnly><AdminMemberProgram /></RequireStaff>} />
              <Route path="viral-challenges" element={<RequireStaff adminOnly><ViralChallenges /></RequireStaff>} />
              <Route path="games" element={<RequireStaff adminOnly><AdminMonsterGame /></RequireStaff>} />
              <Route path="weekly-usage" element={<RequireStaff adminOnly><WeeklyUsageReport /></RequireStaff>} />
              <Route path="competition" element={<RequireStaff adminOnly><CompetitionSettings /></RequireStaff>} />
              <Route path="business" element={<RequireStaff><AdminBusiness /></RequireStaff>} />
              <Route path="demo-videos" element={<RequireStaff adminOnly><AdminDemoVideos /></RequireStaff>} />
              <Route path="cities" element={<RequireStaff adminOnly><AdminCityReport /></RequireStaff>} />
              <Route path="coins" element={<RequireStaff adminOnly><AdminCoins /></RequireStaff>} />
              <Route path="tickets" element={<RequireStaff adminOnly><AdminTickets /></RequireStaff>} />
              <Route path="shows" element={<RequireStaff adminOnly><AdminShows /></RequireStaff>} />
              <Route path="pubs" element={<RequireStaff adminOnly><AdminPubs /></RequireStaff>} />
              <Route path="prizes" element={<RequireStaff adminOnly><AdminPrizes /></RequireStaff>} />
              <Route path="real-estate" element={<RequireStaff adminOnly><AdminRealEstate /></RequireStaff>} />
              <Route path="feedback" element={<RequireStaff adminOnly><AdminFeedback /></RequireStaff>} />
              <Route path="push" element={<RequireStaff adminOnly><PushPage /></RequireStaff>} />
              <Route path="one-chance" element={<RequireStaff adminOnly><OneChancePromotions /></RequireStaff>} />
              <Route path="inquiries" element={<Inquiries />} />
              <Route path="deletion" element={<RequireStaff adminOnly><Deletion /></RequireStaff>} />
              <Route path="settings" element={<RequireStaff adminOnly><SettingsPage /></RequireStaff>} />
              <Route path="logs" element={<RequireStaff adminOnly><Logs /></RequireStaff>} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
