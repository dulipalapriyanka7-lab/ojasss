import {rpc} from './client';
export type DemoVideo={id:string;category:string;lang:'en'|'te';title:string;media_path:string;thumbnail_path:string|null;duration:number;sort:number;active:boolean;created_at:string};
export const demo={
 list:()=>rpc<DemoVideo[]>('demo_videos'),
 adminList:()=>rpc<DemoVideo[]>('demo_admin_list'),
 save:(v:Partial<DemoVideo>)=>rpc<DemoVideo>('demo_admin_save',v),
 remove:(id:string)=>rpc('demo_admin_delete',{id}),
};
