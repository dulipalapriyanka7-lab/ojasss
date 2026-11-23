import './viral-slim.css';
import { useEffect, useState, type FormEvent } from 'react';
import { Flame, Plus, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/api/client';
import { uploadObject } from '@/api/upload';
import { useAuth } from '@/hooks/useAuth';
import { useCategories } from '@/hooks/useCategories';
import { avatarUrl, mediaUrl, sniffFile } from '@/lib/media';

type State = 'draft' | 'published' | 'paused' | 'completed';
type Challenge = {
  id?: string; title: string; description: string; category: string; starts_at: string; ends_at: string;
  banner_path: string; icon_path: string; rules: string; reward: string; hots: number; shares: number; target: number;
  audience: 'all' | 'categories' | 'users'; audience_categories: string[]; user_ids: string[]; state: State;
};
type Listed = Challenge & {id:string; status: string; participants: number; videos:number; qualified:number};
type User = {id:string; display_name:string; username:string; avatar_path?:string; categories:string[]; eligible:boolean};
type Entry = {id:string; display_name:string; username:string; category?:string; avatar_path?:string; created_at:string;
  videos?:number; qualified:number|boolean; hots:number; shares:number; status?:string; caption?:string;
  media_path?:string; moderation?:string; moderation_reason?:string; post_id?:string};
type Page<T> = {items:T[]; total:number};
const counts = [
  ['total','Total challenges'],['active','Active'],['scheduled','Scheduled'],['completed','Completed'],
  ['participants','Participants'],['videos','Challenge videos'],['qualified','Qualified videos'],
] as const;
const limit = 20;
const field = 'mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm';
const panel = 'rounded-2xl border border-line bg-surface p-4';
const button = 'rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50';
const primary = button + ' bg-gradient-to-r from-pink-700 to-purple-700 text-white';
const blank: Challenge = {title:'', description:'', category:'entertainment', starts_at:'', ends_at:'', banner_path:'',
  icon_path:'', rules:'', reward:'', hots:0, shares:0, target:1, audience:'all', audience_categories:[], user_ids:[], state:'draft'};
const displayDate = (value:string) => value ? new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}) : '—';
const localDate = (value:string) => value ? new Date(new Date(value).getTime()+19800000).toISOString().slice(0,16) : '';
const rpcName = (name:string) => 'viral_challenge_admin_'+name;
const err = (value:unknown) => value instanceof Error ? value.message : 'Request failed. Try again.';

function Paging({page,total,change}:{page:number;total:number;change:(page:number)=>void}) {
  return <div className="flex items-center gap-2 text-sm">
    <button className={button} disabled={!page} onClick={()=>change(page-1)}>Previous</button>
    <span>{page*limit+1}–{Math.min(total,(page+1)*limit)} of {total}</span>
    <button className={button} disabled={(page+1)*limit>=total} onClick={()=>change(page+1)}>Next</button>
  </div>;
}

