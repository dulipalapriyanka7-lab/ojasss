import './users-slim.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Ban, CircleDollarSign, ShieldCheck, UserCog, Users, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
import { admin, type AdminUserRow } from '@/api/admin';
import { DataTable, FilterBar, FilterSelect, KV, Pager, SearchBox, SectionTitle, type Column } from '@/components/admin/AdminUI';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton, StatusBadge } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Field';
import { Avatar, VerifiedMark } from '@/components/ui/Misc';
import { ConfirmDialog, Drawer } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { count, date, dateTime, humanize, rupees, timeAgo } from '@/lib/format';

const ProfileTaskAdmin=lazy(()=>import('@/components/admin/ProfileTaskAdmin'));
const LIMIT = 25;
type Action = { action: string; role?: string; title: string; tone: 'danger' | 'primary'; reason: boolean };

function UserDrawer({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const { isAdmin, me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<Action | null>(null);
  const [role, setRole] = useState(user.role);
  const [showTasks,setShowTasks]=useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'user', user.id], queryFn: () => admin.userDetail(user.id) });
  const d = q.data as undefined | {
    profile: Record<string, string | number | boolean | null>;
    wallet: Record<string, number>;
    finance: { paid_withdrawals:number; open_withdrawals:number; last_paid_at:string|null; last_paid_paise:number } | null;
    reports_against: Array<{ id: string; reason: string; status: string; target_type: string; created_at: string }>;
    recent_posts: Array<{ id: string; caption: string; status: string; kind: string; created_at: string }>;
    admin_history: Array<{ action: string; reason: string | null; created_at: string; admin_username: string | null }>;
  };
  const isSelf = me?.id === user.id;

  const run = async (a: Action, reason: string) => {
    setBusy(true);
    try {
      await admin.manageUser(user.id, a.action, reason || undefined, a.role);
      toast.success('User updated');
      setPending(null);
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title={user.display_name || user.username} description={`@${user.username}`}>
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} compact /> : !d ? <Skeleton className="h-64 rounded-xl" /> : (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Avatar path={user.avatar_path} name={user.display_name || user.username} size={56} />
            <div className="flex flex-wrap gap-1.5"><StatusBadge status={user.status} /><span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold capitalize">{user.role}</span>{user.is_verified && <VerifiedMark />}</div>
          </div>
          <KV items={[
            ['Email', user.email], ['User ID', <code key="id" className="text-xs">{user.id}</code>], ['Joined', dateTime(user.created_at)],
            ['Last active', user.last_active_at ? timeAgo(user.last_active_at) : 'Never'], ['Last sign-in', dateTime(d.profile.last_sign_in_at as string)],
            ['Respected by', count(user.followers_count)], ['Posts', count(user.posts_count)],
            ['Status reason', (d.profile.status_reason as string) || '—'],
          ]} />
          {isAdmin && (
            <section className="admin-user-finance">
              <div className="mb-2 flex items-center justify-between gap-2"><h3 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Wallet size={15} className="text-fuchsia-300"/>Wallet overview</h3><span className="text-[11px] font-semibold text-fg-3">Profile finance</span></div>
              <div className="admin-user-finance-grid">
                {[{Icon:CircleDollarSign,label:'Total earned',value:d.wallet.lifetime_paise,tone:'is-earned'},{Icon:Wallet,label:'Paid to user',value:d.wallet.withdrawn_paise,tone:'is-paid'},{Icon:Wallet,label:'Available',value:d.wallet.available_paise,tone:'is-available'},{Icon:CircleDollarSign,label:'In withdrawal',value:d.wallet.in_process_paise,tone:'is-processing'}].map(({Icon,label,value,tone})=><motion.div key={label} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.2}} className={`admin-user-finance-card ${tone}`}><Icon aria-hidden size={15}/><span>{label}</span><b>{rupees(value)}</b></motion.div>)}
              </div>
              <div className="admin-user-finance-meta"><span>{d.finance?.paid_withdrawals??0} paid withdrawal{(d.finance?.paid_withdrawals??0)===1?'':'s'}</span><span>{d.finance?.open_withdrawals??0} in progress</span>{d.finance?.last_paid_at&&<span>Last paid {date(d.finance.last_paid_at)} · {rupees(d.finance.last_paid_paise)}</span>}</div>
            </section>
          )}
          {isAdmin&&<div className="space-y-2"><Button size="sm" variant="outline" aria-expanded={showTasks} onClick={()=>setShowTasks(!showTasks)}>{showTasks?'Close task management':'Manage profile tasks'}</Button>{showTasks&&<Suspense fallback={<p role="status">Loading tasks…</p>}><ProfileTaskAdmin key={user.id} userId={user.id}/></Suspense>}</div>}
          <section>
            <h3 className="mb-2 text-sm font-semibold">Reports against ({d.reports_against.length})</h3>
            {d.reports_against.length === 0 ? <p className="text-sm text-fg-3">None</p> : (
              <ul className="space-y-1 text-sm">{d.reports_against.map((r) => <li key={r.id} className="flex justify-between gap-2"><span>{humanize(r.reason)} · {r.target_type}</span><span className="flex items-center gap-2 text-fg-3">{date(r.created_at)}<StatusBadge status={r.status} /></span></li>)}</ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Recent activity</h3>
            {d.recent_posts.length === 0 ? <p className="text-sm text-fg-3">No posts</p> : (
              <ul className="space-y-1 text-sm">{d.recent_posts.map((p) => <li key={p.id} className="flex justify-between gap-2"><a href={`/post/${p.id}`} target="_blank" rel="noreferrer" className="truncate hover:underline">{p.kind}: {p.caption || 'Untitled'}</a><StatusBadge status={p.status} /></li>)}</ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Admin history</h3>
            {d.admin_history.length === 0 ? <p className="text-sm text-fg-3">No admin actions</p> : (
              <ul className="space-y-1.5 text-sm">{d.admin_history.map((h, i) => <li key={i}><span className="font-medium">{h.action}</span> by @{h.admin_username ?? 'system'} · <span className="text-fg-3">{dateTime(h.created_at)}</span>{h.reason && <p className="text-xs text-fg-3">“{h.reason}”</p>}</li>)}</ul>
            )}
          </section>

          {isAdmin && !isSelf && (
            <section className="space-y-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Actions</h3>
              <div className="flex flex-wrap gap-2">
                {user.status === 'active' ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setPending({ action: 'suspend', title: 'Suspend this user?', tone: 'danger', reason: true })}>Suspend</Button>
                    <Button variant="danger" size="sm" leading={<Ban aria-hidden size={15} />} onClick={() => setPending({ action: 'ban', title: 'Ban (block) this user?', tone: 'danger', reason: true })}>Ban</Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setPending({ action: user.status === 'banned' ? 'unban' : 'unsuspend', title: 'Restore this account?', tone: 'primary', reason: true })}>
                    {user.status === 'banned' ? 'Unban' : 'Unsuspend'}
                  </Button>
                )}
                <Button variant="outline" size="sm" leading={<BadgeCheck aria-hidden size={15} />} onClick={() => setPending({ action: user.is_verified ? 'unverify' : 'verify', title: user.is_verified ? 'Remove verification?' : 'Verify this creator?', tone: 'primary', reason: false })}>
                  {user.is_verified ? 'Unverify' : 'Verify'}
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="role" className="mb-1 block text-xs text-fg-3">Role</label>
                  <Select id="role" value={role} onChange={(e) => setRole(e.target.value as AdminUserRow['role'])} className="!h-10 text-sm">
                    <option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option>
                  </Select>
                </div>
                <Button size="sm" variant="secondary" leading={<UserCog aria-hidden size={15} />} disabled={role === user.role} onClick={() => setPending({ action: 'set_role', role, title: `Change role to ${role}?`, tone: role === 'admin' ? 'danger' : 'primary', reason: true })}>Change role</Button>
              </div>
            </section>
          )}
          {isSelf && <p className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm text-fg-3"><ShieldCheck aria-hidden size={16} />Another admin must change your own account.</p>}
        </div>
      )}
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending?.title ?? ''}
        description="This action is recorded in the admin audit log."
        tone={pending?.tone}
        reasonLabel={pending?.reason ? 'Reason' : undefined}
        reasonRequired={pending?.action === 'suspend' || pending?.action === 'ban' || pending?.action === 'set_role'}
        loading={busy}
        onConfirm={(reason) => (pending ? run(pending, reason) : undefined)}
      />
    </Drawer>
  );
}

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const list = useQuery({
    queryKey: ['admin', 'users', q, status, role, offset],
    queryFn: () => admin.users({ q, status: status || null, role: role || null, limit: LIMIT, offset }),
    placeholderData: (prev) => prev,
  });
  const total = Number(list.data?.[0]?.total_count ?? 0);

  const columns: Column<AdminUserRow>[] = [
    { key: 'user', header: 'User', primary: true, cell: (u) => (
      <span className="flex items-center gap-3"><Avatar path={u.avatar_path} name={u.display_name || u.username} size={34} />
        <span className="min-w-0"><span className="flex items-center gap-1 font-semibold"><span className="truncate">{u.display_name || u.username}</span>{u.is_verified && <VerifiedMark size={14} />}</span><span className="block truncate text-xs text-fg-3">@{u.username}</span></span></span>
    ) },
    { key: 'email', header: 'Email', cell: (u) => <span className="text-fg-2">{u.email}</span>, hideOnMobile: true },
    {key:'competition',header:'Viral / One Chance',cell:u=><span className="space-y-1 text-xs"><b className="block text-purple-400">{u.competition_rank?`Position #${u.competition_rank}`:'Not ranked'}</b><span className="block">{u.viral_videos??0} Viral · {u.one_chance_videos??0} One Chance</span></span>},
    { key: 'role', header: 'Role', cell: (u) => <span className="capitalize">{u.role}</span> },
    { key: 'status', header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
    { key: 'reports', header: 'Open reports', cell: (u) => <span className={Number(u.open_reports) ? 'font-semibold text-danger' : 'text-fg-3'}>{u.open_reports}</span> },
    { key: 'earn', header: 'Earned', cell: (u) => rupees(u.approved_paise), hideOnMobile: true },
    { key: 'paid', header: 'Paid', cell: (u) => <span className="font-medium text-emerald-600 dark:text-emerald-300">{rupees(u.paid_paise)}</span>, hideOnMobile: true },
    { key: 'joined', header: 'Joined', cell: (u) => date(u.created_at) },
  ];

  return (
    <div className="au-slim">
      <SectionTitle title="Users" description="Search, review activity and manage access. Role and status changes are enforced by the database." />
      <FilterBar>
        <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search name, username, email or ID" />
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'banned', label: 'Banned' }]} />
        <FilterSelect label="Role" value={role} onChange={(v) => { setRole(v); setOffset(0); }} options={[{ value: 'user', label: 'User' }, { value: 'moderator', label: 'Moderator' }, { value: 'admin', label: 'Admin' }]} />
      </FilterBar>
      <DataTable
        caption="Users"
        rows={list.data}
        loading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        columns={columns}
        rowKey={(u) => u.id}
        onRowClick={setSelected}
        empty={{ icon: Users, title: 'No users match', description: 'Try a different search or filter.' }}
      />
      <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
      {selected && <UserDrawer user={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
