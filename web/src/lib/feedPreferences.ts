import {useSyncExternalStore} from 'react';
const AUTO_KEY='ojasss-auto-scroll';
export function readAutoScroll():boolean {try{return localStorage.getItem(AUTO_KEY)==='1';}catch{return false;}}
export function saveAutoScroll(enabled:boolean):void {try{localStorage.setItem(AUTO_KEY,enabled?'1':'0');}catch{/* Playback preferences are optional. */}window.dispatchEvent(new Event('ojasss:auto-scroll'));}

const subscribeAuto=(listener:()=>void)=>{window.addEventListener('ojasss:auto-scroll',listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener('ojasss:auto-scroll',listener);window.removeEventListener('storage',listener);};};
export function useAutoScroll(){return useSyncExternalStore(subscribeAuto,readAutoScroll,()=>false);}