export default function AdminViralChallenges() {
  const [page,setPage]=useState(0),[query,setQuery]=useState(''),[status,setStatus]=useState('');
  const [edit,setEdit]=useState<Challenge|null>(null),[view,setView]=useState<Listed|null>(null);
  const [failure,setFailure]=useState(''),[message,setMessage]=useState(''),[closing,setClosing]=useState('');
  const categories=useCategories();
  const label=(id:string)=>categories.find(item=>item.value===id)?.label??id;
  const overview=useQuery({queryKey:['viral-challenge-admin',query,status,page],queryFn:()=>rpc<Page<Listed>&{summary:Record<string,number>}>(rpcName('list'),{query,status,p_offset:page*limit,p_limit:limit})});
  async function close(id:string) {
    setFailure('');setClosing(id);
    try { await rpc(rpcName('close'),{id});setMessage('Challenge closed.');await overview.refetch(); }
    catch(error){setFailure(err(error));} finally{setClosing('');}
  }
  return <main className="vc-slim mx-auto max-w-6xl space-y-4 px-4 pb-10 pt-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-fuchsia-700/20 p-2 text-fuchsia-300"><Flame size={22}/></span>
        <div><h1 className="text-xl font-bold">Viral Challenges</h1><p className="text-sm text-fg-2">Manage challenges, participation, and submissions.</p></div></div>
      {!edit&&!view&&<button className={primary} onClick={()=>{setMessage('');setEdit(blank);}}><Plus className="mr-1 inline" size={16}/>Create Viral Challenge</button>}
    </header>
    {failure&&<p role="alert" className="text-red-400">{failure}</p>}
    {message&&<p role="status" className="text-emerald-400">{message}</p>}
    {edit ? <ChallengeForm key={edit.id??'new'} item={edit} onClose={()=>setEdit(null)} onSaved={()=>{setMessage('Challenge saved.');setEdit(null);void overview.refetch();}}/> :
     view ? <ChallengeEntries key={view.id} challenge={view} onClose={()=>{setView(null);void overview.refetch();}} label={label}/> :
    <>
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {counts.map(([id,name])=><div className={panel} key={id}><p className="text-xs text-fg-2">{name}</p><strong className="text-xl">{overview.data?.summary[id]??'—'}</strong></div>)}
      </section>
      <section className={panel+' space-y-3'}>
        <div className="flex flex-wrap gap-2"><input className={field+' max-w-xs'} value={query} aria-label="Search challenges" placeholder="Search challenges" onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
          <select className={field+' max-w-40'} aria-label="Filter challenge status" value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}>
            {['','draft','scheduled','active','paused','ended','completed'].map(value=><option key={value} value={value}>{value||'All statuses'}</option>)}
          </select></div>
        {overview.isPending&&<p role="status">Loading challenges…</p>}
        {overview.isError&&<p role="alert">{err(overview.error)} <button className={button} onClick={()=>void overview.refetch()}>Retry</button></p>}
        {overview.data&&!overview.data.items.length&&<p>No challenges found.</p>}
        {!!overview.data?.items.length&&<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-fg-2"><tr>{['Challenge','Category','Start (IST)','End (IST)','Participants','Videos','Status','Actions'].map(name=><th className="p-2" key={name}>{name}</th>)}</tr></thead>
          <tbody>{overview.data.items.map(item=><tr key={item.id} className="border-t border-line">
            <td className="p-2"><div className="flex items-center gap-2">{item.banner_path?<img src={mediaUrl(item.banner_path)??undefined} alt="" className="h-8 w-10 rounded object-cover"/>:<Trophy size={18}/>}<strong>{item.title}</strong></div></td>
            <td className="p-2">{label(item.category)}</td><td className="p-2">{displayDate(item.starts_at)}</td><td className="p-2">{displayDate(item.ends_at)}</td>
            <td className="p-2">{item.participants}</td><td className="p-2">{item.videos}</td><td className="p-2 capitalize">{item.status}</td>
            <td className="p-2"><div className="flex gap-1"><button className={button} onClick={()=>setEdit(item)}>Edit</button>
              <button className={button} onClick={()=>setView(item)}>View</button>
              {['scheduled','active','paused'].includes(item.status)&&<button className={button} disabled={!!closing} onClick={()=>{if(window.confirm('Close this challenge for new entries?')) void close(item.id);}}>Close</button>}</div></td>
          </tr>)}</tbody></table></div>}
        {!!overview.data?.total&&<Paging page={page} total={overview.data.total} change={setPage}/>}
      </section>
    </>}
  </main>;
}

