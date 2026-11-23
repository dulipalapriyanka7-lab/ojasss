import {rpc} from './client';

export type ReKind = 'house' | 'apartment' | 'villa' | 'plot' | 'commercial' | 'pg';
export type ReDeal = 'rent' | 'sale' | 'lease';
export interface ReAgent {id: string; name: string; agency: string; city: string; photo: string; phone: string; whatsapp: string; about?: string; listings?: number; status?: 'pending' | 'verified' | 'rejected'; username?: string; user_id?: string}
export interface ReListing {id: string; title: string; kind: ReKind; deal: ReDeal; address: string; area: string; city: string; lat: number | null; lng: number | null; bhk: string; baths: number; sqft: number; price: number; price_unit: 'month' | 'total'; furnishing: 'unfurnished' | 'semi' | 'furnished'; amenities: string[]; about: string; photos: string[]; created_at: string; approved_at?: string; owner_name: string; owner_role: 'owner' | 'agent'; market?: 'available' | 'sold' | 'rented'; agent: Pick<ReAgent, 'id' | 'name' | 'agency' | 'city' | 'photo'> | null;
  status?: 'pending' | 'approved' | 'rejected' | 'removed'; reward?: 'pending' | 'credited' | 'rejected'; reward_paise?: number; reason?: string | null; duplicate_of?: string | null; phone?: string; proof?: string; username?: string; user_id?: string}
export interface ReEnquiry {id: string; listing_id: string; title: string; username: string; to: string; note: string; created_at: string}

export const realestate = {
  home: (city = '') => rpc<{listings: ReListing[]; agents: ReAgent[]; saved: string[]; cities: string[]; reward_rupees: number; me_agent: ReAgent | null}>('re_home', {p_city: city}),
  contact: (id: string) => rpc<{name: string; phone: string; whatsapp: string; address: string}>('re_contact', {p_id: id}),
  save: (id: string) => rpc<{saved: boolean}>('re_save', {p_id: id}),
  submit: (v: Record<string, unknown>) => rpc<ReListing>('re_submit', v),
  mark: (id: string, market: 'available' | 'sold' | 'rented') => rpc<ReListing>('re_mark', {p_id: id, p_market: market}),
  mine: () => rpc<{listings: ReListing[]; agent: ReAgent | null}>('re_mine'),
  agentApply: (v: Record<string, unknown>) => rpc<ReAgent>('re_agent_apply', v),
  adminGet: () => rpc<{listings: ReListing[]; agents: ReAgent[]; enquiries: ReEnquiry[]; reward_paise: number; rewards: ReListing[]}>('re_admin_get'),
  adminListing: (id: string, action: 'approve' | 'reject' | 'remove', o: {reason?: string; verified?: boolean; reward?: boolean} = {}) => rpc<ReListing>('re_admin_listing', {p_id: id, p_action: action, p_reason: o.reason ?? '', p_verified: o.verified ?? false, p_reward: o.reward ?? false}),
  adminAgent: (id: string, status: 'verified' | 'rejected' | 'pending') => rpc<ReAgent>('re_admin_agent', {p_id: id, p_status: status}),
  adminReward: (paise: number) => rpc<{reward_paise: number}>('re_admin_reward', {p_reward_paise: paise}),
};
export const KIND_LABEL: Record<ReKind, string> = {house: 'Independent House', apartment: 'Apartment', villa: 'Villa', plot: 'Plot', commercial: 'Commercial', pg: 'PG / Hostel'};
export const inrShort = (n: number, unit: 'month' | 'total') => {
  if (unit === 'month') return '₹' + n.toLocaleString('en-IN');
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.00$/, '') + ' Lakhs';
  return '₹' + n.toLocaleString('en-IN');
};
