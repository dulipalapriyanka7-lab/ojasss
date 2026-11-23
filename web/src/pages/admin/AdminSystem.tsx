import {CategoryAdminPanel} from '@/components/admin/CategoryAdminPanel';
import {OjasssPgAdminPanel} from '@/components/admin/OjasssPgAdminPanel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {OneChanceAdminPanel} from '@/components/admin/OneChanceAdminPanel';
import {OneChanceCategorySettings} from '@/components/admin/OneChanceCategorySettings';
import {defaultOneChanceCategoryAccess, type OneChanceCategoryAccess} from '@/lib/oneChanceCategories';
import { HomeControlsPanel } from '@/components/admin/HomeControlsPanel';
import { LayoutOrderPanel } from '@/components/admin/LayoutOrderPanel';
import { PushAdminPanel } from '@/components/admin/PushAdminPanel';
import { StorageAdminPanel } from '@/components/admin/StorageAdminPanel';
import { env } from '@/lib/env';
import { AlertTriangle, Briefcase, FileClock, Megaphone, Plus, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Announcement } from '@/api';
import { admin, type AdminDeletionRow, type AdminInquiryRow, type AdminLogRow, type AppSetting } from '@/api/admin';
import { DataTable, FilterBar, FilterSelect, KV, Pager, SearchBox, SectionTitle, type Column } from '@/components/admin/AdminUI';
import { Button } from '@/components/ui/Button';
import { Card, ErrorState, Skeleton, StatusBadge } from '@/components/ui/Feedback';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { ConfirmDialog, Dialog, Drawer } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { INQUIRY_TYPES } from '@/lib/constants';
import { date, dateTime, humanize, rupees } from '@/lib/format';

const LIMIT = 25;

// ------------------------------------------------------------------ settings

function settingDisplay(s: AppSetting): string {
  if (typeof s.value === 'boolean') return s.value ? 'On' : 'Off';
  if (s.key.endsWith('_paise')) return rupees(Number(s.value));
  return String(s.value);
}

