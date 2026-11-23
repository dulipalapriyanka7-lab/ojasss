import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { WeeklyCountdown, WeeklyWinners } from './WeeklyLeaderboardResults';

afterEach(() => vi.useRealTimers());

it('counts from server time and requests final results once when it reaches zero', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T13:00:00Z'));
  const onEnd = vi.fn();
  render(<WeeklyCountdown
    end="2026-11-15T18:30:00Z"
    serverTime="2026-11-15T18:29:58Z"
    receivedAt={Date.now()}
    locked={false}
    onEnd={onEnd}
  />);
  expect(screen.getByRole('timer', { name: '0 days, 0 hours, 0 minutes, 2 seconds' })).toBeTruthy();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('timer', { name: '0 days, 0 hours, 0 minutes, 1 seconds' })).toBeTruthy();
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.getByText('Finalizing results…')).toBeTruthy();
  expect(onEnd).toHaveBeenCalledTimes(1);
});

it('shows confirmed wallet credits and labels a pending prize separately', () => {
  render(<MemoryRouter><WeeklyWinners archive={false} result={{
    id: '20261108T183000',
    end: '2026-11-15T18:30:00Z',
    winners: [
      { rank: 1, username: 'winner', display_name: 'Winner', avatar_path: null, amount_paise: 245050 },
      { rank: 2, username: 'runner_up', display_name: 'Runner up', avatar_path: null, amount_paise: null },
    ],
  }}/></MemoryRouter>);
  expect(screen.getByText('₹2,450.50')).toBeTruthy();
  expect(screen.getByText('Wallet credited')).toBeTruthy();
  expect(screen.getByText('Prize unconfirmed')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View finalized leaderboard' }).getAttribute('href'))
    .toBe('/leaderboard?week=20261108T183000');
});
