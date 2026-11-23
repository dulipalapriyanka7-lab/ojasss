import {useState,type FormEvent} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {ClipboardCheck,Plus,Trophy} from 'lucide-react';
import {challengeApi,challengeStatus,type ChallengeAssignment,type ChallengeBanner,type ChallengeTask,type ChallengeUser} from '@/api/challengeTasks';
import {Dialog} from '@/components/ui/Overlay';
import {Avatar} from '@/components/ui/Misc';
import {useCategories} from '@/hooks/useCategories';
import {TaskActions,TaskDeleteConfirm,TaskProgressMeter} from '@/components/admin/TaskManagement';

const button='min-h-10 rounded-lg border border-line bg-surface px-3 text-sm font-semibold disabled:opacity-45';
const primary='min-h-10 rounded-lg bg-brand-gradient px-4 text-sm font-semibold text-white disabled:opacity-45';
const input='mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm';
const panel='rounded-xl border border-line bg-surface/35 p-3 sm:p-4';
const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const blankTask=(category:string):ChallengeTask=>({title:'',description:'',category,type:'original',target:1,start:'',end:'',repeat:'once',days:[],status:'draft',audience:'category',users:[],manual_users:[],automatic:true,include_new:false,manual_review:false});
const blankBanner=(category:string):ChallengeBanner=>({name:'',category,start:'',end:'',starts_at:'',ends_at:'',schedule:'',min_prize:0,max_prize:0,public:true,override:'schedule',status:'upcoming'});
const ist=(value:string)=>new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
function Pager({offset,total,size,change}:{offset:number;total:number;size:number;change:(offset:number)=>void}) {
  return <div className="flex items-center justify-between gap-2 text-xs">
    <button className={button} type="button" disabled={!offset} onClick={()=>change(Math.max(0,offset-size))}>Previous</button>
    <span>{total?offset+1:0}–{Math.min(total,offset+size)} of {total}</span>
    <button className={button} type="button" disabled={offset+size>=total} onClick={()=>change(offset+size)}>Next</button>
  </div>;
}
function CategorySelect({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const categories=useCategories();
  return <label>Category<select required className={input} value={value} onChange={e=>onChange(e.target.value)}>
    <option value="" disabled>Choose a category</option>{categories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
  </select></label>;
}

function UserPicker({draft,update}:{draft:ChallengeTask;update:(partial:Partial<ChallengeTask>)=>void}) {
  const [extra,setExtra]=useState(false);
  const [search,setSearch]=useState('');
  const [offset,setOffset]=useState(0);
  const [selectedOnly,setSelectedOnly]=useState(false);
  const ids=draft.manual_users;
  const onlyCategory=!extra;
  const q=useQuery({queryKey:['challenge-users',draft.id,draft.category,search,offset,onlyCategory,selectedOnly,ids],queryFn:()=>challengeApi.users({id:draft.id,category:draft.category,search:selectedOnly?'':search,only_category:onlyCategory,selected_only:selectedOnly,selected_ids:ids,p_offset:offset,p_limit:20}),enabled:!!draft.category});
  const list=q.data?.users??[];
  function toggle(user:ChallengeUser) {
    update({manual_users:ids.includes(user.id)?ids.filter(id=>id!==user.id):[...ids,user.id]});
  }
  return <fieldset className={`${panel} space-y-2`}>
    <legend className="px-1 font-semibold">Assignment audience</legend>
    <label>Visibility<select className={input} value={draft.audience==='selected'?'assigned':'eligible'} onChange={e=>update({audience:e.target.value==='assigned'?'selected':'category'})}><option value="assigned">Assigned users only</option><option value="eligible">All eligible category users</option></select></label>
    <label>Selection mode<select className={input} value={draft.audience} onChange={e=>{update({audience:e.target.value as ChallengeTask['audience']});setExtra(false);setOffset(0);setSelectedOnly(false);}}>
      <option value="category">All category users</option><option value="selected">Selected users</option><option value="combined">Category + additional users</option>
    </select></label>
    <p className="text-xs text-fg-2">{q.data?.eligible_count??'—'} eligible category users · {ids.length} manually selected{q.data&&<span> · {draft.audience==='selected'?ids.length:q.data.eligible_count+(draft.audience==='combined'?q.data.additional_count:0)} total selected</span>}</p>
    {draft.audience!=='category'&&<div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className={button} type="button" aria-pressed={extra} onClick={()=>{setExtra(!extra);setSelectedOnly(false);setOffset(0);}}>{extra?'Category users':'+ Add More Users'}</button>
        <button className={button} type="button" aria-pressed={selectedOnly} onClick={()=>{setSelectedOnly(!selectedOnly);setOffset(0);}}>{selectedOnly?'Browse users':'Show selected'}</button>
      </div>
      {!selectedOnly&&<input className={input} placeholder="Search name or username" aria-label="Search users" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/>}
      {q.isPending&&<p role="status">Loading users…</p>}{q.isError&&<p role="alert">{q.error.message}</p>}
      <div className="max-h-60 divide-y divide-line overflow-y-auto">
        {list.map(user=><label className="flex min-h-11 items-center gap-2 py-1 text-sm" key={user.id}>
          <input type="checkbox" checked={ids.includes(user.id)||draft.audience==='combined'&&user.eligible} disabled={draft.audience==='combined'&&user.eligible} onChange={()=>toggle(user)}/>
          <Avatar size={26} name={user.display_name||user.username} path={user.avatar_path??null}/>
          <span className="min-w-0 flex-1 truncate">{user.display_name||user.username} <small className="text-fg-3">@{user.username}</small></span>
          <small className="shrink-0 text-fg-2">{user.eligible?'Eligible':user.selected?'Assigned':'Additional'}</small>
        </label>)}
        {!q.isPending&&!list.length&&<p className="py-2 text-sm text-fg-3">No matching users.</p>}
      </div>
      <Pager offset={offset} total={q.data?.total??0} size={20} change={setOffset}/>
    </div>}
    {draft.audience!=='selected'&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.include_new} onChange={e=>update({include_new:e.target.checked})}/> Include newly eligible users automatically</label>}
  </fieldset>;
}

function TaskEditor({initial,banners,onDone}:{initial:ChallengeTask;banners:ChallengeBanner[];onDone:()=>void}) {
  const [draft,setDraft]=useState(initial);
  const [confirm,setConfirm]=useState<ChallengeTask['status']|null>(null);
  const update=(p:Partial<ChallengeTask>)=>setDraft(value=>({...value,...p}));
  const save=useMutation({mutationFn:(status:ChallengeTask['status'])=>challengeApi.save({...draft,status}),onSuccess:onDone});
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const target=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status=(target?.value||draft.status) as ChallengeTask['status'];
    if(initial.id&&initial.status!=='draft')setConfirm(status);else save.mutate(status);
  }
  return <form onSubmit={submit} className="space-y-3 text-sm">
    <label className="block">Task name<input required maxLength={100} className={input} value={draft.title} onChange={e=>update({title:e.target.value})}/></label>
    <label className="block">Description<textarea rows={2} maxLength={500} className={input} value={draft.description} onChange={e=>update({description:e.target.value})}/></label>
    <div className="grid gap-2 sm:grid-cols-2">
      <CategorySelect value={draft.category} onChange={category=>update({category})}/>
      <label>Task type<select className={input} value={draft.type} onChange={e=>update({type:e.target.value as ChallengeTask['type']})}><option value="upload">Upload video</option><option value="original">Create original content</option><option value="engagement">Reach engagement target (views)</option></select></label>
      <label>Target<input required type="number" min={1} max={10000} className={input} value={draft.target} onChange={e=>update({target:+e.target.value})}/></label>
      <label>Weekly challenge<select className={input} value={draft.banner_id??''} onChange={e=>update({banner_id:e.target.value})}><option value="">Standalone task</option>{banners.map(item=><option key={item.id} value={item.id}>{item.name} · {item.start.slice(0,10)}</option>)}</select></label>
      <label>Repeat<select className={input} value={draft.repeat} onChange={e=>update({repeat:e.target.value as ChallengeTask['repeat']})}><option value="once">One time</option><option value="daily">Daily</option><option value="days">Selected days</option><option value="weekly">Weekly</option></select></label>
      <label>Start date and time (IST)<input required type="datetime-local" className={input} value={draft.start} onChange={e=>update({start:e.target.value})}/></label>
      <label>End date and time (IST)<input required type="datetime-local" className={input} value={draft.end} onChange={e=>update({end:e.target.value})}/></label>
      {draft.repeat==='days'&&<fieldset className="flex flex-wrap gap-2 sm:col-span-2"><legend>Repeat on</legend>{weekdays.map((day,i)=><label key={day}><input type="checkbox" checked={draft.days.includes(i+1)} onChange={e=>update({days:e.target.checked?[...draft.days,i+1]:draft.days.filter(d=>d!==i+1)})}/> {day}</label>)}</fieldset>}
    </div>
    {draft.repeat!=='once'&&<label className="flex gap-2"><input type="checkbox" checked={draft.automatic} onChange={e=>update({automatic:e.target.checked})}/> Assign each occurrence automatically</label>}
    <label className="flex gap-2"><input type="checkbox" checked={draft.manual_review} onChange={e=>update({manual_review:e.target.checked})}/> Require administrator review</label>
    <UserPicker key={draft.category} draft={draft} update={update}/>
    {save.isError&&<p role="alert" className="text-red-300">{save.error.message}</p>}
    {confirm&&<div className={panel} role="status"><p>Apply these changes to the task? Existing submissions and progress are kept.</p><div className="mt-2 flex gap-2"><button type="button" className={primary} disabled={save.isPending} onClick={()=>save.mutate(confirm)}>Confirm changes</button><button type="button" className={button} onClick={()=>setConfirm(null)}>Cancel</button></div></div>}
    {!confirm&&<div className="flex flex-wrap gap-2">
      <button className={button} type="submit" value={draft.status} disabled={save.isPending}>Save Task</button>
      {draft.status!=='archived'&&<button className={primary} type="submit" value="active" disabled={save.isPending}>{draft.status==='paused'?'Resume':'Publish & Assign'}</button>}
      {draft.status==='active'&&<button className={button} type="submit" value="paused" disabled={save.isPending}>Pause</button>}
      {draft.id&&draft.status!=='archived'&&<button className={button} type="submit" value="archived" disabled={save.isPending}>Archive</button>}
    </div>}
  </form>;
}

