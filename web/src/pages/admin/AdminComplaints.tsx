import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ExternalLink, Mail, Plus, Scale, Send } from 'lucide-react';
import { useState } from 'react';
import { complaints as complaintsApi } from '@/api';
import { admin, type AdminComplaintRow, type AuthorityRow } from '@/api/admin';
import { DataTable, FilterBar, FilterSelect, KV, Pager, SearchBox, SectionTitle, type Column } from '@/components/admin/AdminUI';
import { Button } from '@/components/ui/Button';
import { Card, ErrorState, Skeleton, StatusBadge } from '@/components/ui/Feedback';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Misc';
import { ConfirmDialog, Dialog, Drawer } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { COMPLAINT_SUBCATEGORIES } from '@/lib/constants';
import { date, dateTime, humanize } from '@/lib/format';

const LIMIT = 25;
const subLabel = (s: string) => COMPLAINT_SUBCATEGORIES.find((x) => x.value === s)?.label ?? humanize(s);

interface Detail {
  complaint: { subcategory: string; description: string; location: string; legal_assistance_requested: boolean; forward_requested: boolean;
    forward_status: string; forwarded_at: string | null; forward_attempts: number; last_forward_error: string | null; status: string;
    authority_id: string | null; authority_response: string | null; created_at: string };
  post: { caption: string; author_username: string; status: string } | null;
  authority: AuthorityRow | null;
  notes: Array<{ id: string; note: string; created_at: string; admin_username: string | null }>;
  history: Array<{ action: string; reason: string | null; created_at: string; admin_username: string | null }>;
}

