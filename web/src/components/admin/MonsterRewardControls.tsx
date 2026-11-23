import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { useState } from 'react';
import { monsterGame } from '@/api/monsterGame';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { dateTime, paiseFromRupeesInput, rupees } from '@/lib/format';

const rewardKey = ['admin', 'monster-game-rewards'] as const;
type Claim = Awaited<ReturnType<typeof monsterGame.rewards>>['claims'][number];

export function MonsterRewardControls() {
  const query = useQuery({ queryKey: rewardKey, queryFn: monsterGame.rewards });
  const client = useQueryClient();
  const toast = useToast();
  const [rate, setRate] = useState<string | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [verified, setVerified] = useState('0');
  const [note, setNote] = useState('');
  const rateChange = useMutation({
    mutationFn: monsterGame.setRewardRate,
    onSuccess: async () => {
      toast.success('Game coin rate saved');
      await client.invalidateQueries({ queryKey: rewardKey });
      setRate(null);
    },
    onError: (error) => toast.error(error),
  });
  const review = useMutation({
    mutationFn: ({ id, count, reason }: { id: string; count: number; reason: string }) => monsterGame.reviewReward(id, count, reason),
    onSuccess: async (_, { count }) => {
      setClaim(null);
      toast.success(count > 0 ? 'Approved reward added to Earnings' : 'Reward claim declined');
      await client.invalidateQueries({ queryKey: rewardKey });
    },
    onError: (error) => toast.error(error),
  });
  if (query.isPending) return <Skeleton className="h-36 rounded-2xl" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const configuredRate = query.data.rate_paise;
  const input = rate ?? (configuredRate / 100).toFixed(2);
  const paise = paiseFromRupeesInput(input);
  const count = /^\d+$/.test(verified) ? Number(verified) : NaN;
  const canReview = !!claim && Number.isInteger(count) && count >= 0 && count <= claim.reported_coins && note.trim().length >= 3;

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Coins size={18} /> Match coin rewards</h2>
        <p className="mt-1 text-sm text-fg-3">One coin per elimination. Approved claims go to Earnings. The saved rate applies to new matches.</p>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        if (paise !== null && paise <= 10000) rateChange.mutate(paise);
      }}>
        <Field label="Rupees per coin" hint="Set ₹0 to turn off cash claims." className="min-w-44 flex-1">{props => <Input {...props} value={input} onChange={event => setRate(event.target.value)} inputMode="decimal" />}</Field>
        <Button type="submit" variant="secondary" loading={rateChange.isPending} disabled={paise === null || paise > 10000 || paise === configuredRate}>Save rate</Button>
      </form>
      <div className="border-t border-line pt-3">
        <h3 className="text-sm font-semibold">Pending reward claims</h3>
        {query.data.claims.length > 0 ? <ul className="divide-y divide-line">
          {query.data.claims.map(item => <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">@{item.username}</p><p className="text-xs text-fg-3">{item.reported_coins} reported · {rupees(item.rate_paise)} / coin · {dateTime(item.created_at)}</p></div>
            <Button variant="ghost" onClick={() => { setClaim(item); setVerified(''); setNote(''); }}>Review</Button>
          </li>)}
        </ul> : <p className="mt-2 text-sm text-fg-3">No reward claims to review.</p>}
      </div>
      <Dialog
        open={!!claim}
        title={claim ? `Review @${claim.username}’s claim` : 'Review reward claim'}
        description="The reported count comes from the player’s browser. Check gameplay evidence before approving. Enter zero to decline."
        onClose={() => { if (!review.isPending) setClaim(null); }}
        footer={<>
          <Button variant="ghost" disabled={review.isPending} onClick={() => setClaim(null)}>Cancel</Button>
          <Button
            variant={count === 0 ? 'danger' : 'primary'}
            disabled={!canReview}
            loading={review.isPending}
            onClick={() => { if (claim && canReview) review.mutate({ id: claim.id, count, reason: note.trim() }); }}
          >{count === 0 ? 'Decline' : 'Approve reward'}</Button>
        </>}
      >
        {claim && <div className="space-y-3">
          <Field label="Verified eliminations" hint={`0 to ${claim.reported_coins}`}>{props => <Input {...props} value={verified} inputMode="numeric" onChange={event => setVerified(event.target.value)} />}</Field>
          <Field label="Review note">{props => <Textarea {...props} value={note} onChange={event => setNote(event.target.value)} maxLength={500} />}</Field>
          {canReview && <p className="text-sm text-fg-3">Wallet credit {rupees(count * claim.rate_paise)}</p>}
        </div>}
      </Dialog>
    </section>
  );
}