function BannerEditor({initial,onDone}:{initial:ChallengeBanner;onDone:()=>void}) {
  const [draft,setDraft]=useState(initial);
  const update=(p:Partial<ChallengeBanner>)=>setDraft(value=>({...value,...p}));
  const save=useMutation({mutationFn:()=>challengeApi.banner(draft),onSuccess:onDone});
  return <form className="grid gap-3 text-sm sm:grid-cols-2" onSubmit={e=>{e.preventDefault();save.mutate();}}>
    <label>Challenge name<input required maxLength={72} className={input} value={draft.name} onChange={e=>update({name:e.target.value})}/></label>
    <CategorySelect value={draft.category} onChange={category=>update({category})}/>
    <label>Starts (IST)<input required className={input} type="datetime-local" value={draft.start} onChange={e=>update({start:e.target.value})}/></label>
    <label>Ends (IST)<input required className={input} type="datetime-local" value={draft.end} onChange={e=>update({end:e.target.value})}/></label>
    <label>Minimum prize (₹)<input required className={input} type="number" min={0} value={draft.min_prize} onChange={e=>update({min_prize:+e.target.value})}/></label>
    <label>Maximum prize (₹)<input required className={input} type="number" min={draft.min_prize} value={draft.max_prize} onChange={e=>update({max_prize:+e.target.value})}/></label>
    <label className="sm:col-span-2">Schedule description<input maxLength={96} className={input} value={draft.schedule} onChange={e=>update({schedule:e.target.value})}/></label>
    <label>Status<select className={input} value={draft.override} onChange={e=>update({override:e.target.value as ChallengeBanner['override']})}><option value="schedule">Follow schedule</option><option value="closed">Closed</option></select></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.public} onChange={e=>update({public:e.target.checked})}/> Display on leaderboard</label>
    <p className="text-xs text-fg-2 sm:col-span-2">Prize amounts are informational estimates.</p>
    {save.isError&&<p className="text-red-300 sm:col-span-2" role="alert">{save.error.message}</p>}
    <button className={primary} disabled={save.isPending}>Save challenge</button>
  </form>;
}

