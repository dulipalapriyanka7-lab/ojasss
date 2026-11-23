import { FireProfiles } from './FireProfiles';
import {homeControl} from '@/lib/homeControls';
import {useQueryClient} from '@tanstack/react-query';
import {discovery} from '@/api/discovery';
import {useToast} from '@/components/ui/Toast';
import {patchPost} from '@/hooks/usePostActions';
import { Link, useNavigate } from 'react-router-dom';
import { ACTIONS, orderedItems } from '@/lib/layoutOrder';
import { Bookmark, Check, Clock3, Vote, Eye, Zap, IndianRupee, Lock, Mic, MessageCircle, MessagesSquare, MoreHorizontal, Flame, Send, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { PostCard } from '@/api';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Overlay';
import { useAuth } from '@/hooks/useAuth';
import { useCommentsEnabled, usePublicSettings } from '@/hooks/usePostActions';
import { count, rupees } from '@/lib/format';
import { cn } from '@/lib/utils';
import { allowsOneChance } from '@/lib/oneChanceCategories';
import './viral-guide.css';

interface RailButtonProps {
  icon: LucideIcon;
  label: string;
  value?: number | string;
  active?: boolean;
  activeClass?: string;
  onClick: () => void;
  locked?: boolean;
  onDark?: boolean;
  description?: string;
  horizontal?: boolean;
  blink?: boolean;
  details?:ReactNode;
}

function RailButton({ icon: Icon, label, value, active, activeClass, onClick, locked, onDark, description, horizontal, blink, details }: RailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}${value !== undefined ? `, ${value}` : ''}${description ? `. ${description}` : ''}`}
      title={description ?? label}
      className={cn('rail-action group flex min-w-11 items-center gap-1 select-none', horizontal ? 'h-11 flex-row gap-1.5 rounded-full px-3 hover:bg-surface-2' : 'min-h-14 flex-col')}
    >
      <motion.span
        whileTap={{ scale: 0.82 }}
        animate={active ? { scale: [1, 1.22, 1] } : { scale: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 400 }}
        className={cn(
          'rail-icon relative flex items-center justify-center rounded-full transition-colors duration-150',
          horizontal ? 'size-7' : 'size-11',
          !horizontal && (onDark ? 'premium-action-glass group-hover:bg-white/10' : 'bg-surface-2 group-hover:bg-surface-3'),
          label==='VIRAL' && 'premium-action-fire',
          active ? activeClass : label === 'VIRAL' ? 'text-orange-400' : onDark ? 'text-white' : 'text-fg',
          blink && 'viral-ready',
        )}
      >
        <Icon aria-hidden size={horizontal ? 21 : 25} strokeWidth={active ? 2.4 : 2} className={cn(active && 'fill-current')} />
        {locked && (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full bg-black/70 text-white ring-2 ring-black/30">
            <Lock aria-hidden size={10} strokeWidth={3} />
          </span>
        )}
      </motion.span>
      {details}
      {value !== undefined && (
        <span className={cn('rail-value text-xs font-semibold tabular', onDark ? 'rounded-full bg-black/55 px-1.5 text-white' : 'text-fg-2')}>{value}</span>
      )}
    </button>
  );
}

export interface EngagementHandlers {
  onHot: () => void;
  onSpeak: () => void;
  onViral: () => void;
  onComments: () => void;
  onBookmark: () => void;
  onShare: () => void;
  onMore: () => void;
}

/** HOT → SPEAK → VIRAL engagement plus social actions. Vertical (feed) or horizontal (post page). */
export function EngagementRail({ post, handlers, onDark, horizontal, className, hideMore=false, feedControls=false, oneChance=false }: {
  post: PostCard; handlers: EngagementHandlers; onDark?: boolean; horizontal?: boolean; className?: string; hideMore?: boolean; feedControls?:boolean; oneChance?: boolean;
}) {
  const { data: settings } = usePublicSettings();
  const { me } = useAuth();
  const toast=useToast(),navigate=useNavigate(),qc=useQueryClient();
  const [voting,setVoting]=useState(false);
  const canEnter = allowsOneChance(post, settings);
  const voteDeadline = Date.parse(post.one_chance_voting_until ?? '');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!Number.isFinite(voteDeadline) || voteDeadline <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= voteDeadline) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [voteDeadline]);
  // Votes start locked: they open 48 h after the video went Viral, or at once when the creator pays.
  const voteOpens = Date.parse(post.one_chance_voting_opens_at ?? '') || 0;
  const waiting = now < voteOpens;
  const voteSeconds = Math.max(0, Math.ceil(((waiting ? voteOpens : voteDeadline) - now) / 1000));
  const showVoting = Number.isFinite(voteDeadline) && post.is_viral && post.one_chance_ready
    && post.status === 'published' && (post.visibility ?? 'public') === 'public';
  const canVote = showVoting && !waiting && voteSeconds > 0;
  const vote=async()=>{
    if (!canVote || voting || post.my_voted) return;
    if (!me) {
      navigate('/login?next='+encodeURIComponent(window.location.pathname+window.location.search));
      return;
    }
    if (me.id === post.author_id) {
      toast.info('Members can vote on your video while voting is open.');
      return;
    }
    setVoting(true);
    try {
      patchPost(post.id, await discovery.vote(post.id));
      void qc.invalidateQueries({queryKey:['leaderboard']});
      void qc.invalidateQueries({queryKey:['competition']});
      toast.success('Your vote is counted');
    } catch (error) {
      toast.error(error);
    } finally {
      setVoting(false);
    }
  };
  const commentsEnabled = useCommentsEnabled();
  const show=(key:Parameters<typeof homeControl>[1])=>!feedControls||homeControl(settings,key);
  const orderedActions=orderedItems(ACTIONS.filter(a=>(!hideMore||a.value!=='more')&&show(a.value as Parameters<typeof homeControl>[1])),settings?.['layout.action_order']);
  const visibleActions=[...orderedActions.filter(a=>!['speak','comments','more'].includes(a.value)).flatMap(a=>a.value==='viral'?[a,...orderedActions.filter(b=>b.value==='speak')]:[a]),...(!orderedActions.some(a=>a.value==='viral')?orderedActions.filter(a=>a.value==='speak'):[]),...orderedActions.filter(a=>a.value==='more')];
  const [firesOpen, setFiresOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);


  
  // Creators can't react to their own posts (rewards must come from other members), so on
  // their own post the reactions explain how they work instead of failing.
  const own = !!me && me.id === post.author_id;
  const hotGoal=Math.max(10,settings?.['engagement.hot_threshold']??10),shareGoal=Math.max(10,settings?.['engagement.share_threshold']??10);
  const entryLocked=canEnter&&post.is_viral&&!post.one_chance_ready&&!!post.one_chance_available_at&&Date.parse(post.one_chance_available_at)<=Date.now();
  const react = (fn: () => void) => () => (own ? setGuideOpen(true) : fn());
  const buttons = {
    hearts: <div className={cn('rail-fire-stack flex items-center', !horizontal && 'flex-col')}>
      <RailButton icon={Flame} label={post.my_hot?'Remove Fire':'Give Fire'} active={post.my_hot} activeClass="text-hot" onClick={react(handlers.onHot)} onDark={onDark} horizontal={horizontal}/>
      <button type="button" onClick={()=>setFiresOpen(true)} aria-label={`See who gave Fires, ${post.hot_count}`} title="See who gave Fires"
        className={cn('rail-count-button grid min-h-5 min-w-11 place-items-center rounded-full text-xs font-semibold tabular focus-visible:outline-2', onDark?'text-white':'text-fg-2')}>
        <span className={cn('rounded-full px-1.5',onDark && 'bg-black/55')}>{count(post.hot_count)}</span>
      </button>
    </div>,
    speak: commentsEnabled?<RailButton icon={Mic} label="Speak" value={count(post.comments_count)} onClick={handlers.onComments} onDark={onDark} horizontal={horizontal}/>:null,
    viral: oneChance ? null : <RailButton icon={Zap} locked={entryLocked||(oneChance&&showVoting&&waiting)} label="VIRAL" value={entryLocked||(oneChance&&showVoting&&waiting)?'Locked':post.is_viral&&canEnter&&!oneChance?'Position':'Viral'} active={oneChance ? post.my_viral : post.is_viral} activeClass={oneChance ? 'one-chance-viral-selected' : 'text-purple-400'} blink={post.is_viral && !(oneChance && post.my_viral)} description={`Viral target: ${hotGoal} Fires and ${shareGoal} Shares`} details={!oneChance&&<span className="rail-viral-progress"><span className={cn(post.hot_count>=hotGoal&&'is-reached')}><Flame aria-hidden size={10}/><b>{Math.min(post.hot_count,hotGoal)}</b><span>/{hotGoal}</span></span><span className={cn(post.shares_count>=shareGoal&&'is-reached')}><Send aria-hidden size={10}/><b>{Math.min(post.shares_count,shareGoal)}</b><span>/{shareGoal}</span></span></span>} onClick={post.viral_eligible&&canEnter ? handlers.onViral : ()=>setGuideOpen(true)} onDark={onDark} horizontal={horizontal}/>,
    comments: commentsEnabled ? <RailButton icon={MessageCircle} label="Comments" value={count(post.comments_count)} onClick={handlers.onComments} onDark={onDark} horizontal={horizontal}/> : null,
    save: <RailButton icon={Bookmark} label={post.my_bookmarked?'Saved':'Save'} value={count(post.bookmarks_count??0)} active={post.my_bookmarked} activeClass="text-brand" onClick={handlers.onBookmark} onDark={onDark} horizontal={horizontal}/>,
    share: <RailButton icon={Send} label="Share" value={count(post.shares_count)} onClick={handlers.onShare} onDark={onDark} horizontal={horizontal}/>,
    more: <RailButton icon={MoreHorizontal} label="More options" onClick={handlers.onMore} onDark={onDark} horizontal={horizontal}/>,
  };
  // The creator can always pay to unlock their own locked One Chance video (₹10 by default).
  const renewalPrice = own ? (post.one_chance_voting_renewal_paise ?? ((settings as Record<string, unknown> | undefined)?.['one_chance.entry_paise'] as number | undefined) ?? 1000) : null;
  // Locked videos count down the 48 h lock (after Viral, and after every paid window); then the creator can pay.
  const lockLeft = Math.max(0, Math.ceil((Date.parse(post.one_chance_unlock_at ?? '') - now) / 1000)) || 0;
  const lockClock = lockLeft > 0 ? (lockLeft >= 3600 ? Math.floor(lockLeft / 3600) + 'h ' + Math.floor((lockLeft % 3600) / 60) + 'm' : Math.ceil(lockLeft / 60) + 'm') : 'Locked';
  const voteClock = voteSeconds >= 86400
    ? Math.floor(voteSeconds / 86400) + 'd ' + (Math.floor(voteSeconds / 3600) % 24) + 'h'
    : [Math.floor(voteSeconds / 3600), Math.floor(voteSeconds / 60) % 60, voteSeconds % 60]
      .map(value => String(value).padStart(2, '0')).join(':');
  // Share of the 48 h window still left, for the slim progress bar under the timer.
  const voteLeft = waiting ? 1 - Math.min(1, voteSeconds / (48 * 3600)) : Math.min(1, voteSeconds / (7 * 86400));
  const voteState = !canVote ? 'locked' : post.my_voted ? 'voted' : 'open';
  const onVoteTap = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault(); // never let the tap reach the video (pause/like) underneath
    if (canVote) {
      if (post.my_voted) toast.info('You already voted for this video this week.');
      else void vote();
    } else if (renewalPrice) navigate('/one-chance?post=' + encodeURIComponent(post.id));
    else toast.info(waiting ? (lockLeft > 0 ? 'Votes are locked for ' + lockClock + '. Then the creator can pay ₹10 to open voting.' : 'Votes open after the creator’s payment is approved.') : 'Voting has closed for this week.');
  };
  // Viewers only see votes once the creator's payment is approved; the creator sees the unlock button.
  const votingControl = showVoting && (
    <div className={cn('oc-vote', `is-${voteState}`, horizontal && 'is-horizontal')} onClick={e => e.stopPropagation()}>
      <button type="button" className="oc-vote-btn" onClick={onVoteTap} disabled={voting}
        aria-pressed={post.my_voted}
        aria-label={voteState === 'locked' ? (renewalPrice ? `Voting locked. Pay ${rupees(renewalPrice)} to open voting` : 'Voting locked') : post.my_voted ? `Voted, ${post.votes_count ?? 0} votes` : `Vote, ${post.votes_count ?? 0} votes`}>
        <span className="oc-vote-icon">
          {voting ? <span className="oc-vote-spin" aria-hidden /> : voteState === 'locked' ? <Lock aria-hidden size={19} strokeWidth={2.2} /> : post.my_voted ? <Check aria-hidden size={21} strokeWidth={2.8} /> : <Vote aria-hidden size={21} strokeWidth={2} />}
        </span>
        <span className="oc-vote-label">{voteState === 'locked' ? (renewalPrice ? 'Unlock' : 'Locked') : post.my_voted ? 'Voted' : 'Vote'}</span>
        <span className="oc-vote-count">{voteState === 'locked' ? (renewalPrice ? rupees(renewalPrice) : '') : count(post.votes_count ?? 0)}</span>
      </button>
      {!canVote && renewalPrice
        ? <button type="button" className="oc-vote-pay" onClick={onVoteTap} aria-label={`Pay ${rupees(renewalPrice)} to open voting`}><IndianRupee size={9} aria-hidden />Pay {rupees(renewalPrice).replace('₹', '')}</button>
        : <span className="oc-vote-timer" aria-label={canVote ? `Voting closes in ${voteClock}` : 'Voting locked'}>
            {canVote ? <><Clock3 size={9} aria-hidden />{voteClock}</> : waiting ? <><Lock size={8} aria-hidden />{lockClock}</> : <><Lock size={8} aria-hidden />Closed</>}
            <i style={{ transform: `scaleX(${voteLeft})` }} aria-hidden />
          </span>}
      <span className="oc-vote-views"><Eye aria-hidden size={10}/>{count(post.views_count)}</span>
    </div>
  );
  return (
    <div className={cn(!horizontal&&'engagement-rail-vertical',feedControls&&!horizontal&&'feed-action-rail',onDark&&'rail-on-dark',post.is_viral&&'is-viral-rail',horizontal ? 'flex flex-wrap items-center gap-1' : 'flex flex-col items-center gap-1.5', className)}>

      {oneChance && votingControl}
{visibleActions.filter(action=>action.value!=='hearts'||(!oneChance&&!(post.is_viral&&post.kind==='video'))).map(action=><Fragment key={action.value}>{feedControls&&action.value==='more'&&<Link to="/messages" aria-label="Messages" title="Messages" className="home-message-shortcut rail-action flex min-h-14 min-w-11 flex-col items-center gap-1"><span className="ojass-rail-glass rail-icon flex size-11 items-center justify-center rounded-full"><MessagesSquare aria-hidden size={23}/></span><span className="text-[10px] font-semibold">Chat</span></Link>}{buttons[action.value as keyof typeof buttons]}{!oneChance&&action.value==='viral'&&votingControl}</Fragment>)}
      {firesOpen && <FireProfiles postId={post.id} total={post.hot_count} onClose={()=>setFiresOpen(false)} />}
      <EngagementGuide post={post} own={own} open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

/** Explains HOT → SPEAK → VIRAL and how each turns into money, with this post's progress. */
export function EngagementGuide({ post, own, open, onClose }: { post: PostCard; own: boolean; open: boolean; onClose: () => void }) {
  const { data: s } = usePublicSettings();
  const hot = 10;
  const shares = 10;

  const steps = [
    { icon: Flame, tone: 'bg-hot-soft text-hot', title: 'Fires', text: `Members tap Fire to like a post. Goal: ${count(hot)} Fires.` },
    { icon: Send, tone: 'bg-speak-soft text-speak', title: 'Shares', text: `Share the post with others. Goal: ${count(shares)} Shares.` },
    { icon: Zap, tone: 'bg-viral-soft text-viral', title: 'Automatic Viral', text: 'Reach both goals to become Viral. Videos from eligible categories can then enter One Chance.' },
    { icon: IndianRupee, tone: 'bg-brand-soft text-brand-ink', title: 'Reward', text: `The creator earns ${rupees(s?.['rewards.viral_paise'] ?? 0)} once per VIRAL post, after review.` },
  ];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="How Fires, Shares & VIRAL work"
      size="sm"
      className="viral-guide-dialog"
      description={own
        ? "This is your post, so you can't react to it. Your rewards come from reactions by other members."
        : 'Viral is automatic. Speak is free. Premium placement is optional.'}
      footer={
        <>
          {own && <ButtonLink to="/earnings" variant="secondary" onClick={onClose}>View earnings</ButtonLink>}
          <Button onClick={onClose}>Got it</Button>
        </>
      }
    >
      <ol className="viral-guide-steps">
        {steps.map((st) => (
          <li key={st.title} className="flex gap-2.5">
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', st.tone)}><st.icon aria-hidden size={15} /></span>
            <div className="min-w-0"><p className="text-xs font-semibold text-fg">{st.title}</p><p className="mt-0.5 text-xs leading-relaxed text-fg-2">{st.text}</p></div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-fg-3">
        Other ways to earn: {rupees(s?.['rewards.cta_click_paise'] ?? 0)} per unique button click (Buy Now, WhatsApp…) from other members,
        and {rupees(s?.['rewards.referral_paise'] ?? 0)} per friend who joins with your referral code.
        Withdraw once your approved balance reaches {rupees(s?.['withdrawals.min_paise'] ?? 10000)}.
      </p>
      <div className="mt-4"><ViralProgress post={post} /></div>
    </Dialog>
  );
}

/** Progress toward VIRAL eligibility (shown on post pages). */
export function ViralProgress({ post }: { post: PostCard }) {
  const hot = 10;
  const shares = 10;

  const rows = [
    { label: 'Fires', value: post.hot_count, goal: hot, color: 'bg-hot' },
    { label: 'Shares', value: post.shares_count, goal: shares, color: 'bg-speak' },

  ];
  return (
    <div className="viral-progress-card">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold"><Zap size={14} className="text-fuchsia-400"/>{post.is_viral ? 'Viral unlocked' : 'Road to Viral'}</p>
        <span className="viral-progress-percent">{Math.round((Math.min(1,post.hot_count/hot)+Math.min(1,post.shares_count/shares))*50)}%</span>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {rows.map((r) => {
          const pct = Math.min(100, (r.value / Math.max(1, r.goal)) * 100);
          return (
            <li key={r.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="flex items-center gap-1 font-medium text-fg-2">{r.label==='Fires'?<Flame size={12}/>:<Send size={12}/>}{r.label}</span>
                <span className="text-fg-3 tabular">{count(r.value)} / {count(r.goal)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${r.label} progress`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <div className={cn('h-full rounded-full transition-[width] duration-500', r.color)} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