function SettingRow({ s }: { s: AppSetting }) {
  const qc = useQueryClient();
  const toast = useToast();
  const isMoney = s.key.endsWith('_paise');
  const [draft, setDraft] = useState<string>(typeof s.value === 'boolean' ? '' : isMoney ? (Number(s.value) / 100).toString() : String(s.value));
  const [confirm, setConfirm] = useState<unknown>(undefined);
  const [busy, setBusy] = useState(false);

  const parsed = (): number | null => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) return null;
    return isMoney ? Math.round(n * 100) : Math.round(n);
  };
  const save = async (value: unknown, reason: string) => {
    setBusy(true);
    try {
      await admin.updateSetting(s.key, value, reason, true);
      toast.success('Setting saved');
      setConfirm(undefined);
      await qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      await qc.invalidateQueries({ queryKey: ['public-settings'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const request = (value: unknown) => {
    if (s.is_dangerous) setConfirm(value);
    else void save(value, '');
  };

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-mono text-sm font-semibold">{s.key}{s.is_dangerous && <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 font-sans text-[10px] font-bold text-warning"><AlertTriangle aria-hidden size={11} />Sensitive</span>}</p>
        <p className="text-sm text-fg-3">{s.description}</p>
        <p className="text-xs text-fg-3">Current: <strong className="text-fg-2">{settingDisplay(s)}</strong> · updated {dateTime(s.updated_at)}</p>
      </div>
      {typeof s.value === 'boolean' ? (
        <Switch label={`Toggle ${s.key}`} checked={s.value} onChange={(v) => request(v)} disabled={busy} />
      ) : (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`s-${s.key}`}>{s.key}</label>
          <Input id={`s-${s.key}`} value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="decimal" className="!h-10 w-32 text-sm" leading={isMoney ? <span>₹</span> : undefined} />
          <Button size="sm" variant="secondary" loading={busy} disabled={parsed() === null || parsed() === Number(s.value)} onClick={() => request(parsed())}>Save</Button>
        </div>
      )}
      <ConfirmDialog
        open={confirm !== undefined}
        onClose={() => setConfirm(undefined)}
        title={`Change ${s.key}?`}
        description={`New value: ${typeof confirm === 'boolean' ? (confirm ? 'On' : 'Off') : isMoney ? rupees(Number(confirm)) : String(confirm)}. This affects all users immediately and is logged.`}
        tone="danger"
        confirmLabel="Apply change"
        reasonLabel="Reason for change"
        reasonRequired
        loading={busy}
        onConfirm={(reason) => save(confirm, reason)}
      />
    </li>
  );
}

export default function AdminSettings() {
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: admin.settings });
  const groups = new Map<string, AppSetting[]>();
  // Older settings records used `id` only. Normalise those rows before the
  // generic editor reads a key so legacy records cannot crash this route.
  const settings = (q.data ?? []).map((row) => {
    const legacy = row as AppSetting & { id?: string };
    return { ...row, key: row.key || legacy.id || '' };
  }).filter((row) => row.key !== '');
  const categoryAccess = (settings.find(row => row.key === 'one_chance.category_access')?.value as OneChanceCategoryAccess | undefined)
    ?? defaultOneChanceCategoryAccess;
  for (const s of settings) {
    // Complex One Chance package data is managed by its dedicated, validated card.
    // Do not send object arrays through the generic scalar settings editor.
    if(s.key.startsWith('layout.')||s.key==='categories.config'||s.key==='home.controls'||s.key==='one_chance.upi_id'||s.key==='one_chance.packages'||s.key==='one_chance.category_access'||['engagement.viral_threshold','engagement.speak_threshold'].includes(s.key))continue;
    const g = s.key.split('.')[0];
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }
  return (
    <>
      <SectionTitle title="Settings" description="Platform configuration. Values are validated on the server; sensitive changes need a reason and confirmation." />
      <div className="mb-4 rounded-xl border border-fuchsia-400/30 bg-gradient-to-r from-purple-500/10 to-pink-500/10 p-3"><b className="text-sm">Viral entry & feed display <span className="ml-2 rounded-full bg-brand-gradient px-2 py-1 text-[10px] text-white">NEW</span></b><p className="mt-1 text-xs text-fg-3">Minimum 10 Hots and 10 Shares. Set entry amount and footer reveal below. <b>One Chance Vote Window Hours</b> (default 12) is how long voting stays open after each approved payment; votes then lock until the creator pays again. Votes already received are kept.</p></div>
      {env.mysql && <>
        {q.data && <OneChanceCategorySettings key={JSON.stringify(categoryAccess)} access={categoryAccess}
          categories={settings.find(row => row.key === 'categories.config')?.value as import('@/api/types').PublicSettings['categories.config']} />}
        <OjasssPgAdminPanel />
        <OneChanceAdminPanel />
        <HomeControlsPanel />
        <CategoryAdminPanel />
        <LayoutOrderPanel />
        <PushAdminPanel />
        <StorageAdminPanel tools />
      </>}
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data ? <Skeleton className="h-96 rounded-2xl" /> : (
        <div className="space-y-4">
          {[...groups.entries()].map(([g, items]) => (
            <Card key={g} className="px-5" as="section">
              <h2 className="flex items-center gap-2 pt-4 font-semibold capitalize"><Settings aria-hidden size={16} className="text-fg-3" />{g}</h2>
              <ul className="divide-y divide-line">{items.map((s) => <SettingRow key={s.key + String(s.value)} s={s} />)}</ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ announcements

type Draft = { id?: string; title: string; message: string; imageUrl: string; ctaLabel: string; ctaUrl: string; startsAt: string; endsAt: string; displayDays: string; isActive: boolean; notify: boolean };
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const durationDays = (start:string,end:string) => { const ms=Date.parse(end)-Date.parse(start); return Number.isFinite(ms)&&ms>0 ? String(Math.max(1,Math.ceil(ms/86400000))) : ''; };

export function AdminAnnouncements() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'announcements'], queryFn: admin.announcements });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const open = (a?: Announcement) => setDraft(a
    ? { id: a.id, title: a.title, message: a.message, imageUrl: a.image_url ?? '', ctaLabel: a.cta_label ?? '', ctaUrl: a.cta_url ?? '', startsAt: toLocal(a.starts_at), endsAt: toLocal(a.ends_at), displayDays: durationDays(a.starts_at,a.ends_at ?? ''), isActive: a.is_active, notify: false }
    : { title: '', message: '', imageUrl: '', ctaLabel: '', ctaUrl: '', startsAt: toLocal(new Date().toISOString()), endsAt: '', displayDays: '1', isActive: true, notify: false });
  const urlOk = (u: string) => !u || /^(https:\/\/|\/)/.test(u);
  const valid = !!draft && draft.title.trim().length >= 2 && draft.message.trim().length >= 2 && urlOk(draft.ctaUrl) && (!draft.imageUrl || draft.imageUrl.startsWith('https://'));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await admin.upsertAnnouncement({
        id: draft.id, title: draft.title.trim(), message: draft.message.trim(), imageUrl: draft.imageUrl || null,
        ctaLabel: draft.ctaLabel || null, ctaUrl: draft.ctaUrl || null,
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null, endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
        isActive: draft.isActive, notify: draft.notify,
      });
      toast.success('Announcement saved');
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      await qc.invalidateQueries({ queryKey: ['announcements'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Announcement>[] = [
    { key: 't', header: 'Announcement', primary: true, cell: (a) => <span><span className="block font-semibold">{a.title}</span><span className="line-clamp-1 text-xs text-fg-3">{a.message}</span></span> },
    { key: 's', header: 'Starts', cell: (a) => dateTime(a.starts_at) },
    { key: 'e', header: 'Ends', cell: (a) => (a.ends_at ? dateTime(a.ends_at) : 'No end') },
    { key: 'st', header: 'Status', cell: (a) => <StatusBadge status={a.is_active && (!a.ends_at || new Date(a.ends_at) > new Date()) ? 'active' : 'closed'} /> },
  ];

  return (
    <>
      <SectionTitle title="Announcements" description="Shown as a banner on web and in the Android app; optionally sent as a notification." actions={<Button size="sm" leading={<Plus aria-hidden size={15} />} onClick={() => open()}>New announcement</Button>} />
      <DataTable caption="Announcements" rows={q.data} loading={q.isPending} error={q.error} onRetry={() => void q.refetch()} columns={columns} rowKey={(a) => a.id} onRowClick={open}
        empty={{ icon: Megaphone, title: 'No announcements', description: 'Publish updates, campaigns and policy changes.' }} />
      <Dialog open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit announcement' : 'New announcement'} size="lg"
        footer={<><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button><Button onClick={save} loading={busy} disabled={!valid}>Save</Button></>}>
        {draft && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" required className="sm:col-span-2">{(p) => <Input {...p} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} />}</Field>
            <Field label="Message" required className="sm:col-span-2">{(p) => <Textarea {...p} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} maxLength={2000} />}</Field>
            <Field label="Image URL" hint="https:// only" error={draft.imageUrl && !draft.imageUrl.startsWith('https://') ? 'Must start with https://' : null} className="sm:col-span-2">{(p) => <Input {...p} value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} />}</Field>
            <Field label="CTA label">{(p) => <Input {...p} value={draft.ctaLabel} onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })} maxLength={40} />}</Field>
            <Field label="CTA link" hint="/earnings or https://…" error={!urlOk(draft.ctaUrl) ? 'Use a relative path or https:// link.' : null}>{(p) => <Input {...p} value={draft.ctaUrl} onChange={(e) => setDraft({ ...draft, ctaUrl: e.target.value })} />}</Field>
            <Field label="Start date & time">{(p) => <Input {...p} type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />}</Field>
            <Field label="Display for days" hint="Sets the end date automatically.">{(p) => <Input {...p} type="number" min={1} max={365} value={draft.displayDays} onChange={(e) => { const displayDays=e.target.value; const start=Date.parse(draft.startsAt); const endsAt=displayDays&&Number.isFinite(start)?toLocal(new Date(start+Number(displayDays)*86400000).toISOString()):draft.endsAt; setDraft({...draft,displayDays,endsAt}); }} />}</Field>
            <Field label="End date & time">{(p) => <Input {...p} type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value, displayDays: durationDays(draft.startsAt,e.target.value) })} />}</Field>
            <div className="space-y-3 sm:col-span-2">
              <Switch label="Active" checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} />
              <Switch label="Also send as a notification to all active users" description="Use sparingly." checked={draft.notify} onChange={(v) => setDraft({ ...draft, notify: v })} />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------------ deletion requests

