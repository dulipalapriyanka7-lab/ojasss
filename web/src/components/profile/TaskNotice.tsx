import {useQuery} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ClipboardList,X} from 'lucide-react';
import {rpc} from '@/api/client';
import {useAuth} from '@/hooks/useAuth';
type Task={id:string;title:string;created_at:string;archived?:boolean;completed_at?:string};
export function TaskNotice(){const {me}=useAuth();const [notice,setNotice]=useState<Task|null>(null);const q=useQuery({queryKey:['task-notice',me?.id],queryFn:()=>rpc<Task[]>('my_member_tasks',{}),enabled:!!me,refetchInterval:15000});useEffect(()=>{if(!me||!q.data)return;const key='ojasss-task-seen:'+me.id;let seen:string[]=[];try{seen=JSON.parse(localStorage.getItem(key)||'[]');}catch{}const unseen=q.data.find(t=>!t.archived&&!t.completed_at&&!seen.includes(t.id));if(unseen){setNotice(unseen);localStorage.setItem(key,JSON.stringify([...new Set([...seen,...q.data.map(t=>t.id)])]));const timer=setTimeout(()=>setNotice(null),4000);return()=>clearTimeout(timer);}},[q.data,me?.id]);return notice?<aside className="task-notice" aria-live="polite"><ClipboardList size={21}/><Link to="/my-tasks" onClick={()=>setNotice(null)}><strong>You got a task today!</strong><span>{notice.title}</span><b>View task →</b></Link><button aria-label="Dismiss task notification" onClick={()=>setNotice(null)}><X size={17}/></button></aside>:null;}
