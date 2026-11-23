import {useState} from 'react';
import {ClipboardList} from 'lucide-react';
import {MemberTasks} from '@/pages/MemberProgram';
import {TaskMonitor} from '@/pages/admin/AssignTasksPage';

export default function ProfileTaskAdmin({userId}:{userId:string}) {
  const [mode,setMode]=useState<'challenge'|'member'>('challenge');
  return <section className="space-y-2 rounded-xl border border-line bg-surface p-3" aria-label="Manage profile tasks">
    <h2 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList size={15} aria-hidden/>Manage tasks</h2>
    <div className="task-actions" aria-label="Task type">
      <button type="button" aria-pressed={mode==='challenge'} onClick={()=>setMode('challenge')}>Challenge tasks</button>
      <button type="button" aria-pressed={mode==='member'} onClick={()=>setMode('member')}>Member tasks</button>
    </div>
    {mode==='challenge'?<TaskMonitor userId={userId}/>:<MemberTasks admin userId={userId}/>}
  </section>;
}
