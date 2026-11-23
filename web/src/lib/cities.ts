export type City={name:string;icon:string;img?:string;bg:string;lat:number;lng:number;popular?:boolean};
/** Popular cities shown as picture cards; the search also accepts any other city name. */
export const CITIES:City[]=[
 {name:'Vijayawada',img:'/cities/vijayawada.jpg',icon:'🛕',bg:'linear-gradient(160deg,#1e1b4b 0%,#7c2d12 55%,#f59e0b 100%)',lat:16.5062,lng:80.648,popular:true},
 {name:'Guntur',img:'/cities/guntur.jpg',icon:'🕰️',bg:'linear-gradient(160deg,#0c4a6e 0%,#0284c7 55%,#bae6fd 100%)',lat:16.3067,lng:80.4365,popular:true},
 {name:'Vizag',img:'/cities/vizag.jpg',icon:'🏖️',bg:'linear-gradient(160deg,#0369a1 0%,#06b6d4 55%,#fde68a 100%)',lat:17.6868,lng:83.2185,popular:true},
 {name:'Hyderabad',img:'/cities/hyderabad.jpg',icon:'🕌',bg:'linear-gradient(160deg,#431407 0%,#c2410c 55%,#fdba74 100%)',lat:17.385,lng:78.4867,popular:true},
 {name:'Amaravati',img:'/cities/amaravati.jpg',icon:'🧘',bg:'linear-gradient(160deg,#14532d 0%,#16a34a 55%,#bbf7d0 100%)',lat:16.5131,lng:80.5165,popular:true},
 {name:'Bengaluru',img:'/cities/bengaluru.jpg',icon:'🏛️',bg:'linear-gradient(160deg,#1e3a8a 0%,#6366f1 55%,#fef3c7 100%)',lat:12.9716,lng:77.5946,popular:true},
 {name:'Tirupati',icon:'🙏',bg:'linear-gradient(160deg,#4a044e,#c026d3)',lat:13.6288,lng:79.4192},
 {name:'Nellore',icon:'🌾',bg:'linear-gradient(160deg,#365314,#84cc16)',lat:14.4426,lng:79.9865},
 {name:'Rajahmundry',icon:'🌉',bg:'linear-gradient(160deg,#164e63,#0891b2)',lat:17.0005,lng:81.804},
 {name:'Kakinada',icon:'⚓',bg:'linear-gradient(160deg,#1e3a8a,#3b82f6)',lat:16.9891,lng:82.2475},
 {name:'Kurnool',icon:'🏰',bg:'linear-gradient(160deg,#78350f,#d97706)',lat:15.8281,lng:78.0373},
 {name:'Ongole',icon:'🐂',bg:'linear-gradient(160deg,#3f3f46,#a1a1aa)',lat:15.5057,lng:80.0499},
 {name:'Eluru',icon:'🏞️',bg:'linear-gradient(160deg,#064e3b,#10b981)',lat:16.7107,lng:81.0952},
 {name:'Warangal',icon:'🏯',bg:'linear-gradient(160deg,#7f1d1d,#ef4444)',lat:17.9689,lng:79.5941},
 {name:'Chennai',icon:'🌊',bg:'linear-gradient(160deg,#0c4a6e,#38bdf8)',lat:13.0827,lng:80.2707},
 {name:'Mumbai',icon:'🌆',bg:'linear-gradient(160deg,#312e81,#8b5cf6)',lat:19.076,lng:72.8777},
 {name:'Delhi',icon:'🕌',bg:'linear-gradient(160deg,#7c2d12,#f97316)',lat:28.6139,lng:77.209},
 {name:'Pune',icon:'⛰️',bg:'linear-gradient(160deg,#3b0764,#a855f7)',lat:18.5204,lng:73.8567},
];
export function nearestCity(lat:number,lng:number):City{
 let best=CITIES[0],d=Infinity;
 for(const c of CITIES){const x=(c.lat-lat)**2+((c.lng-lng)*Math.cos(lat*Math.PI/180))**2;if(x<d){d=x;best=c;}}
 return best;
}
