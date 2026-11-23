import {rpc} from './client';
export interface CompetitionEntry{user_id:string;username:string;display_name:string;avatar_path:string|null;votes:number;views:number;viral:number;seconds:number;video_count:number;rank:number;target:number;qualified:boolean;post_id:string}
export interface Competition{id:string;start:string;end:string;status:string;config:{targets:number[];timezone:string;rank_mode?:'videos'|'votes';vote_targets?:number[]};challenges?:string[]}
export interface CompetitionPrizeResults {
  id: string;
  end: string;
  winners: {
    rank: number;
    username: string;
    display_name: string;
    avatar_path: string | null;
    amount_paise: number | null;
  }[];
}
export interface CompetitionResult{competition:Competition;entries:CompetitionEntry[];locked:boolean;top_groups?:Record<string,CompetitionEntry[]>;tier_counts?:Record<string,number>;remaining_preview?:CompetitionEntry[];viewer_active_seconds?:number;total_count?:number;my_rank?:number|null;totals?:{votes:number;views:number;viral:number;active_users:number};server_time?:string;prize_results?:CompetitionPrizeResults|null}
export const competition={live:(id?:string)=>rpc<CompetitionResult>('competition_live',{competition_id:id,p_limit:100,include_prizes:true}),history:(id?:string)=>rpc<{competition:Competition;entry:CompetitionEntry|null;videos?:import('@/api').PostCard[];has_results?:boolean}[]>('competition_history',{user_id:id,include_challenges:true,p_limit:100})};
