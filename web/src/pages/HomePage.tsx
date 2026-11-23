import {configuredCategories} from '@/hooks/useCategories';
import './my-city.css';
import './tickets.css';
import {homeControl} from '@/lib/homeControls';
import {platform} from '@/lib/platform';
import {Dialog} from '@/components/ui/Overlay';
import {Select} from '@/components/ui/Field';
import { ChevronRight, Flame, Trophy, Search, Bell, LayoutGrid, Ticket, Building2, Wine } from 'lucide-react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { usePublicSettings } from '@/hooks/usePostActions';
import { orderedItems } from '@/lib/layoutOrder';
import { posts, notifications, type PostCard } from '@/api';
import { VideoFeed } from '@/components/feed/VideoFeed';
import { AnnouncementHeaderIcon } from '@/components/layout/AnnouncementBanner';
import { Segmented } from '@/components/ui/Misc';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/lib/seo';
import { COUNTRIES, LANGUAGES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useAutoScroll } from '@/lib/feedPreferences';
import { RegionPicker } from '@/components/ui/RegionPicker';

type Mode = 'for_you' | 'following' | 'trending';
const PAGE = 8;

export default function HomePage({onStartup}:{onStartup?:(phase:'preparing'|'feed'|'ready'|'error')=>void}={}) {
  const { me, loading:authLoading } = useAuth();
  const navigate=useNavigate();
  const {postId:sharedPostId}=useParams();
  const shared=useQuery({queryKey:['post',sharedPostId,me?.id??'anon'],queryFn:()=>posts.get(sharedPostId!),enabled:!!sharedPostId,staleTime:30000});
  const unread=useQuery({queryKey:['unread'],queryFn:notifications.unreadCounts,enabled:!!me,staleTime:15000,refetchInterval:60000});
  const settingsQuery=usePublicSettings();
  const layoutSettings=settingsQuery.data;
  const show=(key:Parameters<typeof homeControl>[1])=>homeControl(layoutSettings,key);
  const categories=orderedItems(configuredCategories(layoutSettings).filter(c=>!(c as {picker_hidden?:boolean}).picker_hidden),layoutSettings?.['layout.category_order']);
  const autoScroll=useAutoScroll();

  const [filtersOpen,setFiltersOpen]=useState(false);
  const [categoriesOpen,setCategoriesOpen]=useState(false);
  const [mode, setMode] = useState<Mode>('for_you');
  const [params, setParams] = useSearchParams();
  const category = categories.find(c => c.value === params.get('category'))?.value ?? null;
  const countryValue=params.has('country')?params.get('country'):me?.country;
  const country=COUNTRIES.some(c=>c.value===countryValue)?countryValue!:null;
  const language=LANGUAGES.some(l=>l.value===params.get('language'))?params.get('language'):null;
  const filter=(key:string,value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set(key,value);else next.delete(key);return next;});
  const [cleanView, setCleanView] = useState(false);
  const header=useRef<HTMLElement>(null);
  const [headerHeight,setHeaderHeight]=useState(0);
  useLayoutEffect(()=>{
    const el=header.current;if(!el)return;
    const measure=()=>setHeaderHeight(el.getBoundingClientRect().bottom);measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();
  },[cleanView]);
  const root = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({x:0,y:0});
  const suppressClick = useRef(false);
  const cancelHold = () => { if (hold.current !== null) { clearTimeout(hold.current); hold.current = null; } };
  useEffect(() => () => { if (hold.current !== null) clearTimeout(hold.current); }, []);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'v' && !(e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable]'))) {e.preventDefault();setCleanView(v=>!v);} };
    window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard);
  }, []);
  useEffect(() => {
    if (!cleanView) return;
    document.documentElement.dataset.cleanView = 'true';
    root.current?.focus();
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setCleanView(false); };
    window.addEventListener('keydown', escape);
    return () => { delete document.documentElement.dataset.cleanView; window.removeEventListener('keydown', escape); };
  }, [cleanView]);
  useSeo({ path: sharedPostId?'/post/'+sharedPostId:'/' });

  const [feedSeed]=useState(()=>crypto.randomUUID());
  const city=params.get('city');
  const query = useInfiniteQuery({
    queryKey: ['feed', feedSeed, mode, category, country, language, city, me?.id ?? 'anon',me?.category_preferences],
    queryFn: ({ pageParam }) =>
      category==='one_chance'?posts.feed({seed:feedSeed,mode:'for_you',category,country,language,limit:PAGE,offset:pageParam.offset}):mode === 'trending' ? posts.trending({category,language,country,limit:PAGE,offset:pageParam.offset}) : mode === 'for_you'
        ? posts.feed({ seed:feedSeed, mode, category, country, language, city, limit: PAGE, offset: pageParam.offset })
        : posts.feed({ mode, category, country, language, city, limit: PAGE, before: pageParam.before }),
    initialPageParam: { offset: 0, before: null as string | null },
    getNextPageParam: (last: PostCard[], all) =>
      last.length < PAGE ? undefined : { offset: all.flat().length, before: last[last.length - 1].created_at },
    enabled: !authLoading && (category==='one_chance'||mode !== 'following' || !!me),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const displayQuery=sharedPostId?({...query,isPending:shared.isPending,isError:shared.isError||(!shared.isPending&&!shared.data),error:shared.error??new Error('This shared video is unavailable or has expired.'),refetch:shared.refetch,data:shared.data?{pages:[[shared.data],...(query.data?.pages??[])],pageParams:[null,...(query.data?.pageParams??[])]}:undefined} as typeof query):query;
  useEffect(()=>{
    if(!onStartup)return;
    if(authLoading||settingsQuery.isPending)onStartup('preparing');
    else if(settingsQuery.isError&&!layoutSettings)onStartup('error');
    else if(displayQuery.isPending)onStartup('feed');
    else if(displayQuery.isError&&!sharedPostId&&!displayQuery.data)onStartup('error');
    else onStartup('ready');
  },[authLoading,settingsQuery.isPending,settingsQuery.isError,layoutSettings,displayQuery.isPending,displayQuery.isError,displayQuery.data,sharedPostId,onStartup]);
  useEffect(()=>{if(displayQuery.isPending)return;const frame=requestAnimationFrame(()=>platform.send({type:'ui_ready'}));return()=>cancelAnimationFrame(frame);},[displayQuery.isPending]);
  const tabs = [
    { value: 'for_you' as const, label: 'For You' },
    { value: 'following' as const, label: 'Respecting' },
    {value:'trending' as const,label:'Trending'},
  ];

  return (
    // The feed is a dark, media-first surface in both themes.
    <div ref={root} tabIndex={-1} data-theme="dark" aria-description="Long press a video or poster to hide controls. Tap to restore. Press V on a keyboard to toggle."
      style={{'--feed-height':cleanView?'var(--feed-viewport-height, 100svh)':`calc(var(--feed-viewport-height, 100svh) - ${headerHeight}px)`} as CSSProperties}
      className={cn('home-reels-feed bg-black text-fg outline-none', cleanView ? 'fixed inset-0 z-[250]' : 'relative md:bg-bg')}
      onPointerDown={(e) => {
        cancelHold();suppressClick.current=false;
        if (cleanView || e.button !== 0 || !(e.target as HTMLElement).closest('[data-clean-trigger]') || (e.target as HTMLElement).closest('button,a,input,textarea,[role=slider]')) return;
        suppressClick.current = false;start.current={x:e.clientX,y:e.clientY};
        hold.current=setTimeout(()=>{suppressClick.current=true;setCleanView(true);hold.current=null;},600);
      }}
      onPointerMove={(e)=>{if(Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>12)cancelHold();}}
      onPointerUp={cancelHold} onPointerCancel={cancelHold}
      onContextMenu={(e)=>{if((e.target as HTMLElement).closest('[data-clean-trigger]'))e.preventDefault();}}
      onClickCapture={(e) => {
        if(suppressClick.current){suppressClick.current=false;e.preventDefault();e.stopPropagation();return;}
        if(cleanView){e.preventDefault();e.stopPropagation();setCleanView(false);}
      }}>
      {cleanView && <button type="button" className="sr-only" onClick={() => setCleanView(false)}>Show controls</button>}
      {!cleanView && <>
      <header ref={header} className="home-header sticky top-0 z-20 border-b border-white/10 bg-bg/95 px-2 pt-[calc(env(safe-area-inset-top,0px)+6px)] backdrop-blur-xl">
        <div className="mx-auto max-w-3xl">
          <div className={cn('min-h-11 items-center gap-1',show('brand')?'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]':'flex flex-wrap justify-between')}>
            <div className="flex min-w-0 items-center">
              {category==='one_chance'&&<span className="px-2 text-xs font-semibold text-purple-300">One Chance</span>}
              {category!=='one_chance'&&show('filters')&&<button type="button" aria-label="Choose feed" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(true)} className="feed-choice-header"><span className="feed-choice-pill"><span>{tabs.find(t=>t.value===mode)?.label}</span><ChevronRight aria-hidden size={12} className="rotate-90"/></span></button>}
              {category!=='one_chance'&&show('tabs')&&!show('brand')&&<Segmented label="Feed" size="sm" items={tabs} value={mode} onChange={value=>{if(value==='following'&&!me)navigate('/login?next=/');else setMode(value);}} className="home-feed-tabs min-w-0"/>}
            </div>
            {show('brand')&&<Link to="/" aria-label="OJASSS home" className="ojass-header-glass"><img src="/brand/mark.png" width="22" height="22" alt=""/><span>OJASSS</span></Link>}
            <div className="home-header-actions flex min-w-0 flex-nowrap items-center justify-end gap-1 justify-self-end">
              {show('search')&&<Link to="/explore?focus=search" aria-label="Search" className="premium-header-icon"><Search aria-hidden size={17}/></Link>}
              {show('notifications')&&<Link to="/notifications" aria-label="Notifications" className="premium-header-icon"><Bell aria-hidden size={17}/>{!!unread.data?.notifications&&<span className="absolute right-2 top-2 size-1.5 rounded-full bg-brand"/>}</Link>}
              <AnnouncementHeaderIcon/>
              <button type="button" aria-label="Browse categories" aria-haspopup="dialog" aria-expanded={categoriesOpen} onClick={()=>setCategoriesOpen(true)} className={cn('home-category-trigger',category&&'is-selected')}><LayoutGrid aria-hidden size={18}/>{category&&<span className="category-active-dot"/>}</button>
<Link to="/leaderboard" aria-label="Leaderboard" title="Weekly and monthly leaders" className="premium-header-icon"><span className="leaderboard-shine flex size-8 items-center justify-center rounded-xl"><Trophy size={18}/></span></Link>
            </div>
          </div>
          {category!=='one_chance'&&show('brand')&&show('tabs')&&<div className="overflow-x-auto pb-1"><Segmented label="Feed" size="sm" items={tabs} value={mode} onChange={v=>{if(v==='following'&&!me)navigate('/login?next=/');else setMode(v);}}/></div>}
          {category!=='one_chance'&&<nav ref={el=>{const on=el?.querySelector<HTMLElement>('.is-on');if(el&&on)el.scrollLeft=on.offsetLeft-el.clientWidth/2+on.offsetWidth/2;}} aria-label="Categories" className="home-cat-strip">
            <button type="button" aria-pressed={!category} className={cn(!category&&'is-on')} onClick={()=>{const n=new URLSearchParams(params);n.delete('category');setParams(n);}}><LayoutGrid aria-hidden size={13}/>All</button>
            <Link to="/tickets" className="cat-tickets"><Ticket aria-hidden size={13}/>Tickets</Link>
            <Link to="/tickets/pubs" className="cat-tickets cat-premiere"><Wine aria-hidden size={13}/>Pub Events</Link>
            <Link to="/real-estate" className="cat-tickets cat-realestate"><Building2 aria-hidden size={13}/>Real Estate</Link>
            {categories.map(c=><button type="button" key={c.value} aria-pressed={category===c.value} className={cn(category===c.value&&'is-on')} onClick={()=>filter('category',c.value)}><c.icon aria-hidden size={13}/><span>{c.label}</span></button>)}
          </nav>}
        </div>
      </header>

      <Dialog open={categoriesOpen} onClose={()=>setCategoriesOpen(false)} title="Categories" size="md" className="home-categories-sheet">
        <nav aria-label="Content categories" className="category-picker-grid">
          {categories.map(c=><button type="button" key={c.value} aria-pressed={category===c.value} onClick={()=>{filter('category',c.value);setCategoriesOpen(false);}} className={cn('category-picker-item',category===c.value&&'is-selected')}><c.icon aria-hidden size={18}/><span>{c.label}</span></button>)}
        </nav>
        {show('filters')&&<button type="button" onClick={()=>{setCategoriesOpen(false);setFiltersOpen(true);}} className="category-picker-item mt-3 w-full"><span className="flex-1">Browse feed filters</span><ChevronRight aria-hidden size={15}/></button>}
        {me&&<button type="button" className="mt-3 min-h-11 w-full rounded-xl bg-brand-gradient text-xs font-semibold text-white" onClick={()=>{setCategoriesOpen(false);navigate('/categories?next='+encodeURIComponent(window.location.pathname+window.location.search));}}>Personalize my feed</button>}
        
      </Dialog>
      <Dialog open={filtersOpen} onClose={()=>setFiltersOpen(false)} title="Browse reels" size="sm">
        <div className="space-y-4">
          <Link to="/challenges" onClick={()=>setFiltersOpen(false)} aria-label="Daily Hunt" className="daily-hunt-menu-link"><span className="daily-hunt-pill"><Flame aria-hidden size={16}/><span className="flex-1">Daily Hunt</span><span className="daily-hunt-new" aria-hidden>NEW</span><ChevronRight aria-hidden size={14}/></span></Link>
          {me&&<div className="feed-city"><span>📍 My City</span><div><button type="button" aria-pressed={!city} onClick={()=>{const n=new URLSearchParams(params);n.delete('city');setParams(n,{replace:true});}}>All cities</button>{me.city?<button type="button" aria-pressed={!!city} onClick={()=>{const n=new URLSearchParams(params);n.set('city',me.city!);setParams(n,{replace:true});setFiltersOpen(false);}}>{me.city}</button>:null}<Link to="/my-city" onClick={()=>setFiltersOpen(false)}>{me.city?'Change':'Choose city'}</Link></div></div>}
          <Segmented label="Feed" items={tabs} value={mode} onChange={v=>{if(v==='following'&&!me)navigate('/login?next=/');else setMode(v);}}/>
          <label className="block space-y-1 text-sm"><span>Category</span><Select aria-label="Category" value={category??''} onChange={e=>filter('category',e.target.value)}><option value="" disabled>Choose category</option>{categories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</Select></label>
          <RegionPicker label="Country" value={country??'ALL'} onChange={v=>filter('country',v)} options={[{value:'ALL',label:'All countries'},...COUNTRIES]}/>
          <RegionPicker label="Language" value={language??''} onChange={v=>filter('language',v)} options={LANGUAGES} emptyLabel="All languages"/>
          <button type="button" onClick={()=>setFiltersOpen(false)} className="h-11 w-full rounded-xl bg-brand-gradient text-sm font-semibold text-white">Done</button>
        </div>
      </Dialog>
      </>}

      <VideoFeed
        viralOnly={category==='one_chance'}
        key={`${sharedPostId??"feed"}:${mode}:${category??""}:${country??""}:${language??""}:${me?.id??"anon"}`}
        autoScroll={autoScroll}
        query={displayQuery}
        cleanView={cleanView}
        emptyTitle={category==='one_chance'?'No Viral videos yet':mode === 'following' ? 'Nothing from creators you follow yet' : 'No posts yet'}
        emptyDescription={category==='one_chance'?'Videos from eligible categories can enter One Chance after reaching the Viral targets and completing payment or the waiting period.':country || language || category ? 'No posts match these filters yet. Choose All countries and All languages to see everything.' : mode === 'following' ? 'Respect creators and their posts will appear here.' : 'Be the first to share a video or poster on OJASSS.'}
      />


    </div>
  );
}
