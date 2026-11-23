import { useQuery } from '@tanstack/react-query';

export function parseCoordinates(value: string): [number,number] | null {
  const m=value.match(/^(\d+(?:\.\d+)?)° ([NS]), (\d+(?:\.\d+)?)° ([EW])$/);
  if(!m)return null;
  const lat=Number(m[1])*(m[2]==='S'?-1:1),lng=Number(m[3])*(m[4]==='W'?-1:1);
  return Math.abs(lat)<=90&&Math.abs(lng)<=180?[lat,lng]:null;
}
export function placeName(results: {address_components?:{long_name:string;types:string[]}[]}[]): string {
  const parts=results.flatMap(r=>r.address_components??[]);
  const find=(types:string[])=>types.map(t=>parts.find(p=>p.types.includes(t))?.long_name).find(Boolean);
  return [...new Set([find(['locality','postal_town','administrative_area_level_3','administrative_area_level_2']),find(['administrative_area_level_1']),find(['country'])].filter(Boolean))].join(', ');
}
export async function resolvePlace(latitude:number,longitude:number): Promise<string> {
  const key=window.OJASSS_CONFIG?.mapsEmbedApiKey;
  if(typeof key!=='string'||!key)throw new Error('Location lookup is unavailable.');
  const params=new URLSearchParams({latlng:`${latitude.toFixed(2)},${longitude.toFixed(2)}`,key,language:'en'});
  const res=await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`,{signal:AbortSignal.timeout(10000)});
  const data=await res.json();
  const name=data.status==='OK'?placeName(data.results??[]):'';
  if(!name)throw new Error('Could not find a place name.');
  return name;
}
export function usePlaceLabel(location:string|null|undefined) {
  const coords=parseCoordinates(location??'');
  const query=useQuery({queryKey:['place-name',location],queryFn:()=>resolvePlace(coords![0],coords![1]),enabled:!!coords,staleTime:Infinity,retry:false});
  return coords ? query.data??(query.isError?'Location added':'Finding location…') : location;
}
