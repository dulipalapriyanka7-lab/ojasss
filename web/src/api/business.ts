import {rpc} from './client';
import type {Profile} from './types';

export type BizCategory='gold_silver'|'electronics'|'fashion'|'food_kitchen'|'education'|'refurbished'|'real_estate'|'daily_needs';
export interface BizMe {account_type:'personal'|'business'|null;business_status:'pending'|'approved'|'rejected'|null;business_name:string|null;business_category:BizCategory|null;business_city:string|null}
export interface BizProduct {id:string;title:string;image_url:string;category:BizCategory;price:number;mrp:number;owner_id:string;deal_ends_at:string|null;city?:string|null;task_reward:number;task_members:number;status:'active'|'hidden';owner:{id:string;username:string;business_name:string;avatar_path:string|null}|null}
export type BizProfile=Profile&{business_name:string;business_category:BizCategory|null;business_city:string|null};
export interface BizOrder {id:string;user_id:string;username:string;product_id:string;title:string;amount:number;utr:string;name:string;phone:string;address:string;status:'pending'|'approved'|'rejected'|'delivered';note:string|null;created_at:string;product:{id:string;title:string;image_url:string}|null}
export interface BizTask {id:string;user_id:string;username:string;product_id:string;title:string;status:'active'|'completed';need:number;reward:number;progress:number;buyers:string[];created_at:string;completed_at?:string}
export interface BizHub {live:boolean;can_view:boolean;is_admin?:boolean;me:BizMe|null;products?:BizProduct[];profiles?:BizProfile[];my_products?:BizProduct[];upi_id?:string;coins?:number;my_orders?:BizOrder[];my_tasks?:BizTask[];referral_code?:string|null}
export interface BizAdmin {live:boolean;requests:(BizProfile&{business_status:string;requested_at:string|null})[];products:BizProduct[]}

export const business={
 me:()=>rpc<BizMe>('business_me'),
 setAccountType:(p:{type:'personal'|'business'|'realestate';businessName?:string;category?:BizCategory;city?:string})=>rpc<BizMe>('business_set_account_type',{p_type:p.type,p_business_name:p.businessName??'',p_category:p.category??'',p_city:p.city??''}),
 hub:()=>rpc<BizHub>('business_hub'),
 adminList:()=>rpc<BizAdmin>('business_admin_list'),
 review:(userId:string,approve:boolean)=>rpc('business_admin_review',{p_user_id:userId,p_approve:approve}),
 updateBusiness:(userId:string,p:{name:string;category:BizCategory;city:string})=>rpc('business_admin_update',{p_user_id:userId,p_business_name:p.name,p_category:p.category,p_city:p.city}),
 deleteBusiness:(userId:string)=>rpc('business_admin_delete',{p_user_id:userId}),
 setLive:(live:boolean)=>rpc<{live:boolean}>('business_admin_set_live',{p_live:live}),
 saveProduct:(product:Partial<BizProduct>)=>rpc<BizProduct>('business_admin_save_product',{product}),
 takeTask:(productId:string)=>rpc<BizTask>('business_task_take',{p_product_id:productId}),
 adminTasks:()=>rpc<BizTask[]>('business_admin_tasks'),
 order:(o:{productId:string;coins?:number;utr:string;name:string;phone:string;address:string;taskId?:string})=>rpc<BizOrder>('business_order_submit',{p_task_id:o.taskId??'',p_product_id:o.productId,p_coins:o.coins??0,p_utr:o.utr,p_name:o.name,p_phone:o.phone,p_address:o.address}),
 adminOrders:()=>rpc<BizOrder[]>('business_admin_orders'),
 updateOrder:(id:string,status:BizOrder['status'],note='')=>rpc<BizOrder>('business_admin_order_update',{p_id:id,p_status:status,p_note:note}),
 deleteProduct:(id:string)=>rpc('business_admin_delete_product',{p_id:id}),
};