function ComplaintDrawer({ row, onClose }: { row: AdminComplaintRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [response, setResponse] = useState('');
  const [authorityId, setAuthorityId] = useState('');
  const [confirm, setConfirm] = useState<null | { action: string; title: string; reasonRequired: boolean; tone: 'danger' | 'primary' }>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin', 'complaint', row.post_id], queryFn: () => admin.complaintDetail(row.post_id) });
  const authorities = useQuery({ queryKey: ['admin', 'authorities'], queryFn: admin.authorities });
  const d = q.data as Detail | undefined;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['admin'] });
  };
  const act = async (label: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try {
      await fn();
      toast.success(success);
      await refresh();
      return true;
    } catch (e) {
      toast.error(e);
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer open onClose={onClose} title="Complaint" description={`${subLabel(row.subcategory)} · ${row.location}`}>
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} compact /> : !d ? <Skeleton className="h-72 rounded-xl" /> : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-warning/40 bg-warning-soft/50 p-4">
            <p className="text-xs font-bold tracking-wide text-warning uppercase">User allegation (unverified)</p>
            <p className="mt-2 text-sm whitespace-pre-wrap">{d.complaint.description}</p>
            <p className="mt-2 text-xs text-fg-3">By @{d.post?.author_username} · {dateTime(d.complaint.created_at)}</p>
          </section>
          <KV items={[
            ['Review status', <StatusBadge key="s" status={d.complaint.status} />],
            ['Post status', <StatusBadge key="p" status={d.post?.status ?? 'deleted'} />],
            ['Forwarding requested', d.complaint.forward_requested ? 'Yes' : 'No'],
            ['Forward status', <span key="f"><StatusBadge status={d.complaint.forward_status} /> {d.complaint.forwarded_at && <span className="text-xs text-fg-3">{dateTime(d.complaint.forwarded_at)}</span>}</span>],
            ['Attempts', d.complaint.forward_attempts],
            ['Last error', d.complaint.last_forward_error],
            ['Legal assistance', d.complaint.legal_assistance_requested ? 'Requested' : 'No'],
            ['Authority', d.authority ? `${d.authority.name}${d.authority.department ? ` — ${d.authority.department}` : ''}` : 'Not set'],
            ['Authority email', d.authority?.email],
          ]} />
          <a href={`/post/${row.post_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink hover:underline"><ExternalLink aria-hidden size={14} />Open post</a>

          <section className="space-y-3 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">Platform processing</h3>
            <div className="flex flex-wrap gap-2">
              {d.complaint.status === 'submitted' && <Button size="sm" variant="outline" loading={busy === 'review'} onClick={() => void act('review', () => admin.updateComplaint(row.post_id, 'under_review'), 'Marked under review')}>Mark under review</Button>}
              {d.post?.status === 'pending_review' && <Button size="sm" loading={busy === 'approve'} onClick={() => void act('approve', () => admin.moderatePost(row.post_id, 'approve'), 'Complaint post published')}>Approve post</Button>}
              <Button size="sm" variant="outline" onClick={() => setConfirm({ action: 'resolve', title: 'Mark as resolved?', reasonRequired: false, tone: 'primary' })}>Resolve</Button>
              <Button size="sm" variant="danger" onClick={() => setConfirm({ action: 'reject', title: 'Reject this complaint?', reasonRequired: true, tone: 'danger' })}>Reject</Button>
            </div>
            <div className="flex items-end gap-2">
              <Field label="Assign authority" className="flex-1">
                {(p) => (
                  <Select {...p} value={authorityId || d.complaint.authority_id || ''} onChange={(e) => setAuthorityId(e.target.value)} className="!h-10 text-sm">
                    <option value="">Choose…</option>
                    {authorities.data?.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}{a.department ? ` — ${a.department}` : ''}</option>)}
                  </Select>
                )}
              </Field>
              <Button size="sm" variant="secondary" disabled={!authorityId || authorityId === d.complaint.authority_id} loading={busy === 'auth'}
                onClick={() => void act('auth', () => admin.updateComplaint(row.post_id, 'set_authority', { authorityId }), 'Authority assigned')}>Save</Button>
            </div>
          </section>

          <section className="space-y-3 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">Forwarded communication</h3>
            <p className="text-xs text-fg-3">Sends the complaint as submitted, with the OJASSS unverified-allegation disclaimer, to the assigned authority's official address. The recipient is chosen on the server.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" leading={<Send aria-hidden size={15} />} disabled={!d.authority || d.complaint.forward_status === 'forwarded'} loading={busy === 'forward'}
                onClick={() => void act('forward', () => complaintsApi.forward(row.post_id), 'Complaint emailed to authority')}>Forward by email</Button>
              <Button size="sm" variant="outline" disabled={d.complaint.forward_status === 'forwarded'} onClick={() => setConfirm({ action: 'mark_forwarded', title: 'Mark as forwarded manually?', reasonRequired: true, tone: 'primary' })}>Mark forwarded</Button>
            </div>
          </section>

          <section className="space-y-2 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">Authority response</h3>
            {d.complaint.authority_response ? <p className="rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap">{d.complaint.authority_response}</p> : null}
            <Textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Record a response received from the authority (shown publicly on the post)" className="min-h-20" aria-label="Authority response" />
            <Button size="sm" variant="secondary" disabled={response.trim().length < 3} loading={busy === 'resp'}
              onClick={() => void act('resp', () => admin.updateComplaint(row.post_id, 'record_response', { response }), 'Response recorded').then((ok) => ok && setResponse(''))}>Record response</Button>
          </section>

          <section className="space-y-2 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">Internal notes <span className="font-normal text-fg-3">(staff only)</span></h3>
            <ul className="space-y-2">{d.notes.map((n) => <li key={n.id} className="rounded-xl bg-surface-2 p-3 text-sm"><p className="whitespace-pre-wrap">{n.note}</p><p className="mt-1 text-xs text-fg-3">@{n.admin_username ?? 'system'} · {dateTime(n.created_at)}</p></li>)}</ul>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note" className="min-h-20" aria-label="Internal note" />
            <Button size="sm" variant="secondary" disabled={!note.trim()} loading={busy === 'note'}
              onClick={() => void act('note', () => admin.addComplaintNote(row.post_id, note), 'Note added').then((ok) => ok && setNote(''))}>Add note</Button>
          </section>

          <section className="border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-semibold">Audit trail</h3>
            {d.history.length === 0 ? <p className="text-sm text-fg-3">No actions yet.</p> : (
              <ol className="space-y-1.5 text-sm">{d.history.map((h, i) => <li key={i}><span className="font-medium">{h.action}</span> · @{h.admin_username ?? 'system'} · <span className="text-fg-3">{dateTime(h.created_at)}</span>{h.reason && <p className="text-xs text-fg-3">“{h.reason}”</p>}</li>)}</ol>
            )}
          </section>
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        description="The complainant is notified and the action is logged."
        tone={confirm?.tone}
        reasonLabel={confirm?.action === 'mark_forwarded' ? 'How was it forwarded?' : 'Note'}
        reasonRequired={confirm?.reasonRequired}
        loading={!!busy}
        onConfirm={async (reason) => {
          if (!confirm) return;
          const ok = await act('confirm', () => admin.updateComplaint(row.post_id, confirm.action, { note: reason || undefined }), 'Complaint updated');
          if (ok) setConfirm(null);
        }}
      />
    </Drawer>
  );
}

function AuthoritiesPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'authorities'], queryFn: admin.authorities });
  const [editing, setEditing] = useState<Partial<AuthorityRow> | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!editing?.name || !editing.email) return;
    setBusy(true);
    try {
      await admin.upsertAuthority(editing as AuthorityRow);
      toast.success('Authority saved');
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['admin', 'authorities'] });
      await qc.invalidateQueries({ queryKey: ['authorities'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="mb-3 flex justify-between gap-2">
        <p className="text-sm text-fg-3">Official recipients users can choose when asking OJASSS to forward a complaint.</p>
        {isAdmin && <Button size="sm" leading={<Plus aria-hidden size={15} />} onClick={() => setEditing({ is_active: true })}>Add authority</Button>}
      </div>
      <DataTable
        caption="Authorities"
        rows={q.data}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(a) => a.id}
        onRowClick={isAdmin ? (a) => setEditing(a) : undefined}
        empty={{ icon: Building2, title: 'No authorities yet', description: 'Add verified official addresses so complaints can be forwarded.' }}
        columns={[
          { key: 'name', header: 'Authority', primary: true, cell: (a) => <span className="font-semibold">{a.name}</span> },
          { key: 'dept', header: 'Department', cell: (a) => a.department || '—' },
          { key: 'jur', header: 'Jurisdiction', cell: (a) => a.jurisdiction || '—' },
          { key: 'email', header: 'Email', cell: (a) => <span className="inline-flex items-center gap-1"><Mail aria-hidden size={13} />{a.email}</span> },
          { key: 'active', header: 'Status', cell: (a) => <StatusBadge status={a.is_active ? 'active' : 'cancelled'} /> },
        ]}
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit authority' : 'Add authority'}
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} loading={busy} disabled={!editing?.name || !editing?.email}>Save</Button></>}>
        {editing && (
          <div className="space-y-3">
            <Field label="Name" required>{(p) => <Input {...p} value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}</Field>
            <Field label="Department">{(p) => <Input {...p} value={editing.department ?? ''} onChange={(e) => setEditing({ ...editing, department: e.target.value })} />}</Field>
            <Field label="Jurisdiction">{(p) => <Input {...p} value={editing.jurisdiction ?? ''} onChange={(e) => setEditing({ ...editing, jurisdiction: e.target.value })} placeholder="e.g. Pune Municipal Corporation" />}</Field>
            <Field label="Official email" required hint="Only use publicly listed official addresses.">{(p) => <Input {...p} type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />}</Field>
            <Switch label="Active" checked={editing.is_active ?? true} onChange={(v) => setEditing({ ...editing, is_active: v })} />
          </div>
        )}
      </Dialog>
    </>
  );
}

export default function AdminComplaints() {
  const [tab, setTab] = useState<'queue' | 'authorities'>('queue');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [forward, setForward] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminComplaintRow | null>(null);
  const list = useQuery({
    queryKey: ['admin', 'complaints', q, status, forward, offset],
    queryFn: () => admin.complaints({ q, status: status || null, forwardStatus: forward || null, limit: LIMIT, offset }),
    placeholderData: (p) => p,
    enabled: tab === 'queue',
  });
  const total = Number(list.data?.[0]?.total_count ?? 0);

  const columns: Column<AdminComplaintRow>[] = [
    { key: 'c', header: 'Complaint', primary: true, cell: (c) => <span><span className="block font-semibold">{subLabel(c.subcategory)}</span><span className="line-clamp-1 text-xs text-fg-3">{c.caption || 'No caption'}</span></span> },
    { key: 'creator', header: 'Creator', cell: (c) => `@${c.author_username}` },
    { key: 'loc', header: 'Location', cell: (c) => c.location },
    { key: 'auth', header: 'Authority', cell: (c) => c.authority_name ?? '—', hideOnMobile: true },
    { key: 'fwd', header: 'Forward status', cell: (c) => <StatusBadge status={c.forward_status} /> },
    { key: 'legal', header: 'Legal help', cell: (c) => (c.legal_assistance_requested ? 'Yes' : 'No'), hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'date', header: 'Date', cell: (c) => date(c.created_at) },
  ];

  return (
    <>
      <SectionTitle title="Complaints" description="User allegations, platform processing and authority communication — kept separate and fully audited." />
      <Tabs label="Complaints" value={tab} onChange={setTab} items={[{ value: 'queue', label: 'Queue' }, { value: 'authorities', label: 'Authorities' }]} className="mb-4" />
      {tab === 'authorities' ? <Card className="p-4"><AuthoritiesPanel /></Card> : (
        <>
          <FilterBar>
            <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search description, location, @user" />
            <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={['submitted', 'under_review', 'forwarded', 'resolved', 'rejected'].map((s) => ({ value: s, label: humanize(s) }))} />
            <FilterSelect label="Forwarding" value={forward} onChange={(v) => { setForward(v); setOffset(0); }} options={['not_requested', 'pending', 'forwarded', 'failed'].map((s) => ({ value: s, label: humanize(s) }))} />
          </FilterBar>
          <DataTable caption="Complaints" rows={list.data} loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} columns={columns} rowKey={(c) => c.post_id} onRowClick={setSelected}
            empty={{ icon: Scale, title: 'No complaints match', description: 'New public complaints will appear here for review.' }} />
          <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
        </>
      )}
      {selected && <ComplaintDrawer row={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
