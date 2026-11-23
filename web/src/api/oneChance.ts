import {rpc} from './client';

export type Placement = 'featured' | 'boost' | 'top';
export interface OneChancePackage {id:string;name:string;price_paise:number;duration_days:number;placement:Placement;position:number;description:string;active:boolean;sort_order:number;}
export interface OneChanceRequest {id:string;user_id:string;post_id?:string;created_at:string;status:'awaiting_payment'|'pending_review'|'approved'|'rejected'|'cancelled';amount_paise:number;duration_days:number;upi_id:string;receipt_path:string|null;utr:string|null;reason:string|null;starts_at?:string;ends_at?:string;package_id?:string;package_name?:string;placement?:Placement;position?:number;username?:string;display_name?:string;}
export interface OneChanceStatus {eligible:boolean;voting_until?:string|null;membership:{starts_at:string;ends_at:string;package_name?:string;placement?:Placement;position?:number}|null;occupied_positions:number[];upi_id:string;coins?:number;packages:OneChancePackage[];requests:OneChanceRequest[];}
export const oneChance={
  status:(postId?:string)=>rpc<OneChanceStatus>('one_chance_status',{p_post_id:postId}),
  request:(packageId:string,postId?:string)=>rpc<OneChanceRequest>('one_chance_request',{p_package_id:packageId,p_post_id:postId}),
  submit:(id:string,path:string,utr:string)=>rpc<OneChanceRequest>('one_chance_submit',{p_request_id:id,p_receipt_path:path,p_utr:utr}),
  payCoins:(id:string)=>rpc<OneChanceRequest>('one_chance_pay_coins',{p_request_id:id}),
  cancel:(id:string)=>rpc<OneChanceRequest>('one_chance_cancel',{p_request_id:id}),
  adminRequests:(offset=0)=>rpc<OneChanceRequest[]>('admin_one_chance_requests',{p_limit:25,p_offset:offset}),
  adminPackages:()=>rpc<OneChancePackage[]>('admin_one_chance_packages'),
  savePackage:(item:OneChancePackage)=>rpc<OneChancePackage>('admin_save_one_chance_package',{p_id:item.id,p_name:item.name,p_description:item.description,p_price_paise:item.price_paise,p_duration_days:item.duration_days,p_placement:item.placement,p_position:item.position,p_active:item.active,p_sort_order:item.sort_order}),
  review:(id:string,decision:'approve'|'reject',reason:string,utr:string,verified:boolean)=>rpc<OneChanceRequest>('admin_one_chance_review',{p_request_id:id,p_decision:decision,p_reason:reason,p_verified_utr:utr,p_verified:verified}),
};
