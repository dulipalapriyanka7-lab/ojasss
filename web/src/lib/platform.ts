// Bridge to the OJASSS Android shell. The shell exposes a single `OjasssNative` object via
// WebViewCompat.addWebMessageListener, restricted to https://ojasss.com — there is no
// addJavascriptInterface and no arbitrary method surface. Messages are small JSON commands.

interface NativePort {
  postMessage(message: string): void;
  addEventListener?(type: 'message', listener: (e: { data: string }) => void): void;
  onmessage?: ((e: { data: string }) => void) | null;
}

declare global {
  interface Window {
    OjasssNative?: NativePort;
  }
}

export type NativeEvent =
  | {type:'back'}
  | {type:'speech_capabilities';requestId:string;available:boolean;internal?:boolean}
  | {type:'speech_partial';requestId:string;text:string}
  | {type:'speech_result';requestId:string;text?:string;error?:string}
  | { type: 'push_token'; token: string }
  | { type: 'deep_link'; path: string }
  | { type: 'network'; online: boolean }
  | { type: 'game_immersive'; enabled: boolean }
  | { type: 'resume' };

const listeners = new Set<(e: NativeEvent) => void>();
let wired = false;

function wire() {
  if (wired || !window.OjasssNative) return;
  wired = true;
  const handler = (e: { data: string }) => {
    try {
      const evt = JSON.parse(e.data) as NativeEvent;
      listeners.forEach((l) => l(evt));
    } catch {
      /* ignore malformed native messages */
    }
  };
  if (window.OjasssNative.addEventListener) window.OjasssNative.addEventListener('message', handler);
  else window.OjasssNative.onmessage = handler;
}

export const platform = {
  /** True inside the OJASSS Android app. */
  isAndroidApp: () => typeof window !== 'undefined' && (!!window.OjasssNative || /\bOjasssAndroid\//.test(navigator.userAgent)),

  send(command: { type: string; [k: string]: unknown }) {
    window.OjasssNative?.postMessage(JSON.stringify(command));
  },

  on(listener: (e: NativeEvent) => void): () => void {
    wire();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Native share sheet on Android, Web Share API or clipboard elsewhere. Returns how it was shared. */
  async share(data: { title: string; text?: string; url: string }): Promise<'native' | 'web' | 'copied' | 'cancelled'> {
    if (window.OjasssNative) {
      platform.send({ type: 'share', ...data });
      return 'native';
    }
    if (navigator.share) {
      try {
        await navigator.share(data);
        return 'web';
      } catch (error) {
        if(error instanceof DOMException&&error.name==='AbortError')return 'cancelled';
        // Unsupported sharing and permission failures still allow copying the link.
      }
    }
    if(!navigator.clipboard?.writeText)throw new Error('Link copying is unavailable in this browser. Open OJASSS in Chrome and try again.');
    await navigator.clipboard.writeText(data.url);
    return 'copied';
  },

  /** External destinations (CTA links, WhatsApp, tel:) open outside the app. */
  openExternal(url: string) {
    if (window.OjasssNative) platform.send({ type: 'open_external', url });
    else window.open(url, '_blank', 'noopener,noreferrer');
  },

  haptic(kind: 'light' | 'medium' | 'success' = 'light') {
    if (window.OjasssNative) platform.send({ type: 'haptic', kind });
    else navigator.vibrate?.(kind === 'light' ? 8 : 16);
  },

  /** Ask the shell for an FCM token (answered with a `push_token` event). */
  requestPushToken() {
    platform.send({ type: 'request_push_token' });
  },

  /** Tell the shell which top-level screen is shown (drives the Android back button). */
  setRoute(path: string, canGoBack: boolean) {
    platform.send({ type: 'route', path, canGoBack });
  },
};