function ChallengeForm({item,onClose,onSaved}:{item:Challenge;onClose:()=>void;onSaved:()=>void}) {
  const [form,setForm]=useState<Challenge>({...item,starts_at:localDate(item.starts_at),ends_at:localDate(item.ends_at)});
  const [failure,setFailure]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false);
  const [images,setImages]=useState<Partial<Record<'banner_path'|'icon_path',File>>>({});
  const [previewImages,setPreviewImages]=useState<Partial<Record<'banner_path'|'icon_path',string>>>({});
  const categories=useCategories().filter(category=>category.value!=='one_chance'),{me}=useAuth();
  const change=<K extends keyof Challenge>(key:K,value:Challenge[K])=>setForm(previous=>({...previous,[key]:value}));
  useEffect(()=>{
    const urls:typeof previewImages={};
    if(images.banner_path)urls.banner_path=URL.createObjectURL(images.banner_path);
    if(images.icon_path)urls.icon_path=URL.createObjectURL(images.icon_path);
    setPreviewImages(urls);
    return ()=>Object.values(urls).forEach(url=>URL.revokeObjectURL(url));
  },[images]);
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!me||busy)return;
    const submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
    const state=(submitter?.value||form.state) as State;
    setBusy(true);setFailure('');
    try {
      const payload={...form,state,starts_at:form.starts_at+':00+05:30',ends_at:form.ends_at+':00+05:30'};
      if(new Date(payload.starts_at)>=new Date(payload.ends_at))throw new Error('End time must be after start time.');
      for(const key of ['banner_path','icon_path'] as const){
        const file=images[key];if(!file)continue;
        const mime=await sniffFile(file);
        if(!mime||!['image/png','image/jpeg','image/webp'].includes(mime))throw new Error('Choose a PNG, JPEG or WebP image.');
        payload[key]=await uploadObject(file,mime,me.id).promise;
        change(key,payload[key]);
        setImages(previous=>({...previous,[key]:undefined}));
      }
      await rpc(rpcName('save'),payload);onSaved();
    }catch(error){setFailure(err(error));}finally{setBusy(false);}
  }
  const completed=item.state==='completed'||(item as Listed).status==='ended';
  const hasMembers=(item as Listed).participants>0;
  const imageFields=[['banner_path','Challenge banner'],['icon_path','Challenge icon']] as const;
  return <form className={panel+' space-y-4'} onSubmit={save}>
    <div className="flex items-center justify-between"><h2 className="font-bold">{item.id?'Edit challenge':'Create Viral Challenge'}</h2><button type="button" className={button} onClick={onClose}>Back</button></div>
    {failure&&<p className="text-red-400" role="alert">{failure}</p>}
    <fieldset className="space-y-4" disabled={busy}>
      <label className="block text-sm font-semibold">Challenge name<input className={field} required maxLength={100} value={form.title} onChange={e=>change('title',e.target.value)}/></label>
      <label className="block text-sm font-semibold">Description<textarea className={field} required maxLength={3000} rows={3} value={form.description} onChange={e=>change('description',e.target.value)}/></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Upload category<select className={field} value={form.category} disabled={hasMembers} onChange={e=>change('category',e.target.value)}>
          {categories.map(category=><option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
        {([['starts_at','Starts (India time)'],['ends_at','Ends (India time)']] as const).map(([id,label])=><label className="text-sm" key={id}>{label}
          <input className={field} required type="datetime-local" value={form[id]} onChange={e=>change(id,e.target.value)}/></label>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{imageFields.map(([id,title])=><div key={id}><label className="text-sm">{title}
        <input className={field} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImages(previous=>({...previous,[id]:e.target.files?.[0]}))}/></label>
        {(previewImages[id]||form[id])&&<button type="button" className={button+' mt-1'} onClick={()=>{change(id,'');setImages(previous=>({...previous,[id]:undefined}));}}>Remove image</button>}
        {id==='icon_path'&&!form[id]&&!images[id]&&<p className="mt-1 text-xs text-fg-2"><Trophy className="mr-1 inline" size={14}/>Default trophy icon</p>}</div>)}</div>
      <label className="block text-sm">Eligibility rules<textarea className={field} maxLength={2000} value={form.rules} onChange={e=>change('rules',e.target.value)}/></label>
      <div className="grid gap-3 sm:grid-cols-3">{([['hots','Target Hots per video'],['shares','Target Shares per video'],['target','Minimum qualified videos']] as const).map(([id,title])=><label className="text-sm" key={id}>{title}
        <input className={field} required type="number" min={id==='target'?1:0} max={1000000} value={form[id]} onChange={e=>change(id,Number(e.target.value))}/></label>)}</div>
      <label className="block text-sm">Reward details<textarea className={field} maxLength={500} value={form.reward} onChange={e=>change('reward',e.target.value)}/>
        <span className="text-xs text-fg-2">Reward details are displayed to participants. Existing approval controls apply to payments.</span></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Visibility<select className={field} value={form.audience} onChange={e=>change('audience',e.target.value as Challenge['audience'])}>
          <option value="all">All eligible users</option><option value="categories">Selected audience categories</option><option value="users">Selected users</option></select></label>
        <label className="text-sm">Status<select className={field} value={completed?'completed':form.state} onChange={e=>change('state',e.target.value as State)}>
          <option value="draft">Draft</option><option value="published">Published (scheduled or active)</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
      </div>
      {form.audience==='categories'&&<div className="flex flex-wrap gap-2">
        {categories.map(category=><label className={button} key={category.value}>
          <input className="mr-1" type="checkbox" checked={form.audience_categories.includes(category.value)} onChange={e=>change('audience_categories',e.target.checked?[...form.audience_categories,category.value]:form.audience_categories.filter(id=>id!==category.value))}/>{category.label}</label>)}</div>}
      {form.audience==='users'&&<UserPicker key={item.id??'draft'} selected={form.user_ids} setSelected={ids=>change('user_ids',ids)}/>}
      {preview&&<div className={panel+' space-y-2'}>
        <div className="flex items-center gap-2">{(previewImages.icon_path||form.icon_path)?<img className="h-8 w-8 rounded object-cover" src={previewImages.icon_path??mediaUrl(form.icon_path)??undefined} alt=""/>:<Trophy size={20}/>}
          <strong>{form.title||'Challenge name'}</strong></div>
        {(previewImages.banner_path||form.banner_path)&&<img className="max-h-44 rounded-xl object-cover" src={previewImages.banner_path??mediaUrl(form.banner_path)??undefined} alt="Challenge banner"/>}<p className="whitespace-pre-wrap text-sm">{form.description}</p>
      </div>}
      <div className="flex flex-wrap gap-2">
        {!completed&&!hasMembers&&<button className={button} type="submit" value="draft">Save Draft</button>}
        <button className={button} type="button" onClick={()=>setPreview(!preview)}>{preview?'Hide preview':'Preview'}</button>
        {!completed&&<button className={primary} type="submit" value="published">{busy?'Saving…':'Publish'}</button>}
        {item.id&&<button className={button} type="submit" value={completed?'completed':form.state}>Save changes</button>}
      </div>
    </fieldset>
  </form>;
}

function UserPicker({selected,setSelected}:{selected:string[];setSelected:(ids:string[])=>void}) {
  const [query,setQuery]=useState(''),[page,setPage]=useState(0);
  const categories=useCategories();
  const people=useQuery({queryKey:['viral-challenge-users',query,page,selected],queryFn:()=>rpc<Page<User>&{selected:User[]}>(rpcName('users'),{query,p_offset:page*limit,p_limit:limit,selected})});
  return <section className={panel+' space-y-2'}>
    <label className="text-sm font-semibold">Find users<input className={field} value={query} placeholder="Name or username" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
    <p className="text-xs text-fg-2">{selected.length} selected</p>
    <div className="flex flex-wrap gap-1">{people.data?.selected.map(user=><button type="button" className={button} key={user.id} onClick={()=>setSelected(selected.filter(id=>id!==user.id))}>@{user.username} ×</button>)}</div>
    {people.isPending&&<p>Loading users…</p>}{people.isError&&<p role="alert">{err(people.error)}</p>}
    {people.data&&!people.data.items.length&&<p>No matching users.</p>}
    <div className="grid gap-1 sm:grid-cols-2">{people.data?.items.map(user=><label key={user.id} className="flex items-center gap-2 rounded-xl border border-line p-2 text-sm">
      <input type="checkbox" checked={selected.includes(user.id)} disabled={(!user.eligible||selected.length>=500)&&!selected.includes(user.id)} onChange={e=>setSelected(e.target.checked?[...selected,user.id]:selected.filter(id=>id!==user.id))}/>
      {user.avatar_path?<img className="h-7 w-7 rounded-full object-cover" src={avatarUrl(user.avatar_path)??undefined} alt=""/>:<span className="grid h-7 w-7 place-items-center rounded-full bg-purple-700/50">{user.display_name.slice(0,1)}</span>}
      <span className="min-w-0"><strong className="block truncate">{user.display_name} <span className="text-xs font-normal text-fg-2">@{user.username}</span></strong>
        <span className="block truncate text-xs text-fg-2">{user.eligible?'Eligible':'Restricted'} · {user.categories.map(id=>categories.find(c=>c.value===id)?.label??id).join(', ')||'No selected categories'}</span></span>
    </label>)}</div>
    {!!people.data?.total&&<Paging page={page} total={people.data.total} change={setPage}/>}
  </section>;
}

function ChallengeEntries({challenge,onClose,label}:{challenge:Listed;onClose:()=>void;label:(id:string)=>string}) {
  const [tab,setTab]=useState<'participants'|'submissions'>('participants');
  const [page,setPage]=useState(0),[query,setQuery]=useState(''),[filter,setFilter]=useState(''),[failure,setFailure]=useState(''),[busy,setBusy]=useState(false);
  const [review,setReview]=useState<Entry|null>(null),[reason,setReason]=useState('');
  const result=useQuery({queryKey:['viral-challenge-detail-admin',challenge.id,tab,page,query,filter],
    queryFn:()=>rpc<Page<Entry>>(rpcName(tab),{id:challenge.id,query,filter,p_offset:page*limit,p_limit:limit})});
  async function moderate(entry:Entry,moderation:'included'|'excluded') {
    setFailure('');setBusy(true);
    try{await rpc(rpcName('review'),{id:challenge.id,submission_id:entry.id,moderation,reason:moderation==='excluded'?reason:''});setReview(null);await result.refetch();}
    catch(error){setFailure(err(error));}finally{setBusy(false);}
  }
  return <section className={panel+' space-y-3'}>
    <div className="flex justify-between gap-2"><div><h2 className="font-bold">{challenge.title}</h2><p className="text-sm text-fg-2">{label(challenge.category)} · {challenge.status}</p></div><button className={button} onClick={onClose}>Back</button></div>
    <div className="flex flex-wrap gap-2">{(['participants','submissions'] as const).map(value=><button key={value} aria-pressed={tab===value} className={tab===value?primary:button} onClick={()=>{setTab(value);setPage(0);setFilter('');setReview(null);}}>{value==='participants'?'Participants':'Video submissions'}</button>)}</div>
    <div className="flex flex-wrap gap-2"><input aria-label="Search entries" className={field+' max-w-xs'} placeholder="Name, username, or caption" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
      <select className={field+' max-w-44'} aria-label="Filter entries" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}>
        <option value="">All statuses</option>{(tab==='participants'?['joined','pending','completed']:['qualified','pending','excluded']).map(value=><option key={value} value={value}>{value}</option>)}</select></div>
    {failure&&<p className="text-red-400" role="alert">{failure}</p>}
    {result.isPending&&<p>Loading…</p>}{result.isError&&<p role="alert">{err(result.error)}</p>}
    {result.data&&!result.data.items.length&&<p>No {tab} found.</p>}
    {result.data?.items.map(entry=><article className={panel+' flex flex-wrap items-start gap-3'} key={entry.id}>
      {tab==='participants'&&entry.avatar_path&&<img src={avatarUrl(entry.avatar_path)??undefined} alt="" className="h-9 w-9 rounded-full object-cover"/>}
      <div className="min-w-0 flex-1"><strong>{entry.display_name}</strong> <span className="text-sm text-fg-2">@{entry.username}</span>
        <p className="text-sm text-fg-2">{entry.category?label(entry.category)+' · ':''}{displayDate(entry.created_at)} IST</p>
        <p className="text-sm">{entry.hots} Hots · {entry.shares} Shares · {tab==='participants'?entry.videos+' submitted · '+entry.qualified+' qualified · '+entry.status:entry.moderation==='excluded'?'Excluded':entry.qualified?'Qualified':'Pending'}</p>
        {entry.caption&&<p className="mt-1 text-sm">{entry.caption}</p>}{entry.moderation_reason&&<p className="text-sm text-fg-2">{entry.moderation_reason}</p>}
        {review?.id===entry.id&&<div className="flex flex-wrap items-end gap-2"><label className="block text-sm">Exclusion reason<input className={field} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>
          <button className={button} disabled={!reason.trim()||busy} onClick={()=>void moderate(entry,'excluded')}>Confirm exclusion</button><button className={button} onClick={()=>setReview(null)}>Cancel</button></div>}
      </div>
      {tab==='submissions'&&<div className="space-y-1">{entry.media_path&&<video className="h-28 w-36 rounded-lg bg-black" src={mediaUrl(entry.media_path)??undefined} controls playsInline preload="none"/>}
        {entry.moderation==='excluded'?<button className={button} disabled={busy} onClick={()=>void moderate(entry,'included')}>Restore</button>:<button className={button} onClick={()=>{setReview(entry);setReason('');}}>Exclude</button>}</div>}
    </article>)}
    {!!result.data?.total&&<Paging page={page} total={result.data.total} change={setPage}/>}
  </section>;
}
