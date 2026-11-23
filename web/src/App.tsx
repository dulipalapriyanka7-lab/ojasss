import {captureReferral} from '@/lib/referral';
import {categorySetupTarget} from '@/lib/categorySetup';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth, RequireStaff } from '@/components/layout/Guards';
import { PageLoader } from '@/components/ui/Feedback';
import { useWeeklyUsage } from '@/hooks/useWeeklyUsage';
import { useAuth } from '@/hooks/useAuth';
import { platform } from '@/lib/platform';
import { safeInternalPath } from '@/lib/utils';
import HomePage from '@/pages/HomePage';
import {TaskNotice} from '@/components/profile/TaskNotice';
import {ViralEntryNotice} from '@/components/profile/ViralEntryNotice';
import {OjasssSplashScreen,type SplashPhase} from '@/components/OjasssSplashScreen';
import {env} from '@/lib/env';

// Route-level code splitting: each screen is its own chunk.
const CategorySelectionPage=lazy(()=>import('@/pages/CategorySelectionPage'));
const MyCityPage=lazy(()=>import('@/pages/MyCityPage'));
const CoinsPage=lazy(()=>import('@/pages/CoinsPage'));
const TicketsPage=lazy(()=>import('@/pages/TicketsPage'));
const PremierePage=lazy(()=>import('@/pages/PremierePage'));
const ShowTicketPage=lazy(()=>import('@/pages/ShowTicketPage'));
const PubsPage=lazy(()=>import('@/pages/PubsPage'));
const RealEstatePage=lazy(()=>import('@/pages/RealEstatePage'));
const FeedbackPage=lazy(()=>import('@/pages/FeedbackPage'));
const ExplorePage = lazy(() => import('@/pages/BusinessHubPage'));
const AccountTypePage = lazy(() => import('@/components/AccountTypePrompt'));
const DiscoverPage = lazy(() => import('@/pages/ExplorePage'));
const MonsterGamePage = lazy(() => import('@/pages/MonsterGamePage'));
const GoogleSignInPage = lazy(() => import('@/pages/auth/GoogleSignInPage'));
const UploadPage = lazy(() => import('@/pages/UploadPage'));
const StatusUploadPage = lazy(() => import('@/pages/StatusUploadPage'));
const StatusViewPage = lazy(() => import('@/pages/StatusViewPage'));
const MyTasksPage = lazy(() => import('@/pages/MyTasksPage'));
const ViralHistoryPage = lazy(() => import('@/pages/ViralHistoryPage'));
const PostPage = lazy(() => import('@/pages/PostPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const MessagesPage = lazy(() => import('@/pages/MessagesPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const EarningsPage = lazy(() => import('@/pages/EarningsPage'));
const WithdrawPage = lazy(() => import('@/pages/WithdrawPage'));
const SavedPage = lazy(() => import('@/pages/SavedPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const BusinessPage = lazy(() => import('@/pages/BusinessPage'));
const ChallengesPage=lazy(()=>import('@/pages/ChallengesPage'));
const LeaderboardPage=lazy(()=>import('@/pages/CompetitionPremiumPage'));
const CompetitionTierPage=lazy(()=>import('@/pages/CompetitionTierPage'));
const OneChancePage=lazy(()=>import('@/pages/OneChancePage'));
const UpdatesPage=lazy(()=>import('@/pages/UpdatesPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const AuthCallbackPage = lazy(() => import('@/pages/auth/AuthCallbackPage'));

const LegalPage = lazy(() => import('@/pages/legal/LegalPage'));
const AccountDeletionPage = lazy(() => import('@/pages/legal/AccountDeletionPage'));
const ContactPage = lazy(() => import('@/pages/legal/ContactPage'));

const AdminApp = lazy(() => import('@/pages/admin/AdminApp'));

const LEGAL = [
  'about', 'privacy-policy', 'terms', 'refund-policy', 'community-guidelines',
  'earnings-terms', 'complaints-disclaimer', 'child-safety-standards',
] as const;

/** Keeps the Android shell informed so its back button and deep links behave natively. */
function NativeBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const {me}=useAuth();
  useWeeklyUsage(me?.id);
  useEffect(()=>{captureReferral(new URLSearchParams(location.search).get('ref'));},[location.search]);
  useEffect(()=>{const target=categorySetupTarget(me,location.pathname,location.search);if(target)navigate(target,{replace:true});},[me?.id,me?.onboarded,me?.category_preferences,me?.city,location.pathname,location.search,navigate]);
  useEffect(() => {
    platform.setRoute(location.pathname, window.history.length > 1 && location.key !== 'default');
  }, [location]);
  useEffect(() => platform.on((e) => {
    if (e.type === 'deep_link') navigate(safeInternalPath(e.path));
    if (e.type === 'back') document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  }), [navigate]);
  return null;
}

type FeedStartup = 'preparing'|'feed'|'ready'|'error';

function StartupCommit({onCommit}:{onCommit:(ready:boolean)=>void}) {
  useEffect(()=>onCommit(true),[onCommit]);
  return null;
}

function AppRoutes() {
  const {loading,session,me}=useAuth();
  const {pathname}=useLocation();
  const isFeed=pathname==='/'||/^\/post\/[^/]+\/?$/.test(pathname);
  const [committed,setCommitted]=useState(false);
  const [feedStartup,setFeedStartup]=useState<FeedStartup>('preparing');
  const [timedOut,setTimedOut]=useState(false);
  const [finished,setFinished]=useState(false);
  let phase:SplashPhase='preparing';
  if (timedOut||!env.configured||(!loading&&session&&!me)) phase='error';
  else if (!loading) phase=isFeed?feedStartup:committed?'ready':'preparing';
  const startupSettled=phase==='ready'||phase==='error';
  useEffect(()=>{
    if(finished||startupSettled)return;
    const timer=window.setTimeout(()=>setTimedOut(true),20000);
    return()=>window.clearTimeout(timer);
  },[finished,startupSettled]);
  useEffect(()=>{
    if(phase!=='ready'||finished)return;
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer=window.setTimeout(()=>setFinished(true),reduce?0:240);
    return()=>window.clearTimeout(timer);
  },[finished,phase]);
  return (
    <>
      {!finished&&<OjasssSplashScreen phase={phase} progress={phase==='ready'?100:undefined} onRetry={()=>window.location.reload()}/>}
      <NativeBridge />
      <TaskNotice/>
      <ViralEntryNotice/>
      <Suspense fallback={<PageLoader />}>
        <StartupCommit onCommit={setCommitted}/>
        <Routes>
          {/* Auth & public pages without the app chrome */}
          <Route path="/categories" element={<RequireAuth><CategorySelectionPage/></RequireAuth>}/>
          <Route path="/my-city" element={<RequireAuth><MyCityPage/></RequireAuth>}/>
          <Route path="/coins" element={<RequireAuth><CoinsPage/></RequireAuth>}/>
          <Route path="/status/view/:statusId" element={<RequireAuth><StatusViewPage/></RequireAuth>}/>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/google-sign-in" element={<GoogleSignInPage />} />
          <Route path="/onboarding" element={<RequireAuth allowUnonboarded><OnboardingPage /></RequireAuth>} />
          {LEGAL.map((slug) => <Route key={slug} path={`/${slug}`} element={<LegalPage slug={slug} />} />)}
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/account-deletion" element={<AccountDeletionPage />} />

          {/* Admin has its own operations layout */}
          <Route path="/admin/*" element={<RequireAuth><RequireStaff><AdminApp /></RequireStaff></RequireAuth>} />

          <Route element={<AppShell />}>
            <Route index element={<HomePage onStartup={finished?undefined:setFeedStartup} />} />
            <Route path="/challenges" element={<ChallengesPage/>}/>
            <Route path="/my-tasks" element={<RequireAuth><MyTasksPage/></RequireAuth>}/>
            <Route path="/viral-history/:userId?" element={<RequireAuth><ViralHistoryPage/></RequireAuth>}/>
            <Route path="/leaderboard" element={<LeaderboardPage/>}/>
            <Route path="/leaderboard/position/:position" element={<CompetitionTierPage/>}/>
            <Route path="/one-chance" element={<RequireAuth><OneChancePage/></RequireAuth>}/>
            <Route path="/updates" element={<RequireAuth><UpdatesPage/></RequireAuth>}/>
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/account-type" element={<RequireAuth><AccountTypePage /></RequireAuth>} />
            <Route path="/games" element={<MonsterGamePage />} />
            <Route path="/tickets" element={<TicketsPage/>}/>
            <Route path="/tickets/pubs" element={<PubsPage/>}/>
            <Route path="/real-estate" element={<RealEstatePage/>}/>
            <Route path="/tickets/pubs/:id" element={<PubsPage/>}/>
            <Route path="/premiere" element={<PremierePage/>}/>
            <Route path="/premiere/ticket/:id" element={<RequireAuth><ShowTicketPage/></RequireAuth>}/>
            <Route path="/post/:postId" element={<HomePage onStartup={finished?undefined:setFeedStartup} />} />
            <Route path="/post/:postId/details" element={<PostPage />} />
            <Route path="/profile/feedback" element={<RequireAuth><FeedbackPage/></RequireAuth>} />
            <Route path="/profile/:handle" element={<ProfilePage />} />
            <Route path="/profile" element={<RequireAuth><ProfileRedirect /></RequireAuth>} />
            <Route path="/upload" element={<RequireAuth><UploadPage /></RequireAuth>} />
            <Route path="/status/new" element={<RequireAuth><StatusUploadPage /></RequireAuth>} />
            <Route path="/messages" element={<RequireAuth><MessagesPage /></RequireAuth>} />
            <Route path="/messages/:conversationId" element={<RequireAuth><MessagesPage /></RequireAuth>} />
            <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
            <Route path="/earnings" element={<RequireAuth><EarningsPage /></RequireAuth>} />
            <Route path="/earnings/withdraw" element={<RequireAuth><WithdrawPage /></RequireAuth>} />
            <Route path="/saved" element={<RequireAuth><SavedPage /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="/business" element={<RequireAuth><BusinessPage /></RequireAuth>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return <BrowserRouter><AppRoutes/></BrowserRouter>;
}

function ProfileRedirect() {
  const { me } = useAuth();
  return me ? <Navigate to={`/profile/${me.username}`} replace /> : <PageLoader />;
}
