import {useQueryClient} from '@tanstack/react-query';
import {Check, CheckCircle2, Clock3, Coins, Copy, IndianRupee, ShoppingBasket, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {business, type BizOrder, type BizProduct} from '@/api/business';
import './buy-product.css';

const rupee=(n:number)=>'₹'+n.toLocaleString('en-IN');
const pad=(n:number)=>String(Math.max(0,n)).padStart(2,'0');
const hms=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000));return `${pad(Math.floor(s/3600))}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}`;};
export const orderLabel:Record<BizOrder['status'],string>={pending:'Payment being verified',approved:'Payment approved · preparing delivery',rejected:'Payment not found',delivered:'Delivered'};

/** Pay for a deal by UPI, then send the UTR and delivery details. Admin verifies and delivers. */
export function BuyProductSheet({product,upiId,now,coins=0,onClose}:{product:BizProduct;upiId:string;now:number;coins?:number;onClose:()=>void}){
 const qc=useQueryClient();
 const [utr,setUtr]=useState('');const [name,setName]=useState('');const [phone,setPhone]=useState('');const [address,setAddress]=useState('');
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [done,setDone]=useState(false);const [copied,setCopied]=useState(false);
 const [useCoins,setUseCoins]=useState(coins>0);useEffect(()=>{if(coins>0)setUseCoins(true);},[coins]);const spend=useCoins?Math.min(coins,product.price):0;const toPay=product.price-spend;
 const ends=product.deal_ends_at?Date.parse(product.deal_ends_at)-now:Infinity;const over=ends<=0;
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[onClose]);
 const upiLink=`upi://pay?pa=${encodeURIComponent(upiId)}&pn=OJASSS&am=${toPay}&cu=INR&tn=${encodeURIComponent('OJASSS '+product.title.slice(0,40))}`;
 const submit=async()=>{setBusy(true);setErr('');try{let taskId='';try{const t=JSON.parse(localStorage.getItem('ojasss.bizTask')??'null');if(t&&t.p===product.id)taskId=t.id;}catch{/* none */}await business.order({productId:product.id,coins:spend,utr:toPay>0?utr:'',name,phone,address,taskId});setDone(true);void qc.invalidateQueries({queryKey:['business-hub']});void qc.invalidateQueries({queryKey:['coins']});}catch(e){setErr(e instanceof Error?e.message:'Could not send.');}finally{setBusy(false);}};
 return createPortal(<div className="bp-back" onClick={onClose}>
  <div className="bp-sheet" role="dialog" aria-modal="true" aria-label={`Buy ${product.title}`} onClick={e=>e.stopPropagation()}>
   <header className="bp-head">
    <span className="bp-img">{product.image_url?<img src={product.image_url} alt=""/>:<ShoppingBasket size={22}/>}</span>
    <div><b>{product.title}</b><strong>{rupee(product.price)}</strong>{product.mrp>product.price&&<s>{rupee(product.mrp)}</s>}</div>
    <button type="button" className="bp-x" aria-label="Close" onClick={onClose}><X size={16}/></button>
   </header>
   {Number.isFinite(ends)&&<div className={'bp-timer'+(over?' is-over':'')}><Clock3 size={13}/>{over?'This deal has ended':<>Deal ends in <b>{hms(ends)}</b></>}</div>}
   {done?<div className="bp-done"><CheckCircle2 size={34}/><b>Order sent</b><span>We are verifying your payment. Once approved, your product will be delivered to the address you gave.</span><button type="button" className="bp-pay" onClick={onClose}>Done</button></div>
   :over?null:!upiId&&toPay>0?<p className="bp-err">Payments are not set up yet. Please try again later.</p>:<>
    {<label className="bp-coins"><input type="checkbox" disabled={coins<=0} checked={useCoins} onChange={e=>setUseCoins(e.target.checked)}/><Coins size={15}/><span>Use game coins <small>{coins.toLocaleString('en-IN')} available · 1 coin = ₹1</small></span>{useCoins&&<b>−{rupee(spend)}</b>}</label>}
    {toPay>0&&<><ol className="bp-steps">
     <li><span>1</span>Pay <b>{rupee(toPay)}</b> to <button type="button" className="bp-upi" onClick={()=>{void navigator.clipboard?.writeText(upiId);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>{upiId}{copied?<Check size={12}/>:<Copy size={12}/>}</button></li>
     <li><span>2</span>Enter the UPI reference (UTR) and delivery details</li>
    </ol>
    <a className="bp-pay" href={upiLink}><IndianRupee size={15}/>Pay {rupee(toPay)} with UPI app</a></>}
    <div className="bp-form">
     {toPay>0&&<input value={utr} onChange={e=>setUtr(e.target.value.replace(/\s/g,'').toUpperCase())} placeholder="12-digit UTR number" inputMode="numeric" maxLength={30} aria-label="UPI reference number"/>}
     <div className="bp-two"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" maxLength={80} aria-label="Full name"/><input value={phone} onChange={e=>setPhone(e.target.value.replace(/[^0-9+ ]/g,''))} placeholder="Phone" inputMode="tel" maxLength={15} aria-label="Phone"/></div>
     <textarea value={address} onChange={e=>setAddress(e.target.value)} placeholder="Delivery address with pincode" rows={2} maxLength={300} aria-label="Delivery address"/>
     {err&&<p className="bp-err">{err}</p>}
     <button type="button" className="bp-submit" disabled={busy||(toPay>0&&utr.length<8)||!name.trim()||phone.replace(/\D/g,'').length<10||!address.trim()} onClick={()=>void submit()}>{busy?'Sending…':toPay>0?'Submit payment':`Pay ${spend.toLocaleString('en-IN')} coins`}</button>
    </div>
   </>}
  </div>
 </div>,document.body);
}
