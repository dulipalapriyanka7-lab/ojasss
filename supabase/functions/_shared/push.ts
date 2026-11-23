// FCM HTTP v1 message construction (pure) — the dispatch function handles OAuth + sending.

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
}

const CHANNEL_FOR: Record<string, string> = {
  message: 'messages',
  follow: 'social',
  comment: 'social',
  engagement: 'social',
  reward: 'earnings',
  withdrawal: 'earnings',
  announcement: 'announcements',
  system: 'system',
  complaint: 'system',
  moderation: 'system',
};

export function channelFor(type: string): string {
  return CHANNEL_FOR[type] ?? 'system';
}

/** Only same-site relative links are forwarded to the app, so a push can never open an arbitrary URL. */
export function safeLink(link: string | null): string {
  return link && /^\/[A-Za-z0-9/_\-?=&.%]*$/.test(link) && !link.startsWith('//') ? link : '/notifications';
}

export function buildFcmMessage(token: string, n: NotificationRow) {
  return {
    message: {
      token,
      notification: { title: n.title.slice(0, 140), body: n.body.slice(0, 500) },
      data: { notification_id: n.id, type: n.type, link: safeLink(n.link) },
      android: {
        priority: n.type === 'message' ? 'HIGH' : 'NORMAL',
        notification: { channel_id: channelFor(n.type), click_action: 'OPEN_OJASSS_LINK', tag: `${n.type}` },
      },
    },
  };
}
