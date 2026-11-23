import {rpc} from './client';
export type TicketCat='movies'|'events'|'shows'|'sports'|'concerts'|'theatre'|'comedy'|'music'|'festivals'|'pops'|'drinks'|'amusement';
export type TicketSource='bookmyshow'|'district'|'other';
export type TicketStatus='pending_review'|'listed'|'reserved'|'sold'|'rejected'|'cancelled'|'expired';
export interface Ticket {id:string;category:TicketCat;title:string;venue:string;city:string;event_at:string;quantity:number;seats:string;source:TicketSource;original_price:number;price:number;fee:number;total:number;verified:boolean;status:TicketStatus;seller:string;created_at:string;poster?:string;reason?:string|null;has_proof?:boolean;booking_ref?:string;proof_path?:string}
export interface TicketOrder {id:string;status:'pending'|'paid'|'transferred'|'rejected';amount:number;fee:number;total:number;utr:string;note:string|null;created_at:string;ticket:Ticket|null;buyer?:string;buyer_name?:string;buyer_phone?:string;seller?:string}
export const tickets={
 market:(f:{category?:string;city?:string;q?:string;maxPrice?:number;quantity?:number})=>rpc<{fee_percent:number;upi_id:string;listings:Ticket[]}>('tickets_market',{p_category:f.category??'',p_city:f.city??'',p_q:f.q??'',p_max_price:f.maxPrice??0,p_quantity:f.quantity??0}),
 mine:()=>rpc<{listings:Ticket[];orders:TicketOrder[]}>('tickets_mine'),
 submit:(v:Record<string,unknown>)=>rpc<Ticket>('tickets_submit',v),
 update:(id:string,action:'price'|'cancel',price=0)=>rpc<Ticket>('tickets_update',{p_id:id,p_action:action,p_price:price}),
 buy:(id:string,utr:string,name:string,phone:string,coins=0)=>rpc<TicketOrder>('tickets_buy',{p_id:id,p_utr:utr,p_name:name,p_phone:phone,p_coins:coins}),
 adminPoster:(id:string,poster:string)=>rpc<Ticket>('tickets_admin_poster',{p_id:id,p_poster:poster}),
 adminList:()=>rpc<Ticket[]>('tickets_admin_list'),
 review:(id:string,decision:'approve'|'reject',reason:string,verified:boolean)=>rpc<Ticket>('tickets_admin_review',{p_id:id,p_decision:decision,p_reason:reason,p_verified:verified}),
 adminOrders:()=>rpc<TicketOrder[]>('tickets_admin_orders'),
 orderUpdate:(id:string,status:'paid'|'transferred'|'rejected',note='')=>rpc<TicketOrder>('tickets_admin_order_update',{p_id:id,p_status:status,p_note:note}),
};
export const TICKET_CATS:{value:TicketCat;label:string;icon:string}[]=[{value:'movies',label:'Movies',icon:'🎬'},{value:'events',label:'Events',icon:'🎉'},{value:'shows',label:'Shows',icon:'🎭'},{value:'sports',label:'Sports',icon:'🏏'},{value:'concerts',label:'Concerts',icon:'🎤'},{value:'theatre',label:'Theatre',icon:'🎭'},{value:'comedy',label:'Comedy',icon:'😂'},{value:'music',label:'Music',icon:'🎵'},{value:'festivals',label:'Festivals',icon:'🎆'},{value:'pops',label:'Pops',icon:'✨'},{value:'drinks',label:'Drinks',icon:'🥤'},{value:'amusement',label:'Amusement',icon:'🎡'}];
export const SOURCE_LABEL:Record<TicketSource,string>={bookmyshow:'BookMyShow',district:'District',other:'Other Platform'};
export const STATUS_LABEL:Record<TicketStatus,string>={pending_review:'Pending Review',listed:'Listed',reserved:'Reserved',sold:'Sold',rejected:'Rejected',cancelled:'Cancelled',expired:'Expired'};
export const ORDER_LABEL:Record<TicketOrder['status'],string>={pending:'Payment being verified',paid:'Paid · transfer in progress',transferred:'Transferred to you',rejected:'Payment not verified'};
