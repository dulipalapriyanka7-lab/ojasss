import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COUNTRIES, LANGUAGES } from '@/lib/constants';
vi.mock('@/components/ui/Overlay',()=>({Dialog:({open,children}:{open:boolean;children:React.ReactNode})=>open?<div>{children}</div>:null}));
import { RegionPicker } from '@/components/ui/RegionPicker';
afterEach(cleanup);
describe('global country and language choices',()=>{
  it('includes global countries and all ISO language entries',()=>{
    expect(COUNTRIES).toHaveLength(249);expect(LANGUAGES.length).toBeGreaterThan(7800);
    expect(COUNTRIES.find(c=>c.value==='IN')?.label).toBe('India');
    expect(LANGUAGES.find(l=>l.value==='te')?.label).toContain('Telugu');
    expect(LANGUAGES.find(l=>l.value==='aaa')?.label).toBeTruthy();
  });
  it('searches languages beyond the initial visible list and supports keyboard selection',()=>{
    const select=vi.fn();render(<RegionPicker label="Language" value="" onChange={select} options={LANGUAGES} emptyLabel="All languages"/>);
    fireEvent.click(screen.getByRole('button',{name:'Language: All languages'}));
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Telugu'}});
    const option=screen.getByRole('option',{name:/Telugu/});fireEvent.click(option);expect(select).toHaveBeenCalledWith('te');
  });
  it('allows resetting the feed to all languages',()=>{
    const select=vi.fn();render(<RegionPicker label="Language" value="te" onChange={select} options={LANGUAGES} emptyLabel="All languages"/>);
    fireEvent.click(screen.getByRole('button',{name:/Language:.*Telugu/}));fireEvent.click(screen.getByRole('option',{name:'All languages'}));expect(select).toHaveBeenCalledWith('');
  });
});
