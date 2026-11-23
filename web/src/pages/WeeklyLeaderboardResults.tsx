import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Flame, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CompetitionPrizeResults } from '@/api/competition';
import { Avatar } from '@/components/ui/Misc';
import { countdownParts, secondsUntil } from '@/lib/countdown';
import { rupees } from '@/lib/format';
import './weekly-leaderboard-results.css';

export function WeeklyCountdown({ end, locked, serverTime, receivedAt, onEnd }: {
  end: string;
  locked: boolean;
  serverTime?: string;
  receivedAt: number;
  onEnd: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  const lastExpiredEnd = useRef('');
  useEffect(() => {
    if (locked) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [locked]);

  const deadline = Date.parse(end);
  const localTime = Math.max(now, receivedAt);
  const serverClock = Date.parse(serverTime ?? '');
  const currentTime = Number.isFinite(serverClock) ? serverClock + (localTime - receivedAt) : localTime;
  const seconds = locked ? 0 : secondsUntil(deadline, currentTime);
  useEffect(() => {
    if (!locked && Number.isFinite(deadline) && seconds === 0 && lastExpiredEnd.current !== end) {
      lastExpiredEnd.current = end;
      onEnd();
    }
  }, [deadline, end, locked, onEnd, seconds]);

  const ended = locked || seconds === 0;
  const units = { d: 'days', h: 'hours', m: 'minutes', s: 'seconds' } as const;
  const parts = Object.entries(countdownParts(seconds)) as [keyof typeof units, number][];
  return (
    <section className="weekly-countdown" aria-label="Weekly competition countdown" data-ended={ended}>
      <Flame className="weekly-countdown-icon" size={17} aria-hidden />
      <div className="weekly-countdown-heading">
        <strong>Weekly Competition</strong>
        <span>{locked ? 'Competition closed' : ended ? 'Finalizing results…' : 'Voting ends in'}</span>
      </div>
      <div className="weekly-clock" role="timer" aria-label={parts.map(([unit, value]) => `${value} ${units[unit]}`).join(', ')}>
        {parts.map(([unit, value]) => (
          <span key={unit} className="weekly-clock-unit" data-seconds={unit === 's'} aria-hidden>
            <b key={unit === 's' ? value : unit}>{String(value).padStart(2, '0')}</b><small>{unit}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

const closingDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
});

export function WeeklyWinners({ result, archive }: { result: CompetitionPrizeResults; archive: boolean }) {
  const [celebrate] = useState(() => {
    const elapsed = Date.now() - Date.parse(result.end);
    return !archive && result.winners.length > 0 && elapsed >= 0 && elapsed < 86400000;
  });
  return (
    <section className="weekly-winners" aria-label="Finalized weekly winners">
      {celebrate && <div className="weekly-confetti" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => <i key={i} />)}
      </div>}
      <div className="weekly-winners-head">
        <span className="weekly-winners-icon"><Trophy size={18} aria-hidden /></span>
        <div><h2>Weekly Winners</h2><p>Week closed {closingDate.format(new Date(result.end))}</p></div>
        {!archive && <Link to={`/leaderboard?week=${encodeURIComponent(result.id)}`} aria-label="View finalized leaderboard">Results <ArrowUpRight size={13} /></Link>}
      </div>
      {result.winners.length ? <ul className="weekly-winner-list">
        {result.winners.map((winner) => (
          <li key={winner.username}>
            <span className="weekly-winner-rank">#{winner.rank}</span>
            <Link to={`/profile/${encodeURIComponent(winner.username)}`}>
              <Avatar size={24} path={winner.avatar_path} name={winner.display_name || winner.username} />
              <span>@{winner.username}</span>
            </Link>
            {winner.amount_paise === null
              ? <span className="weekly-prize-pending">Prize unconfirmed</span>
              : <span className="weekly-prize"><b>{rupees(winner.amount_paise)}</b><small>Wallet credited</small></span>}
          </li>
        ))}
      </ul> : <p className="weekly-winners-empty">No top-five finishers or confirmed prizes this week.</p>}
    </section>
  );
}
