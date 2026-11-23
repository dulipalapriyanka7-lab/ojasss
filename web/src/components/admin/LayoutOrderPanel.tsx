import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical, Save, Flame } from 'lucide-react';
import { useState } from 'react';
import { admin } from '@/api/admin';
import { CATEGORIES } from '@/lib/constants';
import { ACTIONS, orderedItems } from '@/lib/layoutOrder';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';

function OrderEditor({settingKey,title,description,items,initial}:{settingKey:string;title:string;description:string;items:{value:string;label:string}[];initial:string[]}) {
 const [order,setOrder]=useState(initial),[busy,setBusy]=useState(false);
 const qc=useQueryClient(),toast=useToast();
 const move=(index:number,direction:number)=>setOrder(current=>{const next=[...current];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next;});
 const save=async()=>{setBusy(true);try{await admin.updateSetting(settingKey,order,'Updated display positions',true);await Promise.all([qc.invalidateQueries({queryKey:['public-settings']}),qc.invalidateQueries({queryKey:['admin','settings']})]);toast.success('Order saved');}catch(error){toast.error(error);}finally{setBusy(false);}};
 return <section className="space-y-3"><div><h3 className="font-semibold">{title}</h3><p className="text-sm text-fg-3">{description}</p></div><ol className="space-y-2">{order.map((value,index)=><li key={value} className="flex min-h-14 items-center gap-2 rounded-xl border border-line bg-surface px-3"><GripVertical aria-hidden size={16} className="shrink-0 text-fg-3"/><span className="w-5 text-xs tabular-nums text-fg-3">{index+1}</span><span className="min-w-0 flex-1 text-sm font-medium">{items.find(item=>item.value===value)?.label??value}</span>{value==='viral'&&<Flame aria-hidden size={18} className="text-orange-500"/>}<button type="button" aria-label={`Move ${items.find(item=>item.value===value)?.label} up`} disabled={busy||index===0} onClick={()=>move(index,-1)} className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-25"><ArrowUp aria-hidden size={18}/></button><button type="button" aria-label={`Move ${items.find(item=>item.value===value)?.label} down`} disabled={busy||index===order.length-1} onClick={()=>move(index,1)} className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-25"><ArrowDown aria-hidden size={18}/></button></li>)}</ol><Button leading={<Save aria-hidden size={16}/>} onClick={()=>void save()} loading={busy} disabled={order.join()===initial.join()}>Save Order</Button></section>;
}
export function LayoutOrderPanel(){
 const {data}=useQuery({queryKey:['admin','settings'],queryFn:admin.settings});
 if(!data)return null;
 return <Card className="mb-5 space-y-6 p-4 sm:p-5"><div><h2 className="text-lg font-semibold">Home positions</h2><p className="text-sm text-fg-3">Move items up or down, then save. Existing posts keep their categories.</p></div><div className="grid items-start gap-6 xl:grid-cols-2">{[{key:'layout.category_order',title:'Category order',description:'All stays first. This order applies to the scrollable Home category strip.',items:CATEGORIES},{key:'layout.action_order',title:'Post action order',description:'Top to bottom on the Home action rail. Viral uses the fire icon.',items:ACTIONS}].map(group=>{const saved=data.find(s=>s.key===group.key)?.value;const initial=orderedItems(group.items,Array.isArray(saved)?saved:undefined).map(item=>item.value);return <OrderEditor key={group.key+initial.join()} settingKey={group.key} title={group.title} description={group.description} items={group.items} initial={initial}/>;})}</div></Card>;
}
