import {Cpu, Gem, GraduationCap, Home, LayoutGrid, Recycle, Shirt, ShoppingBasket, UtensilsCrossed, type LucideIcon} from 'lucide-react';
import type {BizCategory} from '@/api/business';
export const BIZ_CATS:{value:BizCategory|'all';label:string;icon:LucideIcon;hue:string}[]=[
 {value:'all',label:'All',icon:LayoutGrid,hue:'#a855f7'},
 {value:'gold_silver',label:'Gold & Silver',icon:Gem,hue:'#f5b941'},
 {value:'electronics',label:'Electronics',icon:Cpu,hue:'#38bdf8'},
 {value:'fashion',label:'Fashion',icon:Shirt,hue:'#f472b6'},
 {value:'food_kitchen',label:'Food & Kitchen',icon:UtensilsCrossed,hue:'#fb923c'},
 {value:'education',label:'Education',icon:GraduationCap,hue:'#60a5fa'},
 {value:'refurbished',label:'Refurbished',icon:Recycle,hue:'#34d399'},
 {value:'real_estate',label:'Real Estate',icon:Home,hue:'#f87171'},
 {value:'daily_needs',label:'Daily Needs',icon:ShoppingBasket,hue:'#facc15'},
];
