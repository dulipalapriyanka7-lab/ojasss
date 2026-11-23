import {useQuery} from '@tanstack/react-query';
import {Coins, Gamepad2, Heart, ShoppingBag} from 'lucide-react';
import {Link} from 'react-router-dom';
import {coins, coinTypeLabel} from '@/api/coins';
import {useSeo} from '@/lib/seo';
import './coins.css';

/** Game coin wallet: 1 coin = ₹1, spend on Business products and One Chance votes. Not withdrawable. */
export default function CoinsPage(){
 useSeo({title:'Game coins',noindex:true});
 const q=useQuery({queryKey:['coins'],queryFn:coins.wallet});
 const bal=q.data?.coins??0;
 return <main className="gc">
  <section className="gc-hero"><Coins size={26}/><div><small>Game coin wallet</small><b>{bal.toLocaleString('en-IN')}</b><span>= ₹{bal.toLocaleString('en-IN')} to spend · 1 coin = ₹1</span></div></section>
  <p className="gc-note">Coins are earned from verified game results. They can't be withdrawn as cash, but you can spend them inside OJASSS.</p>
  <div className="gc-use">
   <Link to="/explore"><ShoppingBag size={18}/><b>Business</b><span>Buy products</span></Link>
   <Link to="/?category=one_chance"><Heart size={18}/><b>One Chance</b><span>Unlock video votes</span></Link>
   <Link to="/games"><Gamepad2 size={18}/><b>Play</b><span>Earn coins</span></Link>
  </div>
  <h2 className="gc-h">History</h2>
  {q.isLoading&&<p className="gc-empty">Loading…</p>}
  {q.data&&!q.data.history.length&&<p className="gc-empty">No coin activity yet.</p>}
  <ul className="gc-list">{q.data?.history.map(m=><li key={m.id}><div><b>{coinTypeLabel[m.type]??m.type}</b><span>{m.note} · {new Date(m.created_at).toLocaleDateString('en-IN')}</span></div><strong className={m.delta>0?'is-in':'is-out'}>{m.delta>0?'+':''}{m.delta}</strong></li>)}</ul>
 </main>;
}
