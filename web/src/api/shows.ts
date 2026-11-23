import {rpc} from './client';

export type SeatSource = 'bookmyshow' | 'district' | 'other' | 'admin';
export interface ShowRow {r: string; blocks: [number, number][]}
export interface ShowSection {key: string; name: string; price: number; rows: ShowRow[]}
export interface Show {id: string; title: string; language: string; format: string; runtime: string; poster: string; theatre: string; city: string; starts_at: string; status: 'open' | 'closed'; tag: string; sections: ShowSection[]}
export interface ShowOrder {id: string; show_id: string; seats: string[]; amount: number; coins: number; upi_amount: number; status: 'held' | 'pending' | 'confirmed' | 'rejected' | 'expired' | 'cancelled'; utr: string | null; expires_at: string; created_at: string; note: string | null; name?: string; phone?: string; username?: string}
/** seat id → 'sold' | 'held' | 'mine' | 'b:<source>' */
export type SeatStates = Record<string, string>;

export const SHOW_ID = 'muta-mestri-alankar';
export const shows = {
  get: (id = SHOW_ID) => rpc<{show: Show; seats: SeatStates; upi_id: string; now: string; my_orders: ShowOrder[]}>('show_get', {p_id: id}),
  hold: (seats: string[], id = SHOW_ID) => rpc<ShowOrder>('show_hold', {p_id: id, p_seats: seats}),
  pay: (order: string, v: {utr: string; name: string; phone: string; coins: number}, id = SHOW_ID) => rpc<ShowOrder>('show_pay', {p_id: id, p_order: order, p_utr: v.utr, p_name: v.name, p_phone: v.phone, p_coins: v.coins}),
  ticket: (order: string, id = SHOW_ID) => rpc<{order: ShowOrder; show: Show; booking_ref: string; qr: string | null; checked_in: string | null}>('show_ticket', {p_id: id, p_order: order}),
  adminVerify: (token: string, checkIn: boolean, id = SHOW_ID) => rpc<{ok: boolean; already_checked_in: boolean; checked_in: string | null; order: ShowOrder; booking_ref: string}>('show_admin_verify', {p_id: id, p_token: token, p_check_in: checkIn}),
  cancel: (order: string, id = SHOW_ID) => rpc<ShowOrder>('show_cancel', {p_id: id, p_order: order}),
  adminGet: (id = SHOW_ID) => rpc<{show: Show; blocked: Record<string, SeatSource>; taken: Record<string, string>; orders: ShowOrder[]}>('show_admin_get', {p_id: id}),
  adminSave: (v: {title?: string; starts_at?: string; status?: 'open' | 'closed'; prices?: Record<string, number>}, id = SHOW_ID) => rpc<Show>('show_admin_save', {p_id: id, p_title: v.title, p_starts_at: v.starts_at, p_status: v.status, p_prices: v.prices}),
  adminBlock: (seats: string[], source: SeatSource | '', id = SHOW_ID) => rpc<{blocked: Record<string, SeatSource>}>('show_admin_block', {p_id: id, p_seats: seats, p_source: source}),
  adminOrder: (order: string, status: 'confirmed' | 'rejected', note = '', id = SHOW_ID) => rpc<ShowOrder>('show_admin_order', {p_id: id, p_order: order, p_status: status, p_note: note}),
};
export const seatLabel = (id: string) => { const [, r, n] = id.split(':'); return r + n; };
export const SOURCE_NAME: Record<SeatSource, string> = {bookmyshow: 'BookMyShow', district: 'District', other: 'Other platform', admin: 'Reserved'};
