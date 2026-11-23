import {rpc} from './client';

export type ChallengeStatus = 'not_started'|'in_progress'|'submitted'|'under_review'|'completed'|'rejected'|'expired';
export const challengeStatus: Record<ChallengeStatus, string> = {
  not_started:'Not started',in_progress:'In progress',submitted:'Submitted',under_review:'Under review',
  completed:'Completed',rejected:'Rejected',expired:'Expired',
};
export interface ChallengeBanner {
  id?: string; name:string; category:string; start:string; end:string; starts_at:string; ends_at:string;
  schedule:string; min_prize:number; max_prize:number; public:boolean; override:'schedule'|'closed'; status:'upcoming'|'live'|'closed';
}
export interface ChallengeTask {
  id?: string; title:string; description:string; category:string; type:'upload'|'original'|'engagement'; target:number;
  start:string; end:string; repeat:'once'|'daily'|'days'|'weekly'; days:number[];
  status:'draft'|'active'|'paused'|'archived'; audience:'selected'|'category'|'combined';
  users:string[]; manual_users:string[]; automatic:boolean; include_new:boolean; manual_review:boolean;
  banner_id?:string;
}
export interface ChallengeAssignment {
  task_id:string;
  id:string; title:string; description:string; starts_at:string; deadline:string; created_at:string; status:ChallengeStatus;
  progress:number; target:number; category_label:string; type:ChallengeTask['type']; username?:string;
  removed?:boolean; review_reason?:string;
  submissions?: {id:string;title:string;status:string}[];
}
export interface ChallengeUser {id:string;username:string;display_name?:string;avatar_path?:string|null;eligible:boolean;selected:boolean;categories:string[]}
export const challengeApi = {
  public:(week?:string)=>rpc<{banner:ChallengeBanner|null;tasks:ChallengeAssignment[];server_time:string}>('challenge_public',{week}),
  list:(offset:number,deleted=false)=>rpc<{tasks:ChallengeTask[];banners:ChallengeBanner[];counts:Record<'total'|'assigned'|'pending'|'completed'|'expired',number>}>('challenge_admin_list',{p_offset:offset,p_limit:20,deleted}),
  users:(input:Record<string,unknown>)=>rpc<{users:ChallengeUser[];total:number;eligible_count:number;additional_count:number}>('challenge_admin_users',input),
  save:(task:ChallengeTask)=>rpc<ChallengeTask>('challenge_admin_save',{...task}),
  banner:(banner:ChallengeBanner)=>rpc<ChallengeBanner>('challenge_admin_banner',{...banner}),
  remove:(id:string,permanent:boolean)=>rpc('challenge_admin_delete',{id,permanent}),
  assignments:(id:string|undefined,offset:number,userId?:string,deleted=false)=>rpc<{assignments:ChallengeAssignment[];counts:Record<string,number>;total:number}>('challenge_admin_assignments',{id,user_id:userId,p_offset:offset,p_limit:20,deleted}),
  review:(id:string,assignment:string,action:string,reason?:string,deadline?:string,target?:number)=>rpc('challenge_admin_review',{id,assignment,action,reason,deadline,target}),
};
