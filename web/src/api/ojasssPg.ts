import {rpc} from './client';
export interface OjasssPgStatus {name:string;provider:'youpi';status:'setup_pending'|'details_saved';gateway_url:string;merchant_id:string;secret_saved:boolean;saved_at:string|null;payments_active:false;}
export const ojasssPg={status:()=>rpc<OjasssPgStatus>('admin_ojasss_pg_status'),save:(data:{gateway_url:string;merchant_id:string;webhook_secret:string})=>rpc<OjasssPgStatus>('admin_ojasss_pg_save',data)};
