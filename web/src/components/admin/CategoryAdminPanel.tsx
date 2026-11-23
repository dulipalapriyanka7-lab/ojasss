import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {Pencil,Trash2,RotateCcw,Layers3} from 'lucide-react';
import {admin} from '@/api/admin';
import type {Category,PublicSettings} from '@/api';
import {configuredCategories} from '@/hooks/useCategories';
import {Card} from '../ui/Feedback';
import {Button} from '../ui/Button';
import {Field,Input,Textarea,Switch} from '../ui/Field';
import {Dialog,ConfirmDialog} from '../ui/Overlay';
import {useToast} from '../ui/Toast';
type Entry={label:string;description:string;enabled:boolean;deleted:boolean};
type Config=Partial<Record<Category,Entry>>;
export function CategoryAdminPanel(){
 const {data}=useQuery({queryKey:['admin','settings'],queryFn:admin.settings});
 const qc=useQueryClient(),toast=useToast();
 const [edit,setEdit]=useState<{id:Category;entry:Entry}|null>(null),[remove,setRemove]=useState<Category|null>(null),[busy,setBusy]=useState(false);
 const config=(data?.find(s=>s.key==='categories.config')?.value??{}) as Config;
 const items=configuredCategories({'categories.config':config} as PublicSettings,true);
 const save=async(id:Category,entry:Entry)=>{
  setBusy(true);try{await admin.updateSetting('categories.config',{...config,[id]:entry},'Updated category '+id,true);await Promise.all([qc.invalidateQueries({queryKey:['admin','settings']}),qc.invalidateQueries({queryKey:['public-settings']}),qc.invalidateQueries({queryKey:['feed']})]);setEdit(null);setRemove(null);toast.success('Category updated');}catch(e){toast.error(e);}finally{setBusy(false);}
 };
 if(!data)return null;
 const entryFor=(id:Category):Entry=>{const item=items.find(c=>c.value===id)!;return {label:item.label,description:item.description,enabled:item.enabled!==false,deleted:item.deleted===true};};
 return <Card as="section" className="mb-5 p-4 sm:p-5"><header className="mb-4 flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-white"><Layers3 size={18}/></span><div><h2 className="font-semibold">Manage categories</h2><p className="text-xs text-fg-3">Control categories across Home, uploads and feed choices.</p></div></header><div className="divide-y divide-line">{items.map(c=><div key={c.value} className="flex items-center gap-2 py-3"><c.icon aria-hidden size={17} className="shrink-0 text-brand-ink"/><div className="min-w-0 flex-1"><Switch label={c.label} description={c.deleted?'Deleted · restore to make available':c.enabled===false?'Off · hidden from discovery':c.description} checked={!c.deleted&&c.enabled!==false} disabled={busy||c.deleted} onChange={enabled=>void save(c.value,{...entryFor(c.value),enabled})}/></div>{c.deleted?<button type="button" aria-label={'Restore '+c.label} disabled={busy} onClick={()=>void save(c.value,{...entryFor(c.value),enabled:true,deleted:false})} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-brand-ink hover:bg-surface-2"><RotateCcw size={17}/></button>:<><button type="button" aria-label={'Edit '+c.label} disabled={busy} onClick={()=>setEdit({id:c.value,entry:entryFor(c.value)})} className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><Pencil size={16}/></button><button type="button" aria-label={'Delete '+c.label} disabled={busy} onClick={()=>setRemove(c.value)} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-danger hover:bg-danger-soft"><Trash2 size={16}/></button></>}</div>)}</div>
 <Dialog open={!!edit} onClose={()=>{if(!busy)setEdit(null);}} title="Edit category" size="sm" footer={<Button loading={busy} disabled={!edit?.entry.label.trim()} onClick={()=>{if(edit)void save(edit.id,edit.entry);}}>Save changes</Button>}>{edit&&<div className="space-y-4"><Field label="Category name">{p=><Input {...p} maxLength={60} value={edit.entry.label} onChange={e=>setEdit({...edit,entry:{...edit.entry,label:e.target.value}})}/>}</Field><Field label="Description">{p=><Textarea {...p} maxLength={240} rows={2} value={edit.entry.description} onChange={e=>setEdit({...edit,entry:{...edit.entry,description:e.target.value}})}/>}</Field>{['news','part_time_jobs'].includes(edit.id)&&<p className="text-xs text-fg-3">Posts in this category still expire after 48 hours.</p>}{edit.id==='one_chance'&&<p className="text-xs text-fg-3">Only videos that become Viral enter One Chance.</p>}</div>}</Dialog>
 <ConfirmDialog open={!!remove} onClose={()=>{if(!busy)setRemove(null);}} title="Delete category?" description="This hides the category and its videos from discovery and prevents new uploads to it. Existing posts are kept. You can restore the category here." confirmLabel="Delete category" tone="danger" loading={busy} onConfirm={async()=>{if(remove)await save(remove,{...entryFor(remove),enabled:false,deleted:true});}}/>
 </Card>;
}
