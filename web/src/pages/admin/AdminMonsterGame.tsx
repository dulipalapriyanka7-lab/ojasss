import {GameEntryQueue} from '@/components/admin/GameEntryQueue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gamepad2, History, LockKeyhole, Radio, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { monsterGame, monsterGameStatusKey, type GameMode } from '@/api/monsterGame';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { dateTime } from '@/lib/format';
import { MonsterRewardControls } from '@/components/admin/MonsterRewardControls';
import { MonsterEconomySettings } from '@/components/admin/MonsterEconomySettings';

type Operation =
  | { kind: 'mode'; mode: GameMode }
  | { kind: 'grant'; username: string }
  | { kind: 'revoke'; id: string; username: string };

const adminGameKey = ['admin', 'monster-game'] as const;

export default function AdminMonsterGame() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [confirm, setConfirm] = useState<Exclude<Operation, { kind: 'grant' }> | null>(null);
  const query = useQuery({ queryKey: adminGameKey, queryFn: monsterGame.manage });
  const change = useMutation({
    mutationFn: (operation: Operation) => {
      switch (operation.kind) {
        case 'mode': return monsterGame.setMode(operation.mode);
        case 'grant': return monsterGame.grant(operation.username);
        case 'revoke': return monsterGame.revoke(operation.id);
      }
    },
    onSuccess: async (_, operation) => {
      if (operation.kind === 'grant') setUsername('');
      setConfirm(null);
      toast.success(operation.kind === 'grant' ? 'Preview access granted'
        : operation.kind === 'revoke' ? 'Preview access removed'
        : operation.mode === 'live' ? 'Monster Fight is live' : 'Monster Fight is private');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminGameKey }),
        queryClient.invalidateQueries({ queryKey: monsterGameStatusKey }),
      ]);
    },
    onError: (error) => toast.error(error),
  });

  if (query.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const { state, members } = query.data;
  const live = state.mode === 'live';
  const publish = confirm?.kind === 'mode' && confirm.mode === 'live';
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Monster Fight</h1><p className="mt-1 text-sm text-fg-3">Manage the game launch and private preview.</p></div>
        <ButtonLink to="/games" variant="secondary" leading={<Gamepad2 size={18} />}>Preview game</ButtonLink>
      </header>
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">{live ? <Radio size={18} /> : <LockKeyhole size={18} />}{live ? 'Live' : 'Private preview'}</h2>
            <p className="mt-1 text-sm text-fg-3">{live ? 'Anyone visiting OJASSS can play.' : 'Admins and invited members can play.'}</p>
            {state.changed_at && <p className="mt-1 text-xs text-fg-3">Last changed {dateTime(state.changed_at)}</p>}
          </div>
          <Button variant={live ? 'outline' : 'primary'} disabled={change.isPending} onClick={() => setConfirm({ kind: 'mode', mode: live ? 'private' : 'live' })}>
            {live ? 'Make private' : 'Go live'}
          </Button>
        </div>
      </section>
      <MonsterEconomySettings />
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="font-semibold">Private access <span className="ml-1 text-sm text-fg-3">({members.length})</span></h2>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          if (username.trim()) change.mutate({ kind: 'grant', username: username.trim() });
        }}>
          <Field label="OJASSS username" className="min-w-48 flex-1">{props => <Input {...props} value={username} onChange={event => setUsername(event.target.value)} placeholder="@username" maxLength={65} />}</Field>
          <Button type="submit" variant="secondary" leading={<UserPlus size={17} />} disabled={!username.trim() || change.isPending}>Grant access</Button>
        </form>
        {members.length ? <ul className="divide-y divide-line">
          {members.map(member => <li key={member.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">@{member.username}</p><p className="truncate text-xs text-fg-3">{member.active ? member.name : 'Account inactive'}</p></div>
            <Button variant="ghost" disabled={change.isPending} onClick={() => setConfirm({ kind: 'revoke', id: member.id, username: member.username })}>Remove</Button>
          </li>)}
        </ul> : <p className="text-sm text-fg-3">No members have been invited yet.</p>}
      </section>
      <GameEntryQueue />
      <MonsterRewardControls />
      <ButtonLink to="/admin/logs" variant="ghost" leading={<History size={16} />}>View admin audit log</ButtonLink>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'revoke' ? `Remove @${confirm.username}?` : publish ? 'Launch Monster Fight?' : 'Return to private preview?'}
        description={confirm?.kind === 'revoke' ? 'This removes their access during private preview.' : publish ? 'The game will appear in the menu and anyone visiting OJASSS can play.' : 'Only admins and invited members will keep access. Existing launch links will expire immediately.'}
        confirmLabel={confirm?.kind === 'revoke' ? 'Remove access' : publish ? 'Go live' : 'Make private'}
        tone={publish ? 'primary' : 'danger'}
        loading={change.isPending}
        onConfirm={() => { if (confirm) change.mutate(confirm); }}
      />
    </div>
  );
}
