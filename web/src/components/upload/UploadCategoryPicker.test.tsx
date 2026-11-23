import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('@/components/ui/Overlay',()=>({Dialog:({open,children}:{open:boolean;children:React.ReactNode})=>open?<div role="dialog">{children}</div>:null}));
const { usePublicSettings } = vi.hoisted(() => ({
  usePublicSettings: vi.fn(() => ({data: undefined as object | undefined})),
}));
vi.mock('@/hooks/usePostActions', () => ({usePublicSettings}));
import {UploadCategoryPicker} from './UploadCategoryPicker';
afterEach(() => {
  cleanup();
  usePublicSettings.mockClear();
});
it('opens category choices only on request and excludes direct One Chance uploads',()=>{const change=vi.fn();render(<UploadCategoryPicker value="entertainment" onChange={change}/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Category * Entertainment'}));expect(screen.queryByRole('button',{name:/One Chance/})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/News Reporter/}));expect(change).toHaveBeenCalledWith('news');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();});
it('explains the timed category without changing the selected value',()=>{render(<UploadCategoryPicker value="part_time_jobs" onChange={vi.fn()}/>);expect(screen.getByText('Visible for 48 hours after publishing.')).toBeVisible();expect(screen.getByText('48h')).toBeVisible();});

it('hides the weekly winners option when it occupies the Technology category', () => {
  usePublicSettings.mockReturnValue({
    data: {'categories.config': {technology: {label: 'One chance weekly winners Viral Videos', enabled: true}}},
  });
  render(<UploadCategoryPicker value="entertainment" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', {name: 'Category * Entertainment'}));
  expect(screen.queryByRole('button', {name: /weekly winners/i})).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Horror Stories'})).toBeVisible();
});

