import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rpc } from '@/api/client';
import { CheckCircle2, ChevronRight, ClipboardList, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import {TaskProfilePicker} from '@/components/admin/TaskProfilePicker';
import {TaskActions,TaskDeleteConfirm,TaskProgressMeter} from '@/components/admin/TaskManagement';
import './profile-task-benefits.css';

type Slot = { day: number; start: string; end: string };
type Schedule = { open: boolean; slots: Slot[] | null; task_eligible?: boolean };
type Task = {
  id?: string; username: string; title: string; kind: string; category: string;
  target: number; points: number; reward: string; deadline: string; deadline_utc?: string;
  progress?: number; archived?: boolean; completed_at?: string;
  challenge_name?: string; challenge_week_id?: string | null;
  reward_paise?:number;content_origin?:string;criteria?:string;reward_credited_at?:string;
  invite_target?:number;video_target?:number;network_target?:number;invite_progress?:number;video_progress?:number;network_progress?:number;
  video_checks?:Array<{id:string;caption:string;category:string;created_at:string;counted:boolean;reason:string|null}>;
};
const blank: Task = { username:'', title:'', kind:'referral', category:'', target:2, points:0, reward:'', deadline:'' };
const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const field = 'w-full rounded-lg border border-line bg-surface p-2';
const card = 'space-y-3 rounded-2xl border border-line p-4';
const button = 'rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50';
const taskCategories:Record<string,string>={entertainment:'Entertainment',education:'Educational',world_education:'World Education',horror_stories:'Horror Stories',music_dance:'Music & Dance',business_promotion:'Business Promotion',public_complaint:'Public Complaint',news:'News Reporter',part_time_jobs:'Part Time',full_time_jobs:'Full Time',technology:'Technology',gaming:'Gaming',lifestyle:'Lifestyle'};

/** Compact, live task progress for the account owner's Profile page. */
export function ProfileTaskProgress() {
  const tasks = useQuery({
    queryKey: ['member-tasks', 'profile-summary'],
    queryFn: () => rpc<Task[]>('my_member_tasks', { p_limit: 30 }),
    refetchOnMount: 'always',
    refetchInterval: 15000,
  });
  const active = (tasks.data ?? []).filter((task) => !task.archived).slice(0, 3);

  if (tasks.isPending || tasks.isError || active.length === 0) return null;
  const complete = active.filter((task) => !!task.completed_at).length;

  return <section aria-label="My task benefits" className="profile-task-benefits mb-4">
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="profile-task-emblem grid size-7 shrink-0 place-items-center rounded-lg text-fuchsia-300"><ClipboardList size={15} aria-hidden /></span>
        <div className="min-w-0"><h2 className="text-[13px] font-semibold">My tasks & benefits</h2><p className="text-xs text-fg-3">{complete ? `${complete} reward${complete === 1 ? '' : 's'} unlocked` : 'Complete tasks. Unlock your bonus.'}</p></div>
      </div>
      <Link to="/earnings#tasks" className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-soft" aria-label="View all assigned tasks">View all <ChevronRight size={14} aria-hidden /></Link>
    </div>
    <div className="profile-task-list">
      {active.map((task) => {
        const done = !!task.completed_at;
        return <article key={task.id} className="profile-task-row">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-xs font-semibold" title={task.title}>{task.title}</h3>
            {done&&<span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success"><CheckCircle2 size={12} aria-hidden />Done</span>}
          </div>
          <TaskProgressMeter title={task.title} progress={done?task.target:task.progress??0} target={task.target}/>
          <span className="inline-flex items-center gap-1 text-xs text-fg-2"><Sparkles size={11} className="text-brand" aria-hidden />₹{((task.reward_paise??0)/100).toFixed(2)} {task.reward_credited_at?'credited':'reward'}</span>
          {task.reward && <p className="mt-1 text-xs leading-relaxed text-fg-3">{task.reward}</p>}
        </article>;
      })}
    </div>
  </section>;
}

export function useWithdrawalSchedule() {
  return useQuery({queryKey:['withdrawal-schedule'],queryFn:()=>rpc<Schedule>('withdrawal_schedule'),refetchInterval:15_000});
}
export function WithdrawalHours() {
  const query = useWithdrawalSchedule();
  if (query.isError) return <button onClick={()=>void query.refetch()}>Unable to load hours. Retry</button>;
  if (!query.data) return <p role="status">Checking withdrawal hours…</p>;
  const {slots,open,task_eligible} = query.data;
  return <section className={card}>
    <h2 className="font-semibold">Withdrawals are {open?'open':'closed'}</h2>
    {task_eligible===false&&<p className="rounded-lg bg-warning-soft p-2 text-sm text-warning">Withdrawals unlock when an administrator assigns you an active task or approves a personal bonus for you.</p>}
    {slots===null ? <p>Requests are accepted anytime.</p> : !slots.length ? <p>No hours scheduled.</p> :
      <ul>{slots.map((slot,i)=><li key={i}>{days[slot.day-1]} · {slot.start}–{slot.end} IST</li>)}</ul>}
  </section>;
}
function ScheduleEditor({initial}:{initial:Slot[]|null}) {
  const [slots,setSlots] = useState(initial);
  const qc = useQueryClient();
  const save = useMutation({mutationFn:()=>rpc<Schedule>('save_withdrawal_schedule',{slots}),
    onSuccess:data=>qc.setQueryData(['withdrawal-schedule'],data)});
  const update = (index:number,patch:Partial<Slot>)=>setSlots(slots?.map((slot,i)=>i===index?{...slot,...patch}:slot)??[]);
  return <form className={card} onSubmit={e=>{e.preventDefault();save.mutate();}}>
    <h2 className="text-xl font-bold">Withdrawal hours</h2>
    <label className="flex gap-2"><input type="checkbox" checked={slots!==null} onChange={e=>setSlots(e.target.checked?[]:null)}/>Restrict withdrawals to selected hours (IST)</label>
    {slots?.map((slot,i)=><div className="grid gap-2 sm:grid-cols-4" key={i}>
      <label>Day<select className={field} value={slot.day} onChange={e=>update(i,{day:Number(e.target.value)})}>{days.map((day,j)=><option key={day} value={j+1}>{day}</option>)}</select></label>
      <label>Opens<input className={field} required type="time" value={slot.start} onChange={e=>update(i,{start:e.target.value})}/></label>
      <label>Closes<input className={field} required type="time" value={slot.end} onChange={e=>update(i,{end:e.target.value})}/></label>
      <button type="button" onClick={()=>setSlots(slots.filter((_,j)=>j!==i))}>Remove</button>
    </div>)}
    {slots && <button type="button" disabled={slots.length>=28} onClick={()=>setSlots([...slots,{day:1,start:'09:00',end:'17:00'}])}>+ Add time slot</button>}
    {slots?.length===0 && <p>Saving without slots closes withdrawals every day.</p>}
    <div><button className={button} disabled={save.isPending}>{save.isPending?'Saving…':'Save hours'}</button></div>
    {save.isSuccess && <p role="status">Withdrawal hours saved.</p>}
    {save.isError && <p role="alert">{save.error.message}</p>}
  </form>;
}
export function MemberTasks({admin=false,userId}:{admin?:boolean;userId?:string}) {
  const [draft,setDraft] = useState<Task>(blank);
  const [offset,setOffset] = useState(0);
  const [deleted,setDeleted] = useState(false);
  const [pendingDelete,setPendingDelete] = useState<{id:string;permanent:boolean}|null>(null);
  const qc = useQueryClient();
  const tasks = useQuery({queryKey:['member-tasks',admin,offset,userId,deleted],
    queryFn:()=>rpc<Task[]>(admin?'admin_member_tasks':'my_member_tasks',{p_offset:offset,p_limit:30,user_id:userId,deleted}),refetchOnMount:'always',refetchInterval:admin?false:15000});
  const remove = useMutation({mutationFn:()=>rpc('save_member_task',{id:pendingDelete!.id,action:pendingDelete!.permanent?'purge':'delete'}),
    onSuccess:async()=>{
      if(draft.id===pendingDelete?.id)setDraft(blank);
      setPendingDelete(null);
      await Promise.all([qc.invalidateQueries({queryKey:['member-tasks']}),qc.invalidateQueries({queryKey:['task-notice']}),qc.invalidateQueries({queryKey:['withdrawal-schedule']})]);
    }});
  const save = useMutation({mutationFn:()=>rpc<Task | {tasks: Task[]; assigned_count: number}>('save_member_task',{...draft,usernames:draft.username}),
    onSuccess:()=>{
      setDraft(blank);
      void qc.invalidateQueries({queryKey:['member-tasks']});
      void qc.invalidateQueries({queryKey:['competition']});
      void qc.invalidateQueries({queryKey:['viral-history']});
    }});
  const visible = tasks.data?.filter(task=>admin||!task.archived)??[];
  const update = (patch:Partial<Task>)=>setDraft({...draft,...patch});
  return <section id={admin?undefined:'tasks'} className={admin?'space-y-4':'member-tasks-slim space-y-3'}>
    <h2 className={userId?'text-sm font-semibold':'text-xl font-bold'}>{admin?'Member tasks':'My tasks'}</h2>
    {admin&&<div className="task-actions"><button type="button" aria-pressed={deleted} onClick={()=>{setDeleted(!deleted);setOffset(0);setPendingDelete(null);setDraft(blank);}}>{deleted?'View active tasks':'Deleted tasks'}</button></div>}
    {admin && !deleted && (!userId||draft.id) && <form className={card} onSubmit={e=>{e.preventDefault();save.mutate();}}>
      {!draft.id&&<TaskProfilePicker value={draft.username} onChange={username=>update({username})}/>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">{draft.id ? 'Username' : 'Usernames'}
          <textarea className={field} required disabled={!!draft.id} rows={draft.id ? 1 : 3} value={draft.username}
            placeholder={draft.id ? '@username' : '@firstuser, @seconduser or one username per line'}
            onChange={e=>update({username:e.target.value})}/>
          {!draft.id && <span className="mt-1 block text-xs text-fg-2">Assigns this task to every listed active user. Up to 100 users.</span>}
        </label>
        <label>Title<input className={field} required maxLength={100} value={draft.title} onChange={e=>update({title:e.target.value})}/></label>
        <label>Leaderboard challenge name (optional)
          <input className={field} maxLength={80} value={draft.challenge_name??''}
            readOnly={!!draft.challenge_week_id} onChange={e=>update({challenge_name:e.target.value})}/>
          <span className="block text-xs text-fg-3">
            {draft.challenge_week_id
              ? 'This name is saved with its original competition week.'
              : 'The name appears on this week’s leaderboard and in weekly history. The task goes to the selected users.'}
          </span>
        </label>
        <label>Type<select className={field} value={draft.kind} onChange={e=>update({kind:e.target.value,invite_target:1,video_target:1,network_target:2})}><option value="referral">Invite members</option><option value="video">Upload videos / reels</option><option value="invite_original">Invite members + upload original videos</option><option value="invite_network_video">Invite 1 + 2 referrals + upload any video</option><option value="custom">Custom creative task · admin verification</option></select></label>
        {draft.kind.startsWith('invite_')&&<><label>Direct invites<input className={field} type="number" required min={1} max={10000} value={draft.invite_target??1} onChange={e=>update({invite_target:Number(e.target.value)})}/></label><label>Video uploads<input className={field} type="number" required min={1} max={10000} value={draft.video_target??1} onChange={e=>update({video_target:Number(e.target.value)})}/></label>{draft.kind==='invite_network_video'&&<label>Referrals brought by invited members<input className={field} type="number" required min={1} max={10000} value={draft.network_target??2} onChange={e=>update({network_target:Number(e.target.value)})}/></label>}<p className="text-xs text-fg-3 sm:col-span-2">{draft.kind==='invite_original'?'Only videos marked New Content count.':'Your invited members must bring the referral target. Original and Copy-Paste uploads both count.'} Complete every requirement before the deadline for one wallet reward.</p></>}
        {draft.kind==='video'&&<label>Content type<select className={field} value={draft.content_origin??''} onChange={e=>update({content_origin:e.target.value})}><option value="">All videos / reels</option><option value="new_content">Original / New Content</option><option value="copy_paste">Copy-Paste Content</option></select></label>}
        {draft.kind==='custom'&&<label className="sm:col-span-2">Custom criteria<textarea className={field} required maxLength={1000} value={draft.criteria??''} onChange={e=>update({criteria:e.target.value})} placeholder="Describe what the creator must complete and how you will verify it."/></label>}
        <label>Task category<select className={field} disabled={draft.kind==='referral'} required={draft.kind==='video'} value={draft.category} onChange={e=>update({category:e.target.value})}><option value="">{draft.kind==='referral'?'Invites · no video category':'Select target category'}</option>{Object.entries(taskCategories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><span className="block text-xs text-fg-3">{draft.kind==='referral'?'Choose Upload videos / reels to set a category target.':'Only videos in this selected category count toward the target.'}</span></label>
        {!draft.kind.startsWith('invite_')&&<label>Target<input className={field} required type="number" min={1} max={10000} value={draft.target} onChange={e=>update({target:Number(e.target.value)})}/></label>}
        <label>Wallet reward (₹)<input className={field} required type="number" step="0.01" min={0} max={1000000} value={(draft.reward_paise??0)/100} onChange={e=>update({reward_paise:Math.round(Number(e.target.value)*100),points:0})}/><span className="text-xs text-fg-3">Credited once after verified completion.</span></label>
        <label>Deadline (IST)<input className={field} required type="datetime-local" value={draft.deadline} onChange={e=>update({deadline:e.target.value})}/></label>
        <label>Reward description<input className={field} maxLength={200} value={draft.reward} onChange={e=>update({reward:e.target.value})}/></label>
      </div>
      {draft.id && <label className="flex gap-2"><input type="checkbox" checked={!!draft.archived} onChange={e=>update({archived:e.target.checked})}/>Archive task</label>}
      <button className={button} disabled={save.isPending}>{save.isPending?'Saving…':draft.id?'Save task':'Assign task'}</button>
      {draft.id && <button type="button" className="ml-3" onClick={()=>setDraft(blank)}>Cancel edit</button>}
      {save.isError && <p role="alert">{save.error.message}</p>}
      {save.isSuccess && <p role="status">{'assigned_count' in save.data ? `${save.data.assigned_count} tasks assigned.` : 'Task saved.'}</p>}
    </form>}
    {tasks.isPending && <p role="status">Loading tasks…</p>}
    {tasks.isError && <button onClick={()=>void tasks.refetch()}>Unable to load tasks. Retry</button>}
    {tasks.data && !visible.length && <p>No assigned tasks on this page.</p>}
    {!admin && visible.length>0 && <p className="font-semibold">₹{(visible.reduce((sum,task)=>sum+(task.reward_credited_at?(task.reward_paise??0):0),0)/100).toFixed(2)} credited</p>}
    {visible.map(task=><article className={card} key={task.id}>
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{task.title}{admin && ' · @'+task.username}</h3>
        <span className="flex items-center gap-2"><b className="rounded-full bg-brand-gradient px-2 py-0.5 text-xs text-white tabular-nums">{Math.min(100,Math.round(((task.completed_at?task.target:task.progress??0)/Math.max(1,task.target))*100))}%</b>{task.archived?'Archived':task.completed_at?'Completed':Date.parse(task.deadline_utc??'')<=Date.now()?'Expired':'Pending'}</span></div>
      {task.challenge_name && <p className="flex items-center gap-1.5 text-xs text-fg-2">
        <Sparkles aria-hidden size={13} className="shrink-0 text-brand-ink"/>
        <span className="min-w-0 break-words">{task.challenge_name}</span>
      </p>}
      <TaskProgressMeter title={task.title} progress={task.completed_at?task.target:task.progress??0} target={task.target}/>
      {task.kind.startsWith('invite_')&&<div className="flex flex-wrap gap-2 text-xs text-fg-2"><span>Invites {task.invite_progress??0}/{task.invite_target}</span>{!!task.network_target&&<span>Member referrals {task.network_progress??0}/{task.network_target}</span>}<span>{task.kind==='invite_original'?'Original videos':'Videos'} {task.video_progress??0}/{task.video_target}</span></div>}
      {task.category&&<span className="task-category-label">Any category · {task.kind==='video'?'Upload videos':'Custom criteria'}</span>}
      <p className="text-xs text-fg-2">₹{((task.reward_paise??0)/100).toFixed(2)} {task.reward_credited_at?'credited':'reward'} · Due {task.deadline.replace('T',' ')} IST</p>
      {task.criteria&&<p className="text-sm text-fg-2">{task.criteria}</p>}
      {!!task.video_checks?.length&&<details className="rounded-xl bg-white/5 p-2.5 text-xs" open={!task.completed_at}><summary className="cursor-pointer font-semibold">Your videos for this task ({task.video_checks.filter(v=>v.counted).length} counted)</summary><ul className="mt-2 space-y-1.5">{task.video_checks.map(v=><li key={v.id} className="flex items-start justify-between gap-2"><a href={'/post/'+v.id} className="min-w-0 truncate text-fg-2 hover:underline">{v.caption||(taskCategories[v.category]??v.category)+' video'} <span className="text-fg-3">· {new Date(v.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</span></a>{v.counted?<span className="shrink-0 font-semibold text-emerald-400">✓ Counted</span>:<span className="shrink-0 text-right text-amber-400">✗ {v.reason}</span>}</li>)}</ul>{task.video_checks.some(v=>!v.counted)&&<p className="mt-2 text-fg-3">Videos from any category uploaded after the task started count.</p>}</details>}
      {admin&&!deleted&&task.kind==='custom'&&!task.completed_at&&!task.archived&&<button className={button} onClick={async()=>{await rpc('save_member_task',{id:task.id,action:'approve_custom'});void qc.invalidateQueries({queryKey:['member-tasks']});}}>Verify completion & credit reward</button>}
      {task.reward && <p>{task.reward}</p>}
      {admin&&task.id&&(pendingDelete?.id===task.id
        ? <TaskDeleteConfirm permanent={pendingDelete.permanent} scope="task" busy={remove.isPending} error={remove.error?.message} cancel={()=>setPendingDelete(null)} confirm={()=>remove.mutate()}/>
        : <TaskActions edit={!deleted&&!task.completed_at?()=>setDraft(task):undefined} remove={!deleted?()=>{remove.reset();setPendingDelete({id:task.id!,permanent:false});}:undefined} purge={()=>{remove.reset();setPendingDelete({id:task.id!,permanent:true});}} busy={remove.isPending}/>)}
    </article>)}
    {admin && <nav className="flex gap-4" aria-label="Task pages"><button disabled={!offset} onClick={()=>setOffset(offset-30)}>Previous</button><button disabled={(tasks.data?.length??0)<30} onClick={()=>setOffset(offset+30)}>Next</button></nav>}
  </section>;
}
export default function AdminMemberProgram() {
  const hours = useWithdrawalSchedule();
  return <div className="mx-auto max-w-4xl space-y-8 p-4"><MemberTasks admin/>
    {hours.data ? <ScheduleEditor initial={hours.data.slots}/> : hours.isError ?
      <button onClick={()=>void hours.refetch()}>Unable to load hours. Retry</button> : <p role="status">Loading hours…</p>}
  </div>;
}
