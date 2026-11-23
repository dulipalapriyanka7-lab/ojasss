import {Pencil,Trash2,XCircle} from 'lucide-react';
import './task-management.css';

export function TaskProgressMeter({title,progress,target}:{title:string;progress:number;target:number}) {
  const percent=Math.min(100,Math.max(0,Math.round(progress/Math.max(1,target)*100)));
  return <div className="task-meter">
    <div className="task-meter-meta"><span>{progress}/{target} completed</span><strong>{percent}%</strong></div>
    <div className="task-meter-track" style={{height:6,borderRadius:999,overflow:'hidden',background:'rgba(255,255,255,.12)'}} role="progressbar" aria-label={title+' progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{display:'block',height:'100%',borderRadius:999,width:(percent>0?Math.max(percent,4):0)+'%',background:percent===100?'linear-gradient(90deg,#22c55e,#16a34a)':'linear-gradient(90deg,#a855f7,#ec4899)'}} className={percent===100?'is-complete':undefined}/>
    </div>
  </div>;
}

export function TaskActions({edit,remove,purge,busy}:{edit?:()=>void;remove?:()=>void;purge:()=>void;busy?:boolean}) {
  return <div className="task-actions">
    {edit&&<button type="button" onClick={edit} disabled={busy}><Pencil size={13} aria-hidden/>Edit</button>}
    {remove&&<button type="button" onClick={remove} disabled={busy}><Trash2 size={13} aria-hidden/>Delete</button>}
    <button type="button" className="task-purge" onClick={purge} disabled={busy}><XCircle size={13} aria-hidden/>Delete permanently</button>
  </div>;
}

export function TaskDeleteConfirm({permanent,scope,allAssignments=false,busy,error,cancel,confirm}:{permanent:boolean;scope:'task'|'assignment';allAssignments?:boolean;busy:boolean;error?:string;cancel:()=>void;confirm:()=>void}) {
  return <div className="task-delete-confirm">
    <strong>{permanent?'Permanently delete':'Delete'} this {scope}?</strong>
    <p>{permanent
      ? allAssignments?'This removes the task and all its assignments permanently.':'This removes the record and cannot be undone.'
      : allAssignments?'This hides the task from all assigned members and moves it to Deleted.':'This hides it from the member and moves it to Deleted.'}</p>
    {error&&<p role="alert">{error}</p>}
    <div className="task-actions">
      <button type="button" disabled={busy} onClick={cancel}>Cancel</button>
      <button type="button" className="task-purge" disabled={busy} onClick={confirm}>{busy?'Deleting…':permanent?'Delete permanently':'Confirm deletion'}</button>
    </div>
  </div>;
}