export function AdminDeletion() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState<{ row: AdminDeletionRow; action: 'processing' | 'complete' | 'reject' } | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'deletion', status, offset], queryFn: () => admin.deletionRequests({ status: status || null, limit: LIMIT, offset }), placeholderData: (p) => p });
  const total = Number(q.data?.[0]?.total_count ?? 0);
  const columns: Column<AdminDeletionRow>[] = [
    { key: 'u', header: 'Account', primary: true, cell: (d) => <span><span className="block font-semibold">{d.username ? `@${d.username}` : 'Account removed'}</span><span className="text-xs text-fg-3">{d.email}</span></span> },
    { key: 'src', header: 'Source', cell: (d) => humanize(d.source) },
    { key: 'r', header: 'Reason', cell: (d) => <span className="line-clamp-1">{d.reason ?? '—'}</span>, hideOnMobile: true },
    { key: 'd', header: 'Requested', cell: (d) => dateTime(d.created_at) },
    { key: 's', header: 'Status', cell: (d) => <StatusBadge status={d.status} /> },
  ];
  return (
    <>
      <SectionTitle title="Deletion requests" description="Verified requests from the public deletion page and in-app settings. Complete within 30 days." />
      <FilterBar><FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={['pending', 'processing', 'completed', 'rejected'].map((s) => ({ value: s, label: humanize(s) }))} /></FilterBar>
      <DataTable caption="Deletion requests" rows={q.data} loading={q.isPending} error={q.error} onRetry={() => void q.refetch()} columns={columns} rowKey={(d) => d.id}
        empty={{ icon: Trash2, title: 'No requests', description: 'Verified deletion requests appear here.' }}
        actions={(d) => (d.status === 'pending' || d.status === 'processing') ? (
          <span className="inline-flex gap-1.5">
            {d.status === 'pending' && <Button size="sm" variant="outline" onClick={() => setPending({ row: d, action: 'processing' })}>Start</Button>}
            <Button size="sm" variant="danger" onClick={() => setPending({ row: d, action: 'complete' })}>Delete account</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending({ row: d, action: 'reject' })}>Reject</Button>
          </span>
        ) : <span className="text-xs text-fg-3">{d.processed_by_username ? `@${d.processed_by_username} · ${date(d.processed_at)}` : ''}</span>} />
      <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
      <ConfirmDialog open={!!pending} onClose={() => setPending(null)}
        title={pending?.action === 'complete' ? `Permanently delete ${pending.row.username ? '@' + pending.row.username : 'this account'}?` : pending?.action === 'reject' ? 'Reject this request?' : 'Mark as processing?'}
        description={pending?.action === 'complete' ? 'Deletes the login, profile, posts, comments, messages and social graph. Financial and audit records are kept without identity. This cannot be undone.' : undefined}
        tone={pending?.action === 'processing' ? 'primary' : 'danger'} confirmLabel={pending?.action === 'complete' ? 'Delete permanently' : 'Confirm'}
        reasonLabel="Note" reasonRequired={pending?.action === 'reject'} loading={busy}
        onConfirm={async (note) => {
          if (!pending) return;
          setBusy(true);
          try {
            await admin.processDeletion(pending.row.id, pending.action, note || undefined);
            toast.success('Request updated');
            setPending(null);
            await qc.invalidateQueries({ queryKey: ['admin'] });
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(false);
          }
        }} />
    </>
  );
}