export function TaskMonitor({task,userId}:{task?:ChallengeTask;userId?:string}) {
  const [offset,setOffset]=useState(0);
  const [deleted,setDeleted]=useState(false);
  const [target,setTarget]=useState(1);
  const [action,setAction]=useState<{row:ChallengeAssignment;name:string}|null>(null);
  const [reason,setReason]=useState('');
  const [deadline,setDeadline]=useState('');
  const qc=useQueryClient();
  const q=useQuery({queryKey:['challenge-assignment',task?.id,userId,offset,deleted],queryFn:()=>challengeApi.assignments(task?.id,offset,userId,deleted)});
  const save=useMutation({mutationFn:()=>challengeApi.review(action!.row.task_id,action!.row.id,action!.name,reason,deadline,target),onSuccess:()=>{
    setAction(null);for(const key of ['challenge-assignment','challenge-admin','leaderboard-challenge'])void qc.invalidateQueries({queryKey:[key]});
  }});
  function choose(row:ChallengeAssignment,name:string){save.reset();setReason('');setTarget(row.target);setDeadline(name==='edit'?new Date(Date.parse(row.deadline)+330*60000).toISOString().slice(0,16):'');setAction({row,name});}
  return <section className="space-y-2 text-sm">
    {task&&<p className="text-fg-2">{task.category} · {task.start.replace('T',' ')} to {task.end.replace('T',' ')} IST</p>}
    <div className="task-actions"><button type="button" aria-pressed={deleted} onClick={()=>{setDeleted(!deleted);setOffset(0);setAction(null);}}>{deleted?'View active assignments':'Deleted assignments'}</button></div>
    <div className="flex flex-wrap gap-2">{Object.entries(q.data?.counts??{}).map(([key,count])=><span key={key} className={panel}>{challengeStatus[key as keyof typeof challengeStatus]??key}: {count}</span>)}</div>
    {q.isPending&&<p role="status">Loading assignments…</p>}{q.isError&&<p role="alert">{q.error.message}</p>}
    {q.data?.assignments.map(row=><article key={row.id} className={panel}>
      <div className="flex flex-wrap justify-between gap-2"><strong>{userId?row.title:'@'+row.username}</strong><span>{row.removed?'Deleted':challengeStatus[row.status]}</span></div>
      <TaskProgressMeter title={row.title} progress={row.status==='completed'?row.target:row.progress} target={row.target}/>
      <p className="text-xs text-fg-2">Assigned {ist(row.created_at)} · Due {ist(row.deadline)}</p>
      {row.review_reason&&<p>{row.review_reason}</p>}
      {!!row.submissions?.length&&<details className="my-2"><summary className="cursor-pointer">View submissions ({row.submissions.length})</summary><ul className="list-inside list-disc">{row.submissions.map(post=><li key={post.id}><Link className="underline" to={`/post/${post.id}`}>{post.title||'Video'}</Link> · {post.status}</li>)}</ul></details>}
      <div className="mt-2 flex flex-wrap gap-2">
        {!row.removed&&row.status==='under_review'&&<><button className={button} onClick={()=>choose(row,'approve')}>Approve</button><button className={button} onClick={()=>choose(row,'reject')}>Reject</button></>}
        {row.removed&&<button className={button} onClick={()=>choose(row,'restore')}>Restore</button>}
      </div>
      <TaskActions edit={!row.removed?()=>choose(row,'edit'):undefined} remove={!row.removed?()=>choose(row,'remove'):undefined} purge={()=>choose(row,'purge')} busy={save.isPending}/>
      {action?.row.id===row.id&&(['remove','purge'].includes(action.name)
        ? <TaskDeleteConfirm permanent={action.name==='purge'} scope="assignment" busy={save.isPending} error={save.error?.message} cancel={()=>setAction(null)} confirm={()=>save.mutate()}/>
        : <form className="mt-2 space-y-2" onSubmit={e=>{e.preventDefault();save.mutate();}}>
        <p className="capitalize">Confirm {action.name} for @{row.username}</p>
        {action.name==='reject'&&<label>Rejection reason<input className={input} required maxLength={400} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
        {action.name==='edit'&&<div className="grid gap-2 sm:grid-cols-2"><label>Target<input className={input} type="number" required min={1} max={10000} value={target} onChange={e=>setTarget(+e.target.value)}/></label><label>Deadline (IST)<input className={input} type="datetime-local" required value={deadline} onChange={e=>setDeadline(e.target.value)}/></label></div>}
        {save.isError&&<p role="alert">{save.error.message}</p>}
        <button className={primary} disabled={save.isPending}>Confirm</button> <button type="button" className={button} onClick={()=>setAction(null)}>Cancel</button>
      </form>)}
    </article>)}
    {q.data?.total===0&&<p className="text-fg-3">{deleted?'No deleted assignments.':userId?'No challenge assignments.':'Assignments appear when the schedule opens.'}</p>}
    <Pager offset={offset} total={q.data?.total??0} size={20} change={setOffset}/>
  </section>;
}

export default function AssignTasksPage() {
  const [offset,setOffset]=useState(0);
  const [task,setTask]=useState<ChallengeTask|null>(null);
  const [banner,setBanner]=useState<ChallengeBanner|null>(null);
  const [monitor,setMonitor]=useState<ChallengeTask|null>(null);
  const [success,setSuccess]=useState('');
  const [deleted,setDeleted]=useState(false);
  const [pendingDelete,setPendingDelete]=useState<{id:string;permanent:boolean}|null>(null);
  const categories=useCategories();
  const defaultCategory=categories.find(c=>c.value==='entertainment')?.value??categories[0]?.value??'';
  const qc=useQueryClient();
  const q=useQuery({queryKey:['challenge-admin',offset,deleted],queryFn:()=>challengeApi.list(offset,deleted),refetchInterval:30000});
  const refreshed=(message:string)=>{setTask(null);setBanner(null);setSuccess(message);void qc.invalidateQueries({queryKey:['challenge-admin']});void qc.invalidateQueries({queryKey:['leaderboard-challenge']});};
  const remove=useMutation({mutationFn:()=>challengeApi.remove(pendingDelete!.id,pendingDelete!.permanent),onSuccess:()=>{
    setPendingDelete(null);refreshed('Task deleted.');void qc.invalidateQueries({queryKey:['challenge-assignment']});
  }});
  return <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck/> Assign Tasks</h1><p className="text-sm text-fg-2">Create and manage daily tasks for Entertainment creators.</p></div><button className={primary} onClick={()=>setTask(blankTask(defaultCategory))}><Plus className="inline" size={16}/> Create Task</button></header>
    {success&&<p className="text-sm text-emerald-300" role="status">{success}</p>}
    {q.isPending&&<p role="status">Loading challenge tasks…</p>}
    {q.isError&&<p role="alert">{q.error.message} <button className={button} onClick={()=>void q.refetch()}>Retry</button></p>}
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Task summary">
      {([['total','Total Tasks'],['assigned','Assigned Users'],['pending','Pending'],['completed','Completed'],['expired','Expired']] as const).map(([key,label])=><div className={panel} key={key}><span className="text-xs text-fg-2">{label}</span><strong className="block text-xl">{q.data?.counts[key]??'—'}</strong></div>)}
    </section>
    <section className={`${panel} space-y-2`}><div className="flex items-center justify-between gap-2"><h2 className="font-bold">{deleted?'Deleted tasks':'Task definitions'}</h2><div className="task-actions"><button type="button" aria-pressed={deleted} onClick={()=>{setDeleted(!deleted);setOffset(0);setPendingDelete(null);}}>{deleted?'View active tasks':'Deleted tasks'}</button></div></div>
      {q.data?.tasks.map(item=><article key={item.id} className="space-y-2 border-t border-line py-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{item.title}</strong><p className="text-xs capitalize text-fg-2">{deleted?'Deleted':item.status} · {item.repeat} · {item.target} target</p></div>
        {!deleted&&<div className="task-actions"><button type="button" onClick={()=>setMonitor(item)}>Details</button><button type="button" onClick={()=>setTask({...item,id:undefined,title:item.title+' (copy)',status:'draft'})}>Duplicate</button></div>}</div>
        {pendingDelete&&pendingDelete.id===item.id
          ? <TaskDeleteConfirm permanent={pendingDelete.permanent} scope="task" allAssignments busy={remove.isPending} error={remove.error?.message} cancel={()=>setPendingDelete(null)} confirm={()=>remove.mutate()}/>
          : <TaskActions edit={!deleted?()=>setTask(item):undefined} remove={!deleted?()=>{remove.reset();setPendingDelete({id:item.id!,permanent:false});}:undefined} purge={()=>{remove.reset();setPendingDelete({id:item.id!,permanent:true});}} busy={remove.isPending}/>}
      </article>)}
      {q.data?.tasks.length===0&&<p className="text-sm text-fg-3">No tasks yet.</p>}
      {!!q.data&&(offset>0||q.data.counts.total>20)&&<Pager offset={offset} total={q.data.counts.total} size={20} change={setOffset}/>}
    </section>
    <section className={`${panel} space-y-2`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-bold"><Trophy size={17}/> Weekly Challenge Settings</h2><button className={button} onClick={()=>setBanner(blankBanner(defaultCategory))}>+ Configure Challenge</button></div>
      {q.data?.banners.map(item=><article className="flex items-center justify-between gap-2 border-t border-line py-2" key={item.id}><div><strong>{item.name}</strong><p className="text-xs text-fg-2">{ist(item.starts_at)} – {ist(item.ends_at)} IST</p></div><button className={button} onClick={()=>setBanner(item)}>Edit</button></article>)}
      {q.data?.banners.length===0&&<p className="text-sm text-fg-3">No challenge banner has been configured.</p>}
    </section>
    <Dialog open={!!task} onClose={()=>setTask(null)} title={task?.id?'Edit task':'Create task'}>{task&&<TaskEditor initial={task} banners={q.data?.banners??[]} onDone={()=>refreshed('Task saved.')}/>}</Dialog>
    <Dialog open={!!banner} onClose={()=>setBanner(null)} title="Weekly Challenge Settings">{banner&&<BannerEditor initial={banner} onDone={()=>refreshed('Challenge settings saved.')}/>}</Dialog>
    <Dialog open={!!monitor} onClose={()=>setMonitor(null)} title={monitor?.title||'Task details'}>{monitor&&<TaskMonitor key={monitor.id} task={monitor}/>}</Dialog>
  </div>;
}

