import type { PublicSettings } from '@/api/types';
export const HOME_CONTROL_GROUPS={
  "Header": {
    "brand": true,
    "search": false,
    "notifications": false,
    "tabs": false,
    "categories": false,
    "auto": true,
    "filters": true,
    "announcements": false
  },
  "Reel text": {
    "creator": false,
    "caption": false,
    "hashtags": false,
    "category": false,
    "location": false,
    "timestamp": false,
    "region": false,
    "audio": false,
    "source": false,
    "cta": false
  },
  "Action rail": {
    "avatar": true,
    "hearts": true,
    "speak": true,
    "viral": true,
    "comments": false,
    "save": true,
    "share": true,
    "more": true
  },
  "Playback": {
    "pause": true,
    "mute": true,
    "progress": true
  },
  "Navigation": {
    "navigation": true
  }
} as const;
export const HOME_CONTROL_DEFAULTS={
  "brand": true,
  "search": false,
  "notifications": false,
  "tabs": false,
  "categories": false,
  "auto": true,
  "filters": true,
  "announcements": false,
  "creator": false,
  "caption": false,
  "hashtags": false,
  "category": false,
  "location": false,
  "timestamp": false,
  "region": false,
  "audio": false,
  "source": false,
  "cta": false,
  "avatar": true,
  "hearts": true,
  "speak": true,
  "viral": true,
  "comments": false,
  "save": true,
  "share": true,
  "more": true,
  "pause": true,
  "mute": true,
  "progress": true,
  "navigation": true
} as const;
export type HomeControl=keyof typeof HOME_CONTROL_DEFAULTS;
export const HOME_CONTROL_LABELS:Record<HomeControl,string>={
  "brand": "Centered glass logo",
  "search": "Search shortcut",
  "notifications": "Notification shortcut",
  "tabs": "Feed tabs",
  "categories": "Category strip",
  "auto": "Auto-scroll switch",
  "filters": "Filters button",
  "announcements": "Announcements",
  "creator": "Creator name and Follow",
  "caption": "Caption",
  "hashtags": "Hashtags",
  "category": "Category label",
  "location": "Location label",
  "timestamp": "Upload date and time",
  "region": "Language and country",
  "audio": "Audio credit",
  "source": "Original source link",
  "cta": "Call-to-action button",
  "avatar": "Creator avatar",
  "hearts": "Fires",
  "speak": "Speak microphone",
  "viral": "Viral power",
  "comments": "Comments",
  "save": "Save reel",
  "share": "Share",
  "more": "Three-dot menu",
  "pause": "Pause / Play button",
  "mute": "Mute button",
  "progress": "Seek bar",
  "navigation": "Home shortcuts menu"
};
export function homeControl(settings:PublicSettings|undefined,key:HomeControl):boolean {const value=settings?.['home.controls']?.[key];return typeof value==='boolean'?value:HOME_CONTROL_DEFAULTS[key];}
export function resolveHomeControls(settings:PublicSettings|undefined):Record<HomeControl,boolean>{return Object.fromEntries(Object.keys(HOME_CONTROL_DEFAULTS).map(key=>[key,homeControl(settings,key as HomeControl)])) as Record<HomeControl,boolean>;}
