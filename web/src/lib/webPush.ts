import { initializeApp, getApps, getApp, type FirebaseOptions } from '@firebase/app';
import { getMessaging, getToken, isSupported, onMessage } from '@firebase/messaging';
import { notifications } from '@/api';

type PushConfig = { configured: boolean; firebaseConfig?: FirebaseOptions; vapidKey?: string };
async function configuration(): Promise<PushConfig> {
  const response = await fetch('/api/firebase-config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Notification setup is unavailable.');
  return response.json() as Promise<PushConfig>;
}
export async function enableWebPush(requestPermission = true): Promise<() => void> {
  if (!('Notification' in window) || !await isSupported()) throw new Error('This browser does not support push notifications.');
  const config = await configuration();
  if (!config.configured || !config.firebaseConfig || !config.vapidKey) throw new Error('Push notifications are being configured. Please try again shortly.');
  const permission = requestPermission ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') throw new Error('Allow notifications in your browser’s site settings to receive updates.');
  const app = getApps().length ? getApp() : initializeApp(config.firebaseConfig);
  const messaging = getMessaging(app);
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { type: 'module', scope: '/firebase-cloud-messaging-push-scope' });
  if (!registration.active) await new Promise<void>((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) return reject(new Error('Could not start notifications.'));
    const timeout = window.setTimeout(() => reject(new Error('Notification setup timed out. Please try again.')), 20000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') { window.clearTimeout(timeout); resolve(); }
      if (worker.state === 'redundant') { window.clearTimeout(timeout); reject(new Error('Could not start notifications.')); }
    });
  });
  const token = await getToken(messaging, { vapidKey: config.vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Could not register this browser for notifications.');
  await notifications.registerPushToken(token, 'web');
  return onMessage(messaging, () => window.dispatchEvent(new CustomEvent('ojasss:web-push')));
}
