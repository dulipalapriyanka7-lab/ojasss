import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { PostCard } from '@/api';
import {MemoryRouter} from 'react-router-dom';
vi.mock('@/components/feed/FeedItem', ()=>({FEED_WINDOW:2,FeedItem:({post,index,distance,onMediaEnded,onMediaPlaying,preloadNext}:{post:PostCard;index:number;distance:number;onMediaEnded:(id:string)=>void;onMediaPlaying:(id:string)=>void;preloadNext:boolean})=><section data-index={index} data-testid={post.id} data-active={distance===0} data-preload={preloadNext}><button onClick={()=>onMediaEnded(post.id)}>Finish {post.id}</button><button onClick={()=>onMediaPlaying(post.id)}>Play {post.id}</button></section>}));
import { VideoFeed } from '@/components/feed/VideoFeed';
const scrollTo=vi.fn(function(this:HTMLElement,options:ScrollToOptions){this.scrollTop=Number(options.top);this.dispatchEvent(new Event('scroll'));});
const post=(id:string,kind='video')=>({id,kind,category:'entertainment',created_at:new Date().toISOString()} as PostCard);
const query=(items:PostCard[])=>({data:{pages:[items]},isPending:false,isError:false,hasNextPage:false,isFetchingNextPage:false,isFetchNextPageError:false,fetchNextPage:vi.fn(),refetch:vi.fn()} as unknown as ComponentProps<typeof VideoFeed>['query']);
const open=(autoScroll=false,items=[post('first'),post('second')])=>render(<VideoFeed query={query(items)} autoScroll={autoScroll} emptyTitle="Empty" emptyDescription="Empty"/>);
beforeEach(()=>{vi.useFakeTimers();scrollTo.mockClear();Object.defineProperty(HTMLElement.prototype,'clientHeight',{configurable:true,get:()=>600});HTMLElement.prototype.scrollTo=scrollTo as unknown as HTMLElement['scrollTo'];vi.stubGlobal('matchMedia',()=>({matches:false}));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe('reel scrolling',()=>{
 it('shows no create-post prompt in the empty One Chance feed',()=>{
  render(<MemoryRouter><VideoFeed query={query([])} viralOnly emptyTitle="No Viral videos yet" emptyDescription="Only Viral videos appear here after 10 Fires and 10 Shares."/></MemoryRouter>);
  expect(screen.getByText('No Viral videos yet')).toBeVisible();expect(screen.queryByRole('link',{name:'Create a post'})).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Home'})).toHaveAttribute('href','/');
 });
 it('excludes cached nonviral videos and posters from One Chance',()=>{
  const viral={...post('viral'),is_viral:true,one_chance_ready:true,status:'published'} as PostCard;
  const poster={...post('poster','poster'),is_viral:true,status:'published'} as PostCard;
  render(<VideoFeed query={query([post('ordinary'),poster,viral])} viralOnly emptyTitle="Empty" emptyDescription="Empty"/>);
  expect(screen.getByTestId('viral')).toBeVisible();expect(screen.queryByTestId('ordinary')).not.toBeInTheDocument();expect(screen.queryByTestId('poster')).not.toBeInTheDocument();
 });
 it('does not advance when auto-scroll is off',()=>{open();fireEvent.click(screen.getByRole('button',{name:'Finish first'}));act(()=>vi.advanceTimersByTime(1000));expect(scrollTo).not.toHaveBeenCalled();});
 it('advances one full slide after the current video ends',()=>{open(true);fireEvent.click(screen.getByRole('button',{name:'Finish first'}));expect(scrollTo).toHaveBeenCalledWith({top:600,behavior:'smooth'});act(()=>vi.advanceTimersByTime(20));expect(screen.getByTestId('second')).toHaveAttribute('data-active','true');});
 it('waits for a dialog to close before advancing',()=>{open(true);const modal=document.createElement('div');modal.setAttribute('role','dialog');document.body.append(modal);fireEvent.click(screen.getByRole('button',{name:'Finish first'}));expect(scrollTo).not.toHaveBeenCalled();modal.remove();act(()=>vi.advanceTimersByTime(250));expect(scrollTo).toHaveBeenCalledTimes(1);});
 it('updates the active slide during a manual swipe and warms the next one',()=>{open(false,[post('first'),post('second'),post('third')]);const feed=screen.getByLabelText(/Feed\. Swipe/);feed.scrollTop=600;fireEvent.scroll(feed);act(()=>vi.advanceTimersByTime(20));expect(screen.getByTestId('second')).toHaveAttribute('data-active','true');expect(screen.getByTestId('third')).toHaveAttribute('data-preload','false');fireEvent.click(screen.getByRole('button',{name:'Play second'}));expect(screen.getByTestId('third')).toHaveAttribute('data-preload','true');fireEvent.click(screen.getByRole('button',{name:'Finish first'}));expect(scrollTo).not.toHaveBeenCalled();});
 it('shows posters for eight seconds before auto advancing',()=>{open(true,[post('first','poster'),post('second')]);act(()=>vi.advanceTimersByTime(7999));expect(scrollTo).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(1));expect(scrollTo).toHaveBeenCalledTimes(1);});
 it('does not advance a background tab',()=>{open(true);Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});fireEvent.click(screen.getByRole('button',{name:'Finish first'}));act(()=>vi.advanceTimersByTime(1000));expect(scrollTo).not.toHaveBeenCalled();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});act(()=>vi.advanceTimersByTime(250));expect(scrollTo).toHaveBeenCalledTimes(1);});
});

