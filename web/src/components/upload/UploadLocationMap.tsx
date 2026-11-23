import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MapPin } from 'lucide-react';

export function mapEmbedUrl(location: string, key: string): string | null {
  if (!location.trim() || !key) return null;
  const coordinates = location.match(/^(\d+(?:\.\d+)?)° ([NS]), (\d+(?:\.\d+)?)° ([EW])$/);
  const params = new URLSearchParams({key});
  let mode = 'place';
  if (coordinates) {
    const latitude = Number(coordinates[1]) * (coordinates[2] === 'S' ? -1 : 1);
    const longitude = Number(coordinates[3]) * (coordinates[4] === 'W' ? -1 : 1);
    if (latitude > 90 || latitude < -90 || longitude > 180 || longitude < -180) return null;
    mode = 'view'; params.set('center', `${latitude},${longitude}`); params.set('zoom','12');
  } else params.set('q', location.trim());
  return `https://www.google.com/maps/embed/v1/${mode}?${params}`;
}

export function UploadLocationMap({location}: {location: string}) {
  const [settled, setSettled] = useState(location);
  const reduced = useReducedMotion();
  useEffect(()=>{const timer=setTimeout(()=>setSettled(location),600);return()=>clearTimeout(timer);},[location]);
  const key = typeof window.OJASSS_CONFIG?.mapsEmbedApiKey === 'string' ? window.OJASSS_CONFIG.mapsEmbedApiKey : '';
  const url = mapEmbedUrl(location.trim() ? settled : '',key);
  return <motion.div initial={reduced?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:0.3}} className="overflow-hidden rounded-2xl border border-line bg-surface-2">
    {url ? <iframe key={url} title="Location preview on Google Maps" src={url} className="h-56 w-full border-0 sm:h-64" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen/> : <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-fg-3"><MapPin aria-hidden size={28}/><p className="text-sm">Use your location or enter a place to preview the map.</p></div>}
    <p className="border-t border-line px-3 py-2 text-xs text-fg-3">Google Maps previews the location you choose. Location is optional.</p>
  </motion.div>;
}