// ------------------------------------------------------------------ audit log

export function AdminLogs() {
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminLogRow | null>(null);
  const q = useQuery({ queryKey: ['admin', 'logs', action, target, offset], queryFn: () => admin.logs({ action, targetType: target || null, limit: 50, offset }), placeholderData: (p) => p });
  const total = Number(q.data?.[0]?.total_count ?? 0);
  const columns: Column<AdminLogRow>[] = [
    { key: 'a', header: 'Action', primary: true, cell: (l) => <code className="text-xs font-semibold">{l.action}</code> },
    { key: 'admin', header: 'Admin', cell: (l) => (l.admin_username ? `@${l.admin_username}` : 'system') },
    { key: 't', header: 'Target', cell: (l) => <span className="text-xs">{l.target_type} · <code>{(l.target_id ?? '').slice(0, 12)}</code></span> },
    { key: 'r', header: 'Reason', cell: (l) => <span className="line-clamp-1">{l.reason ?? '—'}</span>, hideOnMobile: true },
    { key: 'ip', header: 'IP', cell: (l) => l.ip ?? '—', hideOnMobile: true },
    { key: 'd', header: 'Time', cell: (l) => dateTime(l.created_at) },
  ];
  return (
    <>
      <SectionTitle title="Admin logs" description="Append-only audit trail. Entries cannot be edited or deleted by anyone, including admins." />
      <FilterBar>
        <SearchBox value={action} onChange={(v) => { setAction(v); setOffset(0); }} placeholder="Action prefix, e.g. withdrawal." />
        <FilterSelect label="Target" value={target} onChange={(v) => { setTarget(v); setOffset(0); }} options={['user', 'post', 'comment', 'complaint', 'report', 'earning', 'withdrawal', 'setting', 'announcement', 'deletion_request', 'authority', 'inquiry'].map((t) => ({ value: t, label: humanize(t) }))} />
      </FilterBar>
      <DataTable caption="Admin logs" rows={q.data} loading={q.isPending} error={q.error} onRetry={() => void q.refetch()} columns={columns} rowKey={(l) => String(l.id)} onRowClick={setSelected}
        empty={{ icon: FileClock, title: 'No log entries', description: 'Admin actions will be recorded here.' }} />
      <Pager offset={offset} limit={50} total={total} onChange={setOffset} />
      {selected && (
        <Drawer open onClose={() => setSelected(null)} title={selected.action} description={dateTime(selected.created_at)}>
          <KV items={[['Admin', selected.admin_username ? `@${selected.admin_username}` : 'system'], ['Target', `${selected.target_type} ${selected.target_id ?? ''}`], ['Reason', selected.reason], ['IP', selected.ip]]} />
          <h3 className="mt-6 mb-2 text-sm font-semibold">Previous state</h3>
          <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(selected.previous_state, null, 2) ?? 'null'}</pre>
          <h3 className="mt-4 mb-2 text-sm font-semibold">New state</h3>
          <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(selected.new_state, null, 2) ?? 'null'}</pre>
        </Drawer>
      )}
    </>
  );
}

