import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { AppNotification, Message } from '@/api';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';

export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

let topicSeq = 0;

/**
 * Subscribe to a channel with automatic reconnect (exponential backoff) and a status
 * the UI can surface. Supabase realtime enforces RLS, so users only receive their rows.
 */
export function useChannel(name: string | null, setup: (ch: RealtimeChannel) => RealtimeChannel): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const setupRef = useRef(setup);
  useEffect(() => {
    setupRef.current = setup;
  }, [setup]);

  useEffect(() => {
    if (!name) return;
    if (env.mysql) {
      const refresh = () => {
        setStatus(navigator.onLine ? 'live' : 'offline');
        if (navigator.onLine && document.visibilityState === 'visible') {
          void qc.invalidateQueries({ predicate: (query) => ['notifications', 'unread', 'messages', 'conversations', 'conversation', 'earnings'].includes(String(query.queryKey[0])) });
        }
      };
      refresh();
      const timer = window.setInterval(refresh, 8000);
      window.addEventListener('online', refresh);
      return () => { window.clearInterval(timer); window.removeEventListener('online', refresh); };
    }
    let channel: RealtimeChannel | null = null;
    let attempt = 0;
    let timer: number | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      // supabase.channel() returns an existing channel with the same topic, and removal is
      // async — so every connection needs a fresh topic or .on() throws "after subscribe()".
      const ch = setupRef.current(supabase.channel(`${name}:${++topicSeq}`));
      channel = ch;
      ch.subscribe((s) => {
        // Ignore events from superseded channels (removeChannel itself emits CLOSED).
        if (disposed || ch !== channel) return;
        if (s === 'SUBSCRIBED') {
          attempt = 0;
          setStatus('live');
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setStatus(navigator.onLine ? 'reconnecting' : 'offline');
          channel = null;
          void supabase.removeChannel(ch);
          attempt += 1;
          timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
        }
      });
    };
    connect();
    const online = () => {
      if (!channel) {
        window.clearTimeout(timer);
        connect();
      }
    };
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener('online', online);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };
  }, [name, qc]);

  return status;
}

/** Global: live notifications + unread badge refresh for the signed-in user. */
export function useNotificationStream(userId: string | null, onNew?: (n: AppNotification) => void) {
  const qc = useQueryClient();
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);
  return useChannel(userId ? `notifications:${userId}` : null, (ch) =>
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
      void qc.invalidateQueries({ queryKey: ['unread'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      const row = payload.new as AppNotification;
      if (row.type === 'message') void qc.invalidateQueries({ queryKey: ['conversations'] });
      if (row.type === 'reward' || row.type === 'withdrawal') void qc.invalidateQueries({ queryKey: ['earnings'] });
      onNewRef.current?.(row);
    }),
  );
}

/** Per-conversation: new messages, read receipts and typing (broadcast, not stored). */
export function useConversationStream(
  conversationId: string | null,
  userId: string | null,
  handlers: { onMessage: (m: Message) => void; onRead: (m: Message) => void; onTyping: (userId: string) => void },
) {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  }, [handlers]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const status = useChannel(conversationId ? `conversation:${conversationId}` : null, (ch) => {
    channelRef.current = ch;
    return ch
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (p) => h.current.onMessage(p.new as Message))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (p) => h.current.onRead(p.new as Message))
      .on('broadcast', { event: 'typing' }, (p) => {
        const from = (p.payload as { userId?: string }).userId;
        if (from && from !== userId) h.current.onTyping(from);
      });
  });
  const sendTyping = () => {
    if (status === 'live' && userId) void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId } });
  };
  return { status, sendTyping };
}
