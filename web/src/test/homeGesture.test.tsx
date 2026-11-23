vi.mock('@/hooks/usePostActions',()=>({usePublicSettings:()=>({data:{}})}));
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
vi.mock('@tanstack/react-query',()=>({useQuery: () => ({data:{}}), useInfiniteQuery:()=>({})}));
vi.mock('@/api',()=>({posts:{feed:vi.fn(),trending:vi.fn()},notifications:{unreadCounts:vi.fn()}}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({me:null})}));
vi.mock('@/lib/seo',()=>({useSeo:()=>{}}));
vi.mock('@/components/feed/CategoryWelcome',()=>({CategoryWelcome:()=>null}));
vi.mock('@/components/layout/AnnouncementBanner',()=>({AnnouncementBanner:()=>null}));
vi.mock('@/components/ui/Misc',()=>({Logo:()=>null,Segmented:()=>null}));
vi.mock('@/components/feed/VideoFeed',()=>({VideoFeed:({cleanView}:{cleanView:boolean})=><div data-clean-trigger><img alt="Test media"/><span>{cleanView?'plain media':'controls visible'}</span></div>}));
import HomePage from '@/pages/HomePage';

describe('Home long press',()=>{
  beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.stubGlobal('PointerEvent',MouseEvent);vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));});
  afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
  const open=()=>render(<MemoryRouter><HomePage/></MemoryRouter>);
  it('opens every category from the compact grid button and remembers the selected category',()=>{
    open();const trigger=screen.getByRole('button',{name:'Browse categories'});
    fireEvent.click(trigger);
    expect(screen.getByRole('navigation',{name:'Content categories'})).toBeInTheDocument();
    for(const label of ['One Chance','Entertainment','Business Promotion','Part Time · 48hrs','News Reporter · 48hrs','Public Complaint'])expect(screen.getByRole('button',{name:label})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Business Promotion'}));
    expect(trigger).toHaveAttribute('aria-expanded','false');
    act(()=>vi.advanceTimersByTime(400));fireEvent.click(trigger);
    expect(screen.getByRole('button',{name:'Business Promotion'})).toHaveAttribute('aria-pressed','true');
  });
  it('keeps filters compact and replaces the header menu with the leaderboard',()=>{
    open();expect(screen.queryByRole('button',{name:'Auto-scroll'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Home menu'})).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Leaderboard'})).toHaveAttribute('href','/leaderboard');
    expect(screen.getByRole('button',{name:'Choose feed'})).toHaveTextContent('For You');fireEvent.click(screen.getByRole('button',{name:'Choose feed'}));expect(screen.getByRole('link',{name:'Daily Hunt'})).toHaveAttribute('href','/challenges');expect(screen.getByRole('button',{name:'Country: All countries'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Done'}));
  });
  it('has no View button and hides controls only after a long press',()=>{
    open();expect(screen.queryByRole('button',{name:'View'})).toBeNull();
    const media=screen.getByAltText('Test media');
    fireEvent.pointerDown(media,{button:0,clientX:50,clientY:50});
    act(()=>vi.advanceTimersByTime(599));expect(screen.getByText('controls visible')).toBeInTheDocument();
    act(()=>vi.advanceTimersByTime(1));expect(screen.getByText('plain media')).toBeInTheDocument();
    fireEvent.pointerUp(media);fireEvent.click(media);expect(screen.getByText('plain media')).toBeInTheDocument();
    fireEvent.pointerDown(media,{button:0});fireEvent.pointerUp(media);fireEvent.click(media);
    expect(screen.getByText('controls visible')).toBeInTheDocument();
  });
  it('does not hide controls when the user scrolls or makes a short tap',()=>{
    open();const media=screen.getByAltText('Test media');
    fireEvent.pointerDown(media,{button:0,clientX:50,clientY:50});fireEvent.pointerMove(media,{clientX:50,clientY:80});
    act(()=>vi.advanceTimersByTime(700));expect(screen.getByText('controls visible')).toBeInTheDocument();
    fireEvent.pointerDown(media,{button:0});fireEvent.pointerUp(media);act(()=>vi.advanceTimersByTime(700));
    expect(screen.getByText('controls visible')).toBeInTheDocument();
  });
  it('supports keyboard access and Escape restores navigation',()=>{
    open();fireEvent.keyDown(window,{key:'v'});expect(screen.getByText('plain media')).toBeInTheDocument();
    expect(document.documentElement.dataset.cleanView).toBe('true');
    fireEvent.keyDown(window,{key:'Escape'});expect(screen.getByText('controls visible')).toBeInTheDocument();
    expect(document.documentElement.dataset.cleanView).toBeUndefined();
  });
});
