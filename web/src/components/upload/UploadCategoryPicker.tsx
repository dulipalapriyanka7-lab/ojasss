import {useState} from 'react';
import {Check,ChevronDown,Clock3} from 'lucide-react';
import type {Category} from '@/api';
import {useCategories} from '@/hooks/useCategories';
import {cn} from '@/lib/utils';
import {Dialog} from '../ui/Overlay';
const label=(text:string)=>text.replace(/\s*·\s*48hrs$/,'');
export function UploadCategoryPicker({value,onChange}:{value:Category;onChange:(value:Category)=>void}){
 const choices=useCategories().filter(category=>
   category.value!=='one_chance'&&
   !(category.value==='technology'&&category.label.trim().toLowerCase()==='one chance weekly winners viral videos'),
 );
 const[open,setOpen]=useState(false);const selected=choices.find(category=>category.value===value);const Icon=selected?.icon??ChevronDown;const timed=value==='news'||value==='part_time_jobs';
 return <div><div className="mb-2 flex items-center justify-between"><span id="upload-category-label" className="text-xs font-semibold">Category <span className="text-danger">*</span></span><span className="text-[10px] text-fg-3">Choose your audience</span></div>
 <button type="button" aria-labelledby="upload-category-label upload-category-value" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)} className="group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-purple-400/25 bg-gradient-to-r from-purple-500/10 via-fuchsia-500/5 to-transparent px-3 py-2.5 text-left transition-colors hover:border-purple-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm"><Icon size={16} aria-hidden/></span><span id="upload-category-value" className="min-w-0 flex-1 truncate text-[13px] font-semibold">{selected?label(selected.label):'No categories available'}</span>{timed&&<span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] text-amber-500"><Clock3 size={11}/>48h</span>}<ChevronDown size={15} aria-hidden className="shrink-0 text-fg-3"/></button>
 {timed&&<p className="mt-1.5 text-[11px] text-fg-3">Visible for 48 hours after publishing.</p>}
 <Dialog open={open} onClose={()=>setOpen(false)} title="Choose a category" description="Give your post the right audience." size="sm"><div className="grid grid-cols-2 gap-2" role="group" aria-label="Post category">{choices.map(category=>{const active=category.value===value;return <button type="button" key={category.value} aria-pressed={active} onClick={()=>{onChange(category.value);setOpen(false);}} className={cn('relative flex min-h-14 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',active?'border-purple-400/50 bg-gradient-to-br from-purple-500/20 to-pink-500/10':'border-line bg-surface hover:bg-surface-2')}><span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg',active?'bg-brand-gradient text-white':'bg-surface-2 text-fg-2')}><category.icon size={14} aria-hidden/></span><span className="min-w-0 flex-1 text-xs font-medium leading-4">{label(category.label)}{(category.value==='news'||category.value==='part_time_jobs')&&<span className="mt-0.5 block text-[10px] text-fg-3">48 hours</span>}</span>{active&&<Check aria-hidden size={12} className="shrink-0 text-brand-ink"/>}</button>;})}</div></Dialog></div>;
}
