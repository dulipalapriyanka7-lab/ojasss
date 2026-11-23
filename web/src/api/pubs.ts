import {rpc} from './client';

export type PubType = 'live_music' | 'dj' | 'standup' | 'pub_show' | 'special';
export type PubMenuCat = 'mocktails' | 'soft_drinks' | 'juices' | 'coffee_tea' | 'snacks' | 'starters' | 'combos' | 'beverages';
export type PubState = 'on_sale' | 'sold_out' | 'ended' | 'coming_soon' | 'booking_closed' | 'draft' | 'cancelled' | 'published';
export interface PubVenue {id: string; name: string; city: string; area: string; address: string; phone: string; hours: string; rules: string; about?: string; logo: string; photo: string; status?: 'draft' | 'published'}
export interface PubEvent {id: string; venue_id: string; title: string; host: string; about: string; rules: string; policy: string; ticket_name: string; type: PubType; age: 'all' | '18' | '21' | '25'; cover: string; starts_at: string; ends_at: string; book_from: string | null; book_until: string | null; capacity: number; price: number; sold: number; status: 'draft' | 'published' | 'cancelled'; state: PubState; left: number; venue: PubVenue | null}
export interface PubMenuItem {id: string; venue_id: string; category: PubMenuCat; name: string; about: string; price: number; image: string; available: boolean; age_restricted: boolean; status: 'draft' | 'published'}
export interface PubBooking {id: string; ref: string; event_id: string; title: string; qty: number; amount: number; coins: number; upi_amount: number; utr: string | null; name: string; phone: string; username: string; status: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'attended'; note: string | null; created_at: string}

export const pubs = {
  list: () => rpc<{events: PubEvent[]; venues: PubVenue[]; menu: PubMenuItem[]; upi_id: string}>('pubs_list'),
  event: (id: string) => rpc<{event: PubEvent; menu: PubMenuItem[]; my_bookings: PubBooking[]; upi_id: string}>('pubs_event', {p_id: id}),
  book: (id: string, v: {qty: number; utr: string; name: string; phone: string; coins: number; ageOk: boolean}) => rpc<PubBooking>('pubs_book', {p_id: id, p_qty: v.qty, p_utr: v.utr, p_name: v.name, p_phone: v.phone, p_coins: v.coins, p_age_ok: v.ageOk}),
  adminGet: () => rpc<{venues: PubVenue[]; events: PubEvent[]; menu: PubMenuItem[]; bookings: PubBooking[]}>('pubs_admin_get'),
  saveVenue: (v: Record<string, unknown>) => rpc<PubVenue>('pubs_admin_venue', v),
  saveEvent: (v: Record<string, unknown>) => rpc<PubEvent>('pubs_admin_event', v),
  saveMenu: (v: Record<string, unknown>) => rpc<PubMenuItem>('pubs_admin_menu', v),
  booking: (id: string, status: 'confirmed' | 'rejected' | 'attended', note = '') => rpc<PubBooking>('pubs_admin_booking', {p_id: id, p_status: status, p_note: note}),
};

export const PUB_TYPES: {value: PubType; label: string}[] = [
  {value: 'live_music', label: 'Live Music'}, {value: 'dj', label: 'DJ Nights'}, {value: 'standup', label: 'Stand-up Comedy'},
  {value: 'pub_show', label: 'Pub Shows'}, {value: 'special', label: 'Special Events'},
];
export const PUB_MENU: {value: PubMenuCat; label: string}[] = [
  {value: 'mocktails', label: 'Mocktails'}, {value: 'soft_drinks', label: 'Soft Drinks'}, {value: 'juices', label: 'Juices'},
  {value: 'coffee_tea', label: 'Coffee & Tea'}, {value: 'snacks', label: 'Snacks'}, {value: 'starters', label: 'Starters'},
  {value: 'combos', label: 'Food Combos'}, {value: 'beverages', label: 'Beverages (venue-permitted)'},
];
export const PUB_DRINKS: PubMenuCat[] = ['mocktails', 'soft_drinks', 'juices', 'coffee_tea', 'beverages'];
export const pubCover = (e: Pick<PubEvent, 'cover' | 'type'>) => e.cover || `/assets/tickets/pubs/cover-${e.type.replace('_', '-')}.svg`;
export const PUB_STATE: Record<string, string> = {on_sale: 'Booking open', sold_out: 'Sold out', ended: 'Ended', coming_soon: 'Booking opens soon', booking_closed: 'Booking closed', cancelled: 'Cancelled', draft: 'Draft'};
export const AGE_LABEL: Record<PubEvent['age'], string> = {all: 'All ages', '18': '18+', '21': '21+', '25': '25+'};
