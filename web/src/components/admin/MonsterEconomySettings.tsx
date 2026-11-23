import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, LockKeyhole, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { monsterGame, type GameEconomy } from '@/api/monsterGame';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { dateTime } from '@/lib/format';

type Editable = Omit<GameEconomy, 'version' | 'paid_entry' | 'withdrawals' | 'changed_at' | 'changed_by'>;
const key = ['admin', 'monster-economy'] as const;

const numbers: { k: keyof Editable; label: string; hint?: string; min: number; max: number }[] = [
  { k: 'starting_coins', label: 'Starting battle coins', min: 1, max: 10000 },
  { k: 'coins_per_hit', label: 'Coins moved per valid hit', min: 1, max: 1000 },
  { k: 'start_hp', label: 'Player starting health', hint: 'HP', min: 10, max: 1000 },
  { k: 'match_minutes', label: 'Match duration', hint: 'minutes', min: 3, max: 60 },
  { k: 'min_players', label: 'Minimum players', min: 1, max: 100 },
  { k: 'max_players', label: 'Maximum players', min: 1, max: 100 },
  { k: 'entry_fee_rupees', label: 'Entry fee (reference)', hint: '₹, locked', min: 0, max: 10000 },
  { k: 'coins_per_10', label: 'Coins per ₹10 (reference)', min: 1, max: 1000 },
];

/** Monster Fight → Game Economy Settings. Battle coins are virtual; paid entry and withdrawals stay locked. */
export function MonsterEconomySettings() {
  const toast = useToast();
  const client = useQueryClient();
  const q = useQuery({ queryKey: key, queryFn: monsterGame.economy, refetchInterval: 20_000 });
  const [draft, setDraft] = useState<Editable | null>(null);
  useEffect(() => {
    if (q.data && !draft) {
      const { version: _v, paid_entry: _p, withdrawals: _w, changed_at: _c, changed_by: _b, ...rest } = q.data.economy;
      setDraft(rest);
    }
  }, [q.data, draft]);
  const save = useMutation({
    mutationFn: () => monsterGame.saveEconomy(draft!),
    onSuccess: async (e) => { toast.success(`Saved as version ${e.version}. New matches use it; running matches keep their settings.`); await client.invalidateQueries({ queryKey: key }); },
    onError: (error) => toast.error(error),
  });

  if (q.isPending || !draft) return <Skeleton className="h-64 rounded-2xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data.economy;
  const set = (k: keyof Editable, v: unknown) => setDraft({ ...draft, [k]: v });

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Coins size={18} /> Game economy settings</h2>
          <p className="mt-1 text-xs text-fg-3">Version {e.version}{e.changed_at ? ` · saved ${dateTime(e.changed_at)}${e.changed_by ? ` by @${e.changed_by}` : ''}` : ' · defaults'}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold"><Users size={15} /> {q.data.live_players} playing now</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {numbers.map(({ k, label, hint, min, max }) => (
          <label key={k} className="grid gap-1 text-sm">
            <span className="font-medium">{label}{hint && <span className="ml-1 text-xs text-fg-3">({hint})</span>}</span>
            <input type="number" inputMode="numeric" min={min} max={max} className="h-10 rounded-xl border border-line bg-surface-2 px-3"
              value={draft[k] as number} onChange={(ev) => set(k, Math.round(Number(ev.target.value)))} />
          </label>
        ))}
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Winner rule</span>
          <select className="h-10 rounded-xl border border-line bg-surface-2 px-3" value={draft.win_rule} onChange={(ev) => set('win_rule', ev.target.value)}>
            <option value="objective">Objective: survive and defeat the Titan</option>
            <option value="last_standing">Last player standing</option>
            <option value="most_coins">Most battle coins among survivors</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
          <input type="checkbox" className="size-4" checked={draft.coin_elimination} onChange={(ev) => set('coin_elimination', ev.target.checked)} />
          Eliminate a player when their battle coins reach 0
        </label>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-xs text-fg-2">
        <LockKeyhole size={15} className="mt-0.5 shrink-0 text-warning" />
        <p><b>Paid entry and withdrawals are locked.</b> Every match is free entry and battle coins are virtual — they can't be bought, withdrawn or turned into wallet money. The ₹ fields are saved for reference only. Turning on paid entry needs a legal review under the Online Gaming Act, 2025 and payment-provider approval first.</p>
      </div>
      <Button loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button>
    </section>
  );
}
