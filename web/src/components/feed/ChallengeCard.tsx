import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {CalendarDays,CheckCircle2,Clapperboard,Flame,Trophy} from 'lucide-react';
import {challengeApi,challengeStatus} from '@/api/challengeTasks';
import {countdownParts,secondsUntil} from '@/lib/countdown';
import './challenge-card.css';

const date = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'});
const time = new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',weekday:'short',hour:'numeric',minute:'2-digit'});
const rupees = new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0});
const formatDate = (value:string)=>date.format(new Date(value)).replaceAll('/','.');
function deadlineLabel(seconds:number) {
  if(seconds <= 0) return 'Deadline passed';
  const {d,h,m,s}=countdownParts(seconds);
  return [d ? d+'d' : '',d||h ? h+'h' : '',d||h||m ? m+'m' : '',s+'s'].filter(Boolean).join(' ')+' left';
}
function PrizeTrophy() {
  return <span className="challenge-trophy" aria-hidden>
    <svg viewBox="0 0 64 56" fill="currentColor">
      {[0,1].map(side=><g key={side} transform={side ? 'translate(64) scale(-1 1)' : undefined}>
        <path d="M27 52C13 50 4 38 7 21" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        {[0,1,2,3,4].map(i=><ellipse key={i} cx={8+i*i*.8} cy={22+i*6} rx="2.1" ry="4.6" transform={`rotate(${-33-i*11} ${8+i*i*.8} ${22+i*6})`}/>)}
      </g>)}
    </svg><Trophy/>
  </span>;
}
export function ChallengeCard({week,names,start,end,locked}:{week?:string;names?:string[];start:string;end:string;locked:boolean}) {
  const q=useQuery({queryKey:['leaderboard-challenge',week],queryFn:()=>challengeApi.public(week),refetchInterval:15000});
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  const banner=q.data?.banner;
  const tasks=q.data?.tasks??[];
  const serverNow=q.data ? Date.parse(q.data.server_time)+(now-q.dataUpdatedAt) : now;
  const status=banner&&(banner.status==='closed'||serverNow>=Date.parse(banner.ends_at)?'closed':serverNow<Date.parse(banner.starts_at)?'upcoming':'live');
  const existingName=names?.filter(Boolean).join(' · ');
  const displayed=banner??(existingName ? {name:existingName,starts_at:start,ends_at:end,schedule:''} : null);
  return <>
    {displayed ? <section className="challenge-card" aria-label="This week’s challenge">
      <div className="challenge-card-title"><Trophy aria-hidden/>This week’s challenge</div>
      <Clapperboard className="challenge-clapper" aria-hidden/>
      <div className="challenge-name">Challenge Name <strong>{displayed.name}</strong></div>
      <div className="challenge-schedule"><CalendarDays aria-hidden/><span>{displayed.schedule || `${time.format(new Date(displayed.starts_at))} to ${time.format(new Date(displayed.ends_at))}`}</span></div>
      <div className="challenge-dates"><CalendarDays aria-hidden/><span>Date <b>{formatDate(displayed.starts_at)}</b> to <b>{formatDate(displayed.ends_at)}</b></span></div>
      <div className="challenge-prize-row">
        <div className="challenge-prize"><PrizeTrophy/><div><span>Prize Pool <small>(Approx)</small></span>{banner?<strong>{rupees.format(banner.min_prize)} – {rupees.format(banner.max_prize)}</strong>:<span>To be announced</span>}</div></div>
        <span className={`challenge-ribbon is-${status || (locked?'closed':'live')}`}>{status==='upcoming'?'Upcoming':status==='closed'||(!status&&locked)?'Closed':'Hurry Up!'}</span>
      </div>
    </section>:<section className="challenge-card challenge-card-empty" aria-label="This week’s challenge">
      <div className="challenge-card-title"><Trophy aria-hidden/>This week’s challenge</div>
      <Clapperboard className="challenge-clapper" aria-hidden/>
      <p>{q.isPending?'Loading challenge…':q.isError?'Challenge details are temporarily unavailable.':'No challenge scheduled.'}</p>
    </section>}
    {tasks.length>0 && <details className="challenge-today">
      <summary><Flame size={18}/><strong>{tasks.length===1?'Today’s Task':`Today’s Tasks (${tasks.length})`}</strong><span>{tasks.length===1 ? `${tasks[0].progress}/${tasks[0].target} · ${challengeStatus[tasks[0].status]}` : 'View tasks'}</span></summary>
      {tasks.map(task=><article key={task.id}>
        <div className="challenge-task-title"><strong>{task.title}</strong><span className={`task-state is-${task.status}`}>{task.status==='completed'&&<CheckCircle2 size={13}/>} {challengeStatus[task.status]}</span></div>
        {task.description && <p>{task.description}</p>}
        <div className="challenge-task-meta"><span>{task.category_label} · {formatDate(task.starts_at)}</span><span>{task.progress}/{task.target} {task.type==='engagement'?'views':'videos'}</span></div>
        <progress aria-label={task.title+' progress'} value={task.progress} max={task.target}/>
        <div className="challenge-task-meta"><span title={time.format(new Date(task.deadline))+' IST'}>{time.format(new Date(task.deadline))} IST · <span className="tabular-nums">{deadlineLabel(secondsUntil(Date.parse(task.deadline),serverNow))}</span></span>{['not_started','in_progress'].includes(task.status)&&<Link to="/upload">Create Video →</Link>}</div>
        {task.review_reason&&<p>{task.review_reason}</p>}
      </article>)}
    </details>}
  </>;
}
