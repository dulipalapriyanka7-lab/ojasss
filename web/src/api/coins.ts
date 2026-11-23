import {rpc} from './client';
export interface CoinMove {id:string;user_id:string;username?:string;delta:number;balance:number;type:'game'|'business'|'one_chance'|'show'|'ticket'|'pub'|'game_unlock'|'refund'|'admin';ref:string;note:string;created_at:string}
export const coins={
 wallet:()=>rpc<{coins:number;rupees_per_coin:number;history:CoinMove[]}>('coins_wallet'),
 adminLedger:()=>rpc<{total_coins:number;ledger:CoinMove[]}>('coins_admin_ledger'),
 adjust:(username:string,amount:number,note:string)=>rpc<{username:string;coins:number}>('coins_admin_adjust',{p_username:username,p_coins:amount,p_note:note}),
};
export const coinTypeLabel:Record<CoinMove['type'],string>={game:'Game reward',business:'Business purchase',one_chance:'One Chance votes',show:'Premiere seats',ticket:'Ticket purchase',pub:'Pub event entry',game_unlock:'Gun unlock (game)',refund:'Refund',admin:'Admin adjustment'};
