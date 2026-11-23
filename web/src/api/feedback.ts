import {rpc} from './client';
export type FbCat = 'suggestion' | 'feature' | 'bug' | 'complaint' | 'other';
export type FbStatus = 'new' | 'review' | 'resolved' | 'closed';
export interface Feedback {id: string; ref: string | null; category: FbCat; subject: string; message: string; attachment_path: string | null; status: FbStatus; created_at: string; updated_at: string; user_id?: string; username?: string; display_name?: string; admin_notes?: string; assigned_to?: string | null}
export const feedback = {
  submit: (v: {category: FbCat; subject: string; message: string; attachment: string}) => rpc<{ok: boolean; ref: string}>('feedback_submit', {p_category: v.category, p_subject: v.subject, p_message: v.message, p_attachment: v.attachment}),
  mine: () => rpc<Feedback[]>('feedback_mine'),
  adminList: (status = '', q = '') => rpc<{items: Feedback[]; counts: Record<FbStatus, number>; total: number}>('feedback_admin_list', {p_status: status, p_q: q}),
  adminUpdate: (id: string, v: {status?: FbStatus; notes?: string; assignMe?: boolean}) => rpc<Feedback>('feedback_admin_update', {p_id: id, ...(v.status ? {p_status: v.status} : {}), ...(v.notes !== undefined ? {p_notes: v.notes} : {}), p_assign_me: v.assignMe ?? false}),
};
export const FB_CATS: {v: FbCat; l: string}[] = [{v: 'suggestion', l: 'Suggestion'}, {v: 'feature', l: 'Feature Request'}, {v: 'bug', l: 'Bug Report'}, {v: 'complaint', l: 'Complaint'}, {v: 'other', l: 'Other'}];
export const FB_STATUS: Record<FbStatus, string> = {new: 'New', review: 'Under Review', resolved: 'Resolved', closed: 'Closed'};
