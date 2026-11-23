import {CATEGORIES} from '@/lib/constants';
import type {PublicSettings} from '@/api';
import {usePublicSettings} from './usePostActions';
export function configuredCategories(settings?:PublicSettings,includeHidden=false){
 const config=settings?.['categories.config'];
 return CATEGORIES.map(c=>({...c,...config?.[c.value]})).filter(c=>includeHidden||(!c.deleted&&c.enabled!==false));
}
export function useCategories(){const {data}=usePublicSettings();return configuredCategories(data);}

export function useCategoryLabel(){const {data}=usePublicSettings();return (id:string)=>data?.['categories.config']?.[id as keyof NonNullable<PublicSettings['categories.config']>]?.label??CATEGORIES.find(c=>c.value===id)?.label??id;}
