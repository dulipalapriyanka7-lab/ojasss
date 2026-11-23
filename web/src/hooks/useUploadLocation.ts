import { resolvePlace } from '@/lib/location';
import { useCallback, useEffect, useRef, useState } from 'react';

export function approximateLocation(latitude: number, longitude: number): string {
  return `${Math.abs(latitude).toFixed(2)}° ${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(2)}° ${longitude < 0 ? 'W' : 'E'}`;
}

export function useUploadLocation(enabled: boolean, onDetected: (location: string) => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requested = useRef(false);
  const generation = useRef(0);
  const detect = useCallback(() => {
    const request = ++generation.current;
    if (!navigator.geolocation) { setMessage('Location is unavailable. You can enter it manually.'); return; }
    setBusy(true);setMessage('');
    navigator.geolocation.getCurrentPosition(async position => {
      if (generation.current !== request) return;
      setMessage('Finding your city…');
      try {
        const name=await resolvePlace(position.coords.latitude,position.coords.longitude);
        if(generation.current!==request)return;
        onDetected(name);setBusy(false);setMessage('Location added. You can edit or remove it.');
      } catch {
        if(generation.current!==request)return;
        setBusy(false);setMessage('Could not find your city. Enter a location manually or continue without one.');
      }
    },error => {
      if (generation.current !== request) return;
      setBusy(false);setMessage(error.code === 1 ? 'Location permission was not granted. Add a location manually or continue without one.' : 'Could not detect location. Enter it manually or try again.');
    },{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
  },[onDetected]);
  useEffect(()=>{if(enabled&&!requested.current){requested.current=true;detect();}},[enabled,detect]);
  useEffect(()=>()=>{generation.current++;requested.current=false;},[]);
  const markEdited = () => { generation.current++;setBusy(false);setMessage(''); };
  return {busy,message,detect,markEdited};
}
