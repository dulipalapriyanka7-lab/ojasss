import {Flame} from 'lucide-react';
export function StatusHotBurst({active}:{active:boolean}) {
 return active ? <span className="status-hot-burst" aria-hidden>{Array.from({length:9},(_,i)=><Flame key={i} style={{'--burst-x':`${(i-4)*23}px`,'--burst-delay':`${i*35}ms`} as React.CSSProperties} size={18}/>)}</span> : null;
}
