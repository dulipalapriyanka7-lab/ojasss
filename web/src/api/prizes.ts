import {useQuery} from '@tanstack/react-query';
import {rpc} from './client';
export type PrizeTier = 'gold' | 'silver' | 'platinum' | 'emerald' | 'bronze';
export interface Prizes extends Record<PrizeTier, number> {announced: boolean; note: string; updated_at: string | null}
export const PRIZE_ORDER: PrizeTier[] = ['gold', 'silver', 'platinum', 'emerald', 'bronze'];
export const prizes = {
  get: () => rpc<Prizes>('leaderboard_prizes'),
  save: (v: Partial<Prizes>) => rpc<Prizes>('leaderboard_prizes_save', Object.fromEntries(Object.entries(v).map(([k, x]) => ['p_' + k, x]))),
};
export const usePrizes = () => useQuery({queryKey: ['leaderboard-prizes'], queryFn: prizes.get, staleTime: 60_000});
export const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
