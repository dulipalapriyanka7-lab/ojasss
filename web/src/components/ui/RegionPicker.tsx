import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Dialog } from './Overlay';
import { cn } from '@/lib/utils';

type Option = {value:string;label:string};
export function RegionPicker({id,label,value,onChange,options,emptyLabel,required,className,'aria-invalid':invalid,'aria-describedby':described}: {
  id?:string;label:string;value:string;onChange:(value:string)=>void;options:Option[];emptyLabel?:string;required?:boolean;className?:string;'aria-invalid'?:boolean;'aria-describedby'?:string;
}) {
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [limit,setLimit]=useState(60);
  const list=useRef<HTMLDivElement>(null);
  const selected=options.find(o=>o.value===value);
  const filtered=useMemo(()=>options.filter(o=>`${o.label} ${o.value}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),[options,search]);
  const choose=(next:string)=>{onChange(next);setOpen(false);};
  return <>
    <button id={id} type="button" aria-label={`${label}: ${selected?.label??emptyLabel??'Choose'}`} aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalid} aria-describedby={described}
      onClick={()=>{setSearch('');setLimit(60);setOpen(true);}} className={cn('flex h-12 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 text-left text-sm text-fg',className)}>
      <span className="min-w-0 truncate">{selected?.label??emptyLabel??`Choose ${label.toLowerCase()}`}</span><ChevronDown aria-hidden size={16} className="shrink-0"/>
    </button>
    <Dialog open={open} onClose={()=>setOpen(false)} title={`Select ${label.toLowerCase()}`} size="sm">
      <label className="mb-1 block text-sm font-medium" htmlFor={`${id??label}-search`}>Search {label.toLowerCase()}</label>
      <input id={`${id??label}-search`} type="search" autoFocus value={search} onChange={e=>{setSearch(e.target.value);setLimit(60);}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();list.current?.querySelector<HTMLButtonElement>('[role=option]')?.focus();}}} placeholder={`Search by name or code`} className="mb-3 h-12 w-full rounded-xl border border-line bg-surface px-3 text-base"/>
      <div ref={list} className="max-h-[50svh] overflow-y-auto" role="listbox" aria-label={label} onKeyDown={e=>{
        if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=option]'));const current=buttons.indexOf(document.activeElement as HTMLButtonElement);const index=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,current+(e.key==='ArrowDown'?1:-1)));buttons[index]?.focus();
      }}>
        {!required && emptyLabel && <button type="button" role="option" aria-selected={!value} className="flex min-h-12 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-surface-2" onClick={()=>choose('')}>{emptyLabel}{!value&&<Check aria-hidden size={16}/>}</button>}
        {filtered.slice(0,limit).map(o=><button key={o.value} type="button" role="option" aria-selected={value===o.value} onClick={()=>choose(o.value)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"><span>{o.label} <span className="text-xs text-fg-3">{o.value}</span></span>{value===o.value&&<Check aria-hidden size={16}/>}</button>)}
        {!filtered.length && <p className="p-3 text-sm text-fg-3">No matches. Try another name or language code.</p>}
      </div>
      {filtered.length>limit&&<button type="button" className="mt-2 min-h-11 w-full rounded-xl bg-surface-2 text-sm font-semibold" onClick={()=>setLimit(n=>n+100)}>Show more ({filtered.length-limit} remaining)</button>}
    </Dialog>
  </>;
}
