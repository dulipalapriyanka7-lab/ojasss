import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, ExternalLink, Trash2, ShieldAlert, Image as ImageIcon, Heart } from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {Field,Input,Textarea} from '@/components/ui/Field';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { admin, type AdminPostRow } from '@/api/admin';
import { DataTable, FilterBar, FilterSelect, Pager, SearchBox, SectionTitle, type Column } from '@/components/admin/AdminUI';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Feedback';
import { ConfirmDialog,Dialog } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { CATEGORIES, categoryLabel, languageLabel } from '@/lib/constants';
import { count, date } from '@/lib/format';
import { mediaUrl } from '@/lib/media';

const LIMIT = 25;
type Mod = { row: AdminPostRow; action: 'approve' | 'remove' | 'restore' | 'flag' };

/** Shared moderation workflow for videos and posters. */
export default function AdminContent({ kind }: { kind: 'video' | 'poster' }) {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const {isAdmin}=useAuth();
  const [deleting,setDeleting]=useState<AdminPostRow|null>(null),[reason,setReason]=useState(''),[confirmation,setConfirmation]=useState('');
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [category, setCategory] = useState('');
  const [offset, setOffset] = useState(0);
  const [mod, setMod] = useState<Mod | null>(null);
  const [seriesId,setSeriesId]=useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ['admin', 'posts', kind, q, status, category, offset],
    queryFn: () => admin.posts({ kind, q, status: status || null, category: category || null, limit: LIMIT, offset }),
    placeholderData: (p) => p,
  });
  const total = Number(list.data?.[0]?.total_count ?? 0);
  const seriesInterest=useQuery({queryKey:['admin','series-interest',seriesId],queryFn:()=>admin.seriesInterest(seriesId!),enabled:!!seriesId});

  const columns: Column<AdminPostRow>[] = [
    { key: 'post', header: kind === 'video' ? 'Video' : 'Poster', primary: true, cell: (p) => (
      <span className="flex items-center gap-3">
        <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          {p.thumbnail_path && <img src={mediaUrl(p.thumbnail_path)!} alt="" loading="lazy" className="size-full object-cover" />}
        </span>
        <span className="min-w-0"><span className="line-clamp-2 text-sm">{p.caption || <em className="text-fg-3">No caption</em>}</span><span className="block text-xs text-fg-3">@{p.author_username}</span></span>
      </span>
    ) },
    { key: 'origin', header: 'Content source', cell: (p) => p.content_origin === 'new_content' ? 'New Content' : p.content_origin === 'copy_paste' ? 'Copy-Paste Content' : 'Not specified' },
    { key: 'cat', header: 'Category', cell: (p) => categoryLabel(p.category) },
    { key: 'lang', header: 'Language', cell: (p) => languageLabel(p.language), hideOnMobile: true },
    { key: 'views', header: 'Views', cell: (p) => count(p.views_count) },
    { key: 'eng', header: 'HOT / SPEAK / VIRAL', cell: (p) => <span className="tabular">{count(p.hot_count)} / {count(p.speak_count)} / {count(p.viral_count)}</span> },
    { key: 'reports', header: 'Reports', cell: (p) => <span className={Number(p.open_reports) ? 'font-semibold text-danger' : 'text-fg-3'}>{p.open_reports}</span>, hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
    { key: 'date', header: 'Created', cell: (p) => date(p.created_at), hideOnMobile: true },
  ];

  const run = async (reason: string) => {
    if (!mod) return;
    setBusy(true);
    try {
      await admin.moderatePost(mod.row.id, mod.action, reason || undefined);
      toast.success(`Post ${mod.action === 'approve' || mod.action === 'restore' ? 'published' : mod.action === 'remove' ? 'removed' : 'flagged'}`);
      setMod(null);
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const deleteMedia=async()=>{
    if(!deleting||busy||confirmation!=='DELETE'||reason.trim().length<3)return;
    setBusy(true);try{
      await admin.deleteMedia(deleting.id,reason.trim(),confirmation);
      qc.removeQueries({queryKey:['post',deleting.id]});
      await Promise.all([qc.invalidateQueries({queryKey:['admin']}),qc.resetQueries({queryKey:['feed']}),qc.resetQueries({queryKey:['profile-posts']}),qc.invalidateQueries({queryKey:['profile']}),qc.invalidateQueries({queryKey:['bookmarks']})]);
      setDeleting(null);setOffset(0);setReason('');setConfirmation('');toast.success('Media permanently deleted');
    }catch(e){toast.error(e);}finally{setBusy(false);}
  };
  return (
    <>
      <SectionTitle title={kind === 'video' ? 'Videos' : 'Posters'} description="Review, approve, flag, remove and restore content. Remove hides content. Administrators can permanently delete a post and its unused uploaded files." />
      <FilterBar>
        <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search caption, @username or ID" />
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={['pending_review', 'published', 'flagged', 'removed', 'deleted'].map((s) => ({ value: s, label: s.replace('_', ' ') }))} />
        <FilterSelect label="Category" value={category} onChange={(v) => { setCategory(v); setOffset(0); }} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
      </FilterBar>
      <DataTable
        caption={kind === 'video' ? 'Videos' : 'Posters'}
        rows={list.data}
        loading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        columns={columns}
        rowKey={(p) => p.id}
        empty={{ icon: kind === 'video' ? Clapperboard : ImageIcon, title: `No ${kind}s match`, description: 'Adjust the filters to see more.' }}
        actions={(p) => (
          <span className="inline-flex flex-wrap gap-1.5">
            <a href={`/post/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold hover:bg-surface-2"><ExternalLink aria-hidden size={14} />View</a>
            {p.series_id&&<Button size="sm" variant="outline" leading={<Heart size={13}/>} onClick={()=>setSeriesId(p.series_id!)}>Interest</Button>}
            {isAdmin&&<Button size="sm" variant="outline" className="border-danger/30 text-danger hover:bg-danger-soft" leading={<Trash2 size={13}/>} onClick={()=>{setDeleting(p);setReason('');setConfirmation('');}}>Delete forever</Button>}
            {p.status === 'pending_review'  && <Button size="sm" onClick={() => setMod({ row: p, action: 'approve' })}>Approve</Button>}
            {(p.status === 'removed' || p.status === 'flagged') && <Button size="sm" variant="outline" onClick={() => setMod({ row: p, action: 'restore' })}>Restore</Button>}
            {p.status === 'published' && <Button size="sm" variant="outline" onClick={() => setMod({ row: p, action: 'flag' })}>Flag</Button>}
            {p.status !== 'removed' && p.status !== 'deleted' && <Button size="sm" variant="danger" onClick={() => setMod({ row: p, action: 'remove' })}>Remove</Button>}
          </span>
        )}
      />
      <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
      <Dialog open={!!seriesId} onClose={()=>setSeriesId(null)} title="Next episode interest" size="sm"><p className="mb-3 text-sm text-fg-3">{seriesInterest.data?.count??0} members asked to be notified for the next episode.</p>{seriesInterest.isPending?<p className="text-sm text-fg-3">Loading members…</p>:<ul className="space-y-2">{seriesInterest.data?.members.map(member=><li key={member.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm"><b>{member.display_name}</b> <span className="text-fg-3">@{member.username}</span></li>)}</ul>}</Dialog>
      <Dialog open={!!deleting} onClose={()=>{if(!busy)setDeleting(null);}} title={`Permanently delete this ${kind}?`} size="sm" footer={<><Button variant="ghost" disabled={busy} onClick={()=>setDeleting(null)}>Keep media</Button><Button variant="danger" leading={<Trash2 size={15}/>} loading={busy} disabled={confirmation!=='DELETE'||reason.trim().length<3} onClick={()=>void deleteMedia()}>Delete forever</Button></>}>
        <div className="mb-4 flex gap-3 rounded-xl border border-danger/25 bg-danger-soft p-3"><ShieldAlert size={20} className="shrink-0 text-danger"/><p className="text-sm leading-6">This cannot be undone. The post, replies, reactions, saves and votes will be removed. Uploaded video, cover and reply files are deleted when no other post uses them. Payment and audit records stay available.</p></div>
        <p className="mb-4 truncate text-sm text-fg-2">@{deleting?.author_username} · {deleting?.caption}</p>
        <div className="space-y-4"><Field label="Reason" required hint="Saved in the admin audit log.">{p=><Textarea {...p} rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/>}</Field><Field label="Type DELETE to confirm" required>{p=><Input {...p} value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} disabled={busy}/>}</Field></div>
      </Dialog>
      <ConfirmDialog
        open={!!mod}
        onClose={() => setMod(null)}
        title={mod ? `${mod.action[0].toUpperCase()}${mod.action.slice(1)} this ${kind}?` : ''}
        description="The creator is notified and the action is recorded in the audit log."
        tone={mod?.action === 'remove' ? 'danger' : 'primary'}
        reasonLabel="Reason"
        reasonRequired={mod?.action === 'remove' || mod?.action === 'flag'}
        loading={busy}
        onConfirm={run}
      />
    </>
  );
}
