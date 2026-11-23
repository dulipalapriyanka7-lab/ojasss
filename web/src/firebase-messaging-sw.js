import { initializeApp } from '@firebase/app';
import { getMessaging } from '@firebase/messaging/sw';
import { firebaseConfig } from '/api/firebase-worker-config';
import {notificationDestination} from './lib/notificationLink';
self.addEventListener('notificationclick',event=>{
 const payload=event.notification.data?.FCM_MSG??event.notification.data??{};
 const destination=notificationDestination(payload.data?.link??payload.fcmOptions?.link??payload.link,self.location.origin);
 if(!destination)return;
 event.stopImmediatePropagation();event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>new URL(client.url).origin===new URL(destination).origin);
  if(existing){try{const target=await existing.navigate(destination);if(target){await target.focus();return;}}catch{/* The tab may have closed during the tap. */}}
  await self.clients.openWindow(destination);
 })());
});
if (firebaseConfig) getMessaging(initializeApp(firebaseConfig));
