import {rpc} from './client';
import type {Category,Me,PostCard} from './types';
export interface Leaderboard {period:'weekly'|'monthly';start:string;end:string;closed:boolean;timezone:string;entries:{post:PostCard;votes:number;rank:number}[];}
export const discovery={
 savePreferences:(selected:Category[],showAll:boolean)=>rpc<Me>('save_category_preferences',{p_selected:selected,p_show_all:showAll}),
 vote:(postId:string)=>rpc<{votes_count:number;my_voted:boolean}>('vote_one_chance',{p_post_id:postId}),
 leaderboard:(period:'weekly'|'monthly',anchor?:string)=>rpc<Leaderboard>('one_chance_leaderboard',{p_period:period,p_anchor:anchor,p_limit:100}),
};
