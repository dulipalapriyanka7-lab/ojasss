import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ArrowLeft, Ban, Check, CheckCheck, MessageCircle, Send, Users, WifiOff, SmilePlus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { messages, type ConversationSummary, type Message } from '@/api';
import { ButtonLink, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/Feedback';
import { Avatar, VerifiedMark } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useConversationStream } from '@/hooks/useRealtime';
import {useGroupPresence} from '@/hooks/useGroupPresence';
import {ViralCreatorsChat} from '@/components/chat/ViralCreatorsChat';
import { time, timeAgo } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { cn, useIsDesktop } from '@/lib/utils';
import './messages-slim.css';

type Pages = InfiniteData<Message[], string | null>;

function ConversationList({ activeId }: { activeId?: string }) {
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => messages.conversations({ limit: 50 }), refetchInterval: 30_000 });
  return (
    <div className="flex h-full flex-col">
      <h1 className="msg-title px-4 pt-4 pb-2 text-lg font-bold tracking-tight">Messages</h1>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isPending ? (
          <ul className="space-y-1 px-2">{Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 p-2"><Skeleton className="size-12 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-48" /></div></li>
          ))}</ul>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : q.data.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No messages yet" description="Start a conversation from any creator's profile." action={<ButtonLink to="/explore" variant="secondary">Find creators</ButtonLink>} compact />
        ) : (
          <ul className="px-2 pb-4">
            {q.data.map((c: ConversationSummary) => (
              <li key={c.id}>
                <Link
                  to={`/messages/${c.id}`}
                  aria-current={activeId === c.id ? 'page' : undefined}
                  className={cn('msg-row flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors', activeId === c.id ? 'bg-surface-2' : 'hover:bg-surface-2/70')}
                >
                  {c.is_group?<span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white"><Users size={17}/></span>:<Avatar path={c.other_avatar_path} name={c.other_display_name || c.other_username} size={40} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className={cn('truncate text-[14px]', c.unread_count > 0 ? 'font-bold' : 'font-semibold')}>{c.other_display_name || c.other_username}</span>
                      {c.other_verified && <VerifiedMark size={14} />}
                      <span className="ml-auto shrink-0 text-[11px] text-fg-3">{timeAgo(c.last_message_at)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn('truncate text-[13px]', c.unread_count > 0 ? 'font-medium text-fg' : 'text-fg-3')}>
                        {c.is_blocked ? 'Blocked' : c.last_message_preview}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-on-brand">
                          {c.unread_count}<span className="sr-only"> unread</span>
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Thread({ id }: { id: string }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [body, setBody] = useState('');
  const [emojiOpen,setEmojiOpen]=useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<number | undefined>(undefined);
  const key = ['messages', id];

  const convo = useQuery({ queryKey: ['conversation', id], queryFn: () => messages.conversation(id) });
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => messages.history(id, pageParam, 40),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.length === 40 ? last[last.length - 1].created_at : undefined),
  });
  // Pages are newest-first; render oldest-first.
  const list = (q.data?.pages.flat() ?? []).slice().reverse();

  const upsert = useCallback((m: Message) => {
    qc.setQueryData<Pages>(key, (d) => {
      if (!d) return d;
      const exists = d.pages.some((p) => p.some((x) => x.id === m.id));
      if (exists) return { ...d, pages: d.pages.map((p) => p.map((x) => (x.id === m.id ? m : x))) };
      return { ...d, pages: [[m, ...d.pages[0]], ...d.pages.slice(1)] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, id]);

  const markRead = useCallback(() => {
    void messages.markRead(id).then(() => {
      void qc.invalidateQueries({ queryKey: ['unread'] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    }).catch(() => undefined);
  }, [id, qc]);

  const { status, sendTyping } = useConversationStream(id, me?.id ?? null, {
    onMessage: (m) => {
      upsert(m);
      if (m.sender_id !== me?.id) {
        setTyping(false);
        markRead();
      }
    },
    onRead: upsert,
    onTyping: () => {
      setTyping(true);
      window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => setTyping(false), 3500);
    },
  });

  useEffect(() => {
    markRead();
  }, [markRead]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [list.length, typing]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120 && q.hasNextPage && !q.isFetchingNextPage) {
      const prevHeight = el.scrollHeight;
      void q.fetchNextPage().then(() => requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevHeight + el.scrollTop;
      }));
    }
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    stickToBottom.current = true;
    try {
      const m = await messages.send(id, text);
      upsert(m);
      setBody('');
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  };

  const other = convo.data?.other;
  const group = !!convo.data?.is_group;
  const presence=useGroupPresence(id,false,body);
  const canMessage = convo.data?.can_message ?? true;
  useSeo({ title: group ? (convo.data?.group_name??'Group chat') : other ? `Chat with @${other.username}` : 'Messages', noindex: true });

  if (convo.isError) return <div className="p-6"><ErrorState error={convo.error} onRetry={() => void convo.refetch()} /></div>;

  if(group)return <ViralCreatorsChat id={id} list={list} body={body} onBody={setBody} onSend={send} sending={sending} canMessage={canMessage} loading={q.isPending} error={q.isError} onRetry={()=>void q.refetch()} scroller={scroller} onScroll={onScroll} loadingOlder={q.isFetchingNextPage}/>;

  return (
    <div className={cn('flex h-full flex-col',group&&'premium-group-chat')}>
      <header className="group-chat-header msg-head flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 sm:px-4">
        <IconButton label="Back to conversations" className="lg:hidden" onClick={() => navigate('/messages')}><ArrowLeft size={22} /></IconButton>
        {other ? (
          group?<div className="group-chat-identity flex min-w-0 items-center gap-3"><span className="group-chat-avatar" aria-hidden><Users size={17}/></span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 font-semibold"><span className="truncate">{convo.data?.group_name||'One Chance Leaders'}</span></span>
              <span className="group-chat-presence"><span className="group-online-avatars" aria-hidden>{presence.data?.members.slice(0,3).map(member=><Avatar key={member.id} path={member.avatar_path??null} name={member.display_name||member.username} size={18}/>)}</span><span>{presence.data?`${presence.data.online_count} online · ${presence.data.member_count} members`:'Connecting…'}</span></span>
              {!!presence.data?.typing.length&&<span className="block text-xs text-purple-300">{presence.data.typing[0].display_name||presence.data.typing[0].username}{presence.data.typing.length>1?` and ${presence.data.typing.length-1} others`:''} typing…</span>}
            </span>
          </div>:<Link to={`/profile/${other.username}`} className="flex min-w-0 items-center gap-3 rounded-xl p-1 hover:bg-surface-2"><Avatar path={other.avatar_path} name={other.display_name || other.username} size={34} /><span className="min-w-0"><span className="flex items-center gap-1 font-semibold"><span className="truncate">{other.display_name || other.username}</span>{other.is_verified && <VerifiedMark size={14} />}</span><span className="block text-xs text-fg-3">{typing ? <span className="text-brand-ink">typing…</span> : `@${other.username}`}</span></span></Link>
        ) : <Skeleton className="h-10 w-48" />}
        {status !== 'live' && status !== 'connecting' && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning" role="status">
            <WifiOff aria-hidden size={13} /> Reconnecting…
          </span>
        )}
      </header>

      <div ref={scroller} onScroll={onScroll} className="msg-thread min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6" aria-live="polite" aria-label="Messages">
        {q.isFetchingNextPage && <div className="flex justify-center pb-3"><Spinner size={18} /></div>}
        {q.isPending ? (
          <div className="space-y-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className={cn('h-10 rounded-2xl', i % 2 ? 'ml-auto w-1/2' : 'w-2/3')} />)}</div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : list.length === 0 ? (
          <EmptyState icon={MessageCircle} title="Say hello" description="Messages are private between you and this person. Be respectful." compact />
        ) : (
          <ol className="space-y-1.5">
            {list.map((m, i) => {
              const mine = m.sender_id === me?.id;
              const showDay = i === 0 || new Date(m.created_at).toDateString() !== new Date(list[i - 1].created_at).toDateString();
              const nextSame = list[i + 1]?.sender_id === m.sender_id;
              return (
                <li key={m.id}>
                  {showDay && (
                    <p className="msg-day my-3 text-center text-[11px] font-medium text-fg-3">
                      {new Date(m.created_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                  )}
                  <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'chat-message-bubble max-w-[78%] rounded-2xl px-3 py-1.5 text-[14px] leading-snug break-words whitespace-pre-wrap',
                      mine?'chat-message-mine':'chat-message-other',
                      mine ? 'bg-brand-gradient text-white' : 'bg-surface-2 text-fg',
                      mine ? (nextSame ? 'rounded-br-md' : 'rounded-br-sm') : nextSame ? 'rounded-bl-md' : 'rounded-bl-sm',
                    )}>
                      {m.body}
                      <span className={cn('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-white/75' : 'text-fg-3')}>
                        {time(m.created_at)}
                        {mine && (m.read_at
                          ? <CheckCheck aria-label="Read" size={13} />
                          : <Check aria-label="Sent" size={13} />)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {typing && (
          <div className="mt-2 flex" aria-label="Typing">
            <span className="flex gap-1 rounded-3xl bg-surface-2 px-4 py-3">
              {[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-fg-3" style={{ animationDelay: `${d * 120}ms` }} />)}
            </span>
          </div>
        )}
      </div>

      {canMessage ? (
        <form onSubmit={send} className="group-chat-composer msg-composer relative flex items-end gap-2 border-t border-line px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {group&&<><button type="button" className="chat-emoji-toggle" aria-label="Choose emoji" aria-expanded={emojiOpen} onClick={()=>setEmojiOpen(!emojiOpen)}><SmilePlus size={20}/></button>{emojiOpen&&<div className="chat-emoji-picker" role="group" aria-label="Quick emojis">{['❤️','😂','🔥','👍','😮','😢','🎉','😍','🙏','👏','😊','✨'].map(emoji=><button type="button" key={emoji} aria-label={`Insert ${emoji}`} onClick={()=>{setBody(text=>text+emoji);setEmojiOpen(false);document.getElementById('message-input')?.focus();}}>{emoji}</button>)}</div>}</>}
          <label htmlFor="message-input" className="sr-only">Message</label>
          <textarea
            id="message-input"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (Date.now() - lastTypingSent.current > 2500) {
                lastTypingSent.current = Date.now();
                sendTyping();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message…"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-line bg-surface-2 px-3.5 py-2 text-[14px] outline-none placeholder:text-fg-3 focus:border-brand"
          />
          <IconButton label="Send message" type="submit" size="lg" disabled={!body.trim() || sending} className="bg-brand text-on-brand hover:bg-brand disabled:bg-surface-2 disabled:text-fg-3">
            <Send size={20} />
          </IconButton>
        </form>
      ) : (
        <p className="flex items-center justify-center gap-2 border-t border-line p-4 text-sm text-fg-3"><Ban aria-hidden size={16} /> You can't message this person.</p>
      )}
    </div>
  );
}

export default function MessagesPage() {
  const { conversationId } = useParams();
  const desktop = useIsDesktop();
  useSeo({ title: 'Messages', noindex: true });

  return (
    <div className={conversationId==='one-chance-leaders'?'h-svh':'h-[calc(100svh-56px-64px-env(safe-area-inset-bottom))] md:h-svh'}>
      <div className="mx-auto flex h-full max-w-6xl border-line lg:border-x">
        <div className={cn('h-full w-full border-line lg:w-[360px] lg:shrink-0 lg:border-r', conversationId && !desktop && 'hidden')}>
          <ConversationList activeId={conversationId} />
        </div>
        <div className={cn('h-full min-w-0 flex-1', !conversationId && !desktop && 'hidden')}>
          {conversationId ? (
            <Thread key={conversationId} id={conversationId} />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState icon={MessageCircle} title="Your messages" description="Choose a conversation or start one from a creator's profile." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