// ------------------------------------------------------------------ business inquiries

export function AdminInquiries() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('new');
  const [type, setType] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminInquiryRow | null>(null);
  const [note, setNote] = useState('');
  const [next, setNext] = useState('in_progress');
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'inquiries', status, type, offset], queryFn: () => admin.inquiries({ status: status || null, type: type || null, limit: LIMIT, offset }), placeholderData: (p) => p });
  const total = Number(q.data?.[0]?.total_count ?? 0);
  const columns: Column<AdminInquiryRow>[] = [
    { key: 'b', header: 'Business', primary: true, cell: (i) => <span><span className="block font-semibold">{i.business_name}</span><span className="text-xs text-fg-3">{i.contact_name}</span></span> },
    { key: 't', header: 'Type', cell: (i) => INQUIRY_TYPES.find((t) => t.value === i.type)?.label ?? i.type },
    { key: 'c', header: 'Contact', cell: (i) => <span className="text-xs">{i.phone} · {i.email}</span>, hideOnMobile: true },
    { key: 'd', header: 'Received', cell: (i) => date(i.created_at) },
    { key: 's', header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
  ];
  return (
    <>
      <SectionTitle title="Business inquiries" description="GST consultants, investors and business promotion leads." />
      <FilterBar>
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={[{ value: 'new', label: 'New' }, { value: 'in_progress', label: 'In progress' }, { value: 'closed', label: 'Closed' }]} />
        <FilterSelect label="Type" value={type} onChange={(v) => { setType(v); setOffset(0); }} options={INQUIRY_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
      </FilterBar>
      <DataTable caption="Business inquiries" rows={q.data} loading={q.isPending} error={q.error} onRetry={() => void q.refetch()} columns={columns} rowKey={(i) => i.id}
        onRowClick={(i) => { setSelected(i); setNote(i.admin_note ?? ''); setNext(i.status === 'new' ? 'in_progress' : i.status); }}
        empty={{ icon: Briefcase, title: 'No inquiries', description: 'New leads will show up here.' }} />
      <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
      {selected && (
        <Drawer open onClose={() => setSelected(null)} title={selected.business_name} description={INQUIRY_TYPES.find((t) => t.value === selected.type)?.label}
          footer={<Button loading={busy} onClick={async () => {
            setBusy(true);
            try {
              await admin.updateInquiry(selected.id, next, note || undefined);
              toast.success('Inquiry updated');
              setSelected(null);
              await qc.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
            } catch (e) {
              toast.error(e);
            } finally {
              setBusy(false);
            }
          }}>Save</Button>}>
          <KV items={[['Contact', selected.contact_name], ['Phone', <a key="p" href={`tel:${selected.phone}`} className="underline">{selected.phone}</a>], ['Email', <a key="e" href={`mailto:${selected.email}`} className="underline">{selected.email}</a>], ['Account', selected.username ? `@${selected.username}` : '—'], ['Received', dateTime(selected.created_at)]]} />
          <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap">{selected.message}</p>
          <div className="mt-4 space-y-3">
            <Field label="Status">{(p) => <Select {...p} value={next} onChange={(e) => setNext(e.target.value)}><option value="new">New</option><option value="in_progress">In progress</option><option value="closed">Closed</option></Select>}</Field>
            <Field label="Internal note">{(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          </div>
        </Drawer>
      )}
    </>
  );
}
