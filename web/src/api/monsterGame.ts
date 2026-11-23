import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';

export type GameMode = 'private' | 'live';
export type GameEconomy = { version: number; entry_fee_rupees: number; coins_per_10: number; starting_coins: number; coins_per_hit: number; start_hp: number; match_minutes: number; min_players: number; max_players: number; coin_elimination: boolean; win_rule: 'objective' | 'last_standing' | 'most_coins'; paid_entry: boolean; withdrawals: false; changed_at: string | null; changed_by?: string | null };
export type MatchEconomy = Pick<GameEconomy, 'version' | 'starting_coins' | 'coins_per_hit' | 'start_hp' | 'match_minutes' | 'coin_elimination' | 'win_rule'>;
type GameStatus = { mode: GameMode; can_play: boolean; live_players?: number; active_coins?: number; my_coins?: number | null; economy?: { starting_coins: number; entry_fee_rupees: number; paid_entry: false; match_minutes: number } };
type GameMember = { id: string; username: string; name: string; active: boolean };
type RewardClaim = { id: string; username: string; reported_coins: number; rate_paise: number; created_at: string };
export type GameLaunch = { match_id?: string | null; path: string; round_id: string | null; rate_paise: number; economy?: MatchEconomy };

export const monsterGame = {
  status: (playing = false, coins?: number) => rpc<GameStatus>('monster_game_status', { playing, coins }),
  economy: () => rpc<{ economy: GameEconomy; live_players: number }>('monster_game_economy'),
  saveEconomy: (economy: Omit<GameEconomy, 'version' | 'paid_entry' | 'withdrawals' | 'changed_at' | 'changed_by'>) => rpc<GameEconomy>('monster_game_economy_save', { economy }),
  play: () => rpc<GameLaunch>('monster_game_play'),
  claimCoins: (matchId: string, coins: number) => rpc<{ credited: number; balance: number; already?: boolean }>('monster_game_coins_claim', { match_id: matchId, coins }),
  unlockPay: (matchId: string, weapon: number) => rpc<{ ok: boolean; charged: number; balance: number }>('monster_game_unlock_pay', { match_id: matchId, weapon }),
  manage: () => rpc<{
    state: { mode: GameMode; changed_at: string | null };
    members: GameMember[];
  }>('monster_game_manage'),
  setMode: (mode: GameMode) => rpc('monster_game_mode', { mode }),
  grant: (username: string) => rpc('monster_game_grant', { username }),
  revoke: (user_id: string) => rpc('monster_game_revoke', { user_id }),
  submitReward: (round_id: string, coins: number) =>
    rpc<{ status: 'pending' | 'approved' | 'rejected' }>('monster_game_reward_submit', { round_id, coins }),
  rewards: () => rpc<{ rate_paise: number; claims: RewardClaim[] }>('monster_game_reward_queue'),
  setRewardRate: (rate_paise: number) => rpc('monster_game_reward_rate', { rate_paise }),
  reviewReward: (round_id: string, verified_coins: number, note: string) =>
    rpc('monster_game_reward_review', { round_id, verified_coins, note }),
};

export const monsterGameStatusKey = ['monster-game-status'] as const;

/** latest battle coins reported by the running game (sent with the presence heartbeat) */
export const gameCoins = { current: undefined as number | undefined };
export function useMonsterGameStatus(playing = false) {
  const { session, loading } = useAuth();
  return useQuery({
    queryKey: [...monsterGameStatusKey, session?.user.id ?? null],
    queryFn: () => monsterGame.status(playing, playing ? gameCoins.current : undefined),
    enabled: !loading,
    retry: false,
    staleTime: 20_000,
    refetchInterval: playing ? 15_000 : 60_000,
  });
}
