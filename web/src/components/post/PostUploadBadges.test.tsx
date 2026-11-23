import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {PostUploadBadges} from './PostUploadBadges';
import type {PostCard} from '@/api';
afterEach(cleanup);
it('labels new content separately from Copy-Paste',()=>{render(<PostUploadBadges post={{content_origin:'new_content',category:'entertainment',created_at:'2026-10-30T00:00:00Z'} as PostCard}/>);expect(screen.getByText('New Content')).toBeVisible();expect(screen.queryByText('Copy-Paste')).not.toBeInTheDocument();});
it('keeps the expiry visible beside a Copy-Paste label',()=>{render(<PostUploadBadges post={{content_origin:'copy_paste',category:'news',created_at:new Date().toISOString()} as PostCard}/>);expect(screen.getByText('Copy-Paste')).toBeVisible();expect(screen.getByLabelText('Time remaining')).toHaveTextContent('left');});
